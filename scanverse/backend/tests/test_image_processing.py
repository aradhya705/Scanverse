"""Tests for the core CV engine: edge detection, perspective warp,
filters, rotation, cleanup inpainting, and deskew estimation."""

import unittest

import cv2
import numpy as np

from app.services import image_processing as ip


def _synthetic_document_image(size=600, page_inset=80):
    """A dark background with a clearly lighter page rectangle (simulating a
    photo of a document). Returns (image, expected_corners)."""
    img = np.zeros((size, size, 3), dtype=np.uint8)
    img[:] = (40, 40, 50)
    page = np.full((size - 2 * page_inset, size - 2 * page_inset, 3), 240, dtype=np.uint8)
    img[page_inset : size - page_inset, page_inset : size - page_inset] = page
    # A little text-like noise so detection has features to lock onto
    cv2.putText(img, "SCANVERSE TEST DOCUMENT", (page_inset + 40, page_inset + 120),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (30, 30, 30), 2)
    expected = [[page_inset, page_inset], [size - page_inset, page_inset],
                [size - page_inset, size - page_inset], [page_inset, size - page_inset]]
    return img, expected


class DetectCornersTest(unittest.TestCase):
    def test_detects_axis_aligned_page(self):
        img, expected = _synthetic_document_image()
        corners, confidence = ip.detect_document_corners(img)
        self.assertIsNotNone(corners, "expected a detection")
        self.assertGreater(confidence, 0.5)
        # Allow ~6px tolerance (downscale + subpixel refinement)
        for got, want in zip(corners, expected):
            self.assertLess(abs(got[0] - want[0]), 8)
            self.assertLess(abs(got[1] - want[1]), 8)

    def test_default_corners_are_inset_rectangle(self):
        corners = ip.default_corners(800, 600)
        self.assertEqual(len(corners), 4)
        self.assertEqual(corners[0], [32, 24])
        self.assertEqual(corners[2], [768, 576])

    def test_detect_on_blank_image_returns_none(self):
        blank = np.zeros((300, 300, 3), dtype=np.uint8)
        corners, confidence = ip.detect_document_corners(blank)
        self.assertIsNone(corners)
        self.assertEqual(confidence, 0.0)


class WarpTest(unittest.TestCase):
    def test_warp_perspective_shape_and_straightness(self):
        img = np.full((400, 500, 3), 200, dtype=np.uint8)
        # A trapezoid that should unwarp to a rectangle. Output dims come
        # from the max edge lengths of the quad: height 300, width ~403.
        corners = [[50, 100], [450, 50], [450, 350], [50, 300]]
        warped = ip.warp_perspective(img, corners)
        self.assertLessEqual(abs(warped.shape[0] - 300), 1)
        self.assertLessEqual(abs(warped.shape[1] - 403), 3)
        self.assertEqual(warped.shape[2], 3)

    def test_warp_with_degenerate_corners_does_not_crash(self):
        img = np.zeros((100, 100, 3), dtype=np.uint8)
        # All corners at the same point — getPerspectiveTransform will still
        # produce a transform; ensure no exception escapes.
        corners = [[10, 10], [10, 10], [10, 10], [10, 10]]
        result = ip.warp_perspective(img, corners)
        self.assertEqual(result.shape, (1, 1, 3))


class FilterTest(unittest.TestCase):
    def setUp(self):
        self.img = np.random.randint(0, 255, (64, 64, 3), dtype=np.uint8)

    def test_all_presets_return_same_shape(self):
        for name in ip.FILTER_PRESETS:
            with self.subTest(filter=name):
                out = ip.apply_filter(self.img, name)
                self.assertEqual(out.shape, self.img.shape)
                self.assertEqual(out.dtype, np.uint8)

    def test_unknown_filter_falls_back_to_original(self):
        out = ip.apply_filter(self.img, "not_a_filter")
        self.assertEqual(out.shape, self.img.shape)

    def test_original_preserves_pixels(self):
        out = ip.apply_filter(self.img, "original")
        np.testing.assert_array_equal(out, self.img)

    def test_intensity_zero_returns_original(self):
        out = ip.apply_filter(self.img, "black_and_white", intensity=0.0)
        np.testing.assert_array_equal(out, self.img)

    def test_auto_enhance_changes_image(self):
        out = ip.auto_enhance(self.img)
        self.assertFalse(np.array_equal(out, self.img))


class RotationTest(unittest.TestCase):
    def test_rotation_90(self):
        img = np.zeros((20, 30, 3), dtype=np.uint8)
        rotated = ip.rotate_image(img, 90)
        self.assertEqual(rotated.shape[:2], (30, 20))

    def test_rotation_360_is_noop(self):
        img = np.random.randint(0, 255, (20, 30, 3), dtype=np.uint8)
        rotated = ip.rotate_image(img, 360)
        np.testing.assert_array_equal(rotated, img)

    def test_rotation_normalizes_negative(self):
        img = np.zeros((20, 30, 3), dtype=np.uint8)
        rotated = ip.rotate_image(img, -90)
        self.assertEqual(rotated.shape[:2], (30, 20))


class CleanupTest(unittest.TestCase):
    def test_cleanup_removes_mark(self):
        img = np.full((100, 100, 3), 255, dtype=np.uint8)
        cv2.circle(img, (50, 50), 12, (0, 0, 0), -1)
        before = img[50, 50].tolist()
        cleaned = ip.cleanup_regions(img, [[38, 38, 24, 24]])
        after = cleaned[50, 50].tolist()
        self.assertNotEqual(before, after)  # mark removed

    def test_cleanup_empty_regions_is_noop(self):
        img = np.random.randint(0, 255, (50, 50, 3), dtype=np.uint8)
        cleaned = ip.cleanup_regions(img, [])
        np.testing.assert_array_equal(cleaned, img)


class DeskewTest(unittest.TestCase):
    def test_estimate_skew_on_rotated_text(self):
        img = np.full((300, 300), 255, dtype=np.uint8)
        cv2.putText(img, "horizontal text line", (30, 150), cv2.FONT_HERSHEY_SIMPLEX,
                    0.8, (0, 0, 0), 2)
        bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        skew = ip.estimate_skew_angle(bgr)
        self.assertLess(abs(skew), 2.0)  # should be ~0 for horizontal text

    def test_deskew_keeps_shape(self):
        img = np.random.randint(0, 255, (80, 100, 3), dtype=np.uint8)
        out = ip.deskew(img, angle=2.0)
        self.assertEqual(out.shape, img.shape)


class MiscTest(unittest.TestCase):
    def test_make_thumbnail_downscales(self):
        img = np.random.randint(0, 255, (800, 600, 3), dtype=np.uint8)
        thumb = ip.make_thumbnail(img, max_size=200)
        self.assertLessEqual(max(thumb.shape[:2]), 200)

    def test_make_thumbnail_keeps_small_images(self):
        img = np.random.randint(0, 255, (50, 50, 3), dtype=np.uint8)
        thumb = ip.make_thumbnail(img, max_size=320)
        self.assertEqual(thumb.shape, img.shape)

    def test_prepare_for_ocr_changes_image(self):
        img = np.random.randint(0, 255, (80, 80, 3), dtype=np.uint8)
        out = ip.prepare_for_ocr(img)
        self.assertEqual(out.shape, img.shape)
        self.assertFalse(np.array_equal(out, img))


if __name__ == "__main__":
    unittest.main()
