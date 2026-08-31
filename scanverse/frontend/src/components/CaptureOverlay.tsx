import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, RefreshCw, X, Zap } from "lucide-react";

interface CaptureOverlayProps {
  /** Called with the captured photo (JPEG file) or a gallery image. */
  onFile: (file: File) => void;
  onClose: () => void;
}

type CamStatus = "starting" | "live" | "error";

/** Full-screen camera viewfinder (Adobe Scan style): live preview with a
 * shutter button, flash toggle (where supported), front/back camera flip,
 * and a gallery picker as the fallback. Produces a JPEG File for upload. */
export default function CaptureOverlay({ onFile, onClose }: CaptureOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<CamStatus>("starting");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const facingRef = useRef<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [flash, setFlash] = useState(false); // white shutter-flash feedback
  // Monotonic token so a stale getUserMedia promise (e.g. after a rapid
  // camera flip) never overwrites the current stream or leaks the camera.
  const requestRef = useRef(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(
    async (mode: "environment" | "user") => {
      const requestId = ++requestRef.current;
      setStatus("starting");
      setTorchOn(false);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("camera unsupported");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        // A newer startCamera call won the race — drop this stale stream.
        if (requestId !== requestRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stopStream();
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        // `torch` isn't in TypeScript's DOM typings yet — it's the standard
        // constraint name for the camera flash on supported devices.
        setTorchSupported(!!(track?.getCapabilities?.() as any)?.torch);

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          await video.play().catch(() => undefined);
        }
        setStatus("live");
      } catch {
        setStatus("error");
      }
    },
    [stopStream]
  );

  useEffect(() => {
    startCamera(facingRef.current);
    return stopStream;
  }, [startCamera, stopStream]);

  // Close on Escape (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || status !== "live") return;
    setFlash(true);
    // Brief white flash for shutter feedback, then grab the frame
    setTimeout(() => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          setFlash(false);
          if (blob) {
            onFile(new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" }));
          }
        },
        "image/jpeg",
        0.92
      );
    }, 120);
  }

  function flipCamera() {
    const next = facingMode === "environment" ? "user" : "environment";
    facingRef.current = next;
    setFacingMode(next);
    startCamera(next);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn(!torchOn);
    } catch {
      /* torch unsupported at runtime */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Viewfinder area */}
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        {flash && <div className="absolute inset-0 z-10 bg-white" />}

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4 text-white">
          <button
            onClick={onClose}
            aria-label="Close camera"
            className="rounded-full bg-white/10 p-2.5 backdrop-blur transition hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold tracking-wide">Scan document</span>
          <button
            onClick={toggleTorch}
            disabled={!torchSupported}
            aria-label="Toggle flash"
            className={`rounded-full p-2.5 backdrop-blur transition ${
              torchSupported ? "bg-white/10 hover:bg-white/25" : "opacity-30"
            }`}
          >
            <Zap className={`h-5 w-5 ${torchOn ? "fill-yellow-400 text-yellow-400" : ""}`} />
          </button>
        </div>

        {/* Status overlays */}
        {status === "starting" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm text-white/70">Starting camera…</p>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/80 p-8 text-center text-white">
            <Camera className="h-10 w-10 text-white/40" />
            <p className="text-sm text-white/80">
              Couldn't start the camera. Check camera permissions — or pick a photo from your gallery instead.
            </p>
            <button onClick={() => galleryRef.current?.click()} className="btn-primary">
              Choose from gallery
            </button>
          </div>
        )}

        {/* Document frame hint while live */}
        {status === "live" && (
          <div className="pointer-events-none absolute inset-x-6 bottom-32 top-16 z-10 rounded-lg border-2 border-dashed border-white/40" />
        )}
      </div>

      {/* Bottom controls */}
      <div className="z-20 flex items-center justify-around bg-black/85 px-6 py-5 text-white backdrop-blur">
        <button
          onClick={() => galleryRef.current?.click()}
          className="flex flex-col items-center gap-1.5 text-[11px] text-white/80 transition"
        >
          <span className="rounded-full bg-white/10 p-3 transition hover:bg-white/25">
            <ImagePlus className="h-6 w-6" />
          </span>
          Gallery
        </button>

        <button
          onClick={capturePhoto}
          disabled={status !== "live"}
          aria-label="Capture photo"
          className="rounded-full border-4 border-white p-1 transition active:scale-90 disabled:opacity-40"
        >
          <span className="block h-16 w-16 rounded-full bg-white transition hover:bg-white/90" />
        </button>

        <button
          onClick={flipCamera}
          disabled={status !== "live"}
          className="flex flex-col items-center gap-1.5 text-[11px] text-white/80 transition disabled:opacity-40"
        >
          <span className="rounded-full bg-white/10 p-3 transition hover:bg-white/25">
            <RefreshCw className="h-6 w-6" />
          </span>
          Flip
        </button>
      </div>

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
