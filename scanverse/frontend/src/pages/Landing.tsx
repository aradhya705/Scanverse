import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import Logo from "@/components/Logo";

const FEATURES = [
  {
    title: "Edge detection that just works",
    body: "ScanVerse finds your document's corners the moment you snap a photo, then straightens it into a flat, upright page.",
  },
  {
    title: "Filters built for paper",
    body: "Clean Document, Color Boost, Black & White and five more — each with live brightness, contrast, saturation and sharpness control.",
  },
  {
    title: "Text you can search and copy",
    body: "On-device-grade OCR turns every scan into searchable, selectable, exportable text in seconds.",
  },
  {
    title: "Multi-page in one file",
    body: "Scan a whole stack, drag pages into order, rotate or duplicate any of them, and export as one document.",
  },
  {
    title: "Export anywhere",
    body: "Send finished scans out as PDF, DOCX, TXT, or image files — whatever the next step needs.",
  },
  {
    title: "Built to stay organized",
    body: "Categories, tags and full-text search keep a thousand scans as easy to navigate as ten.",
  },
];

const STATS = [
  { value: "9", label: "scan filters" },
  { value: "<3s", label: "typical scan-to-crop time" },
  { value: "100%", label: "your documents, your storage" },
  { value: "5", label: "export formats" },
];

const TESTIMONIALS = [
  {
    quote: "I replaced three different scanning apps with this one. The auto-crop is genuinely fast.",
    name: "Priya N.",
    role: "Graduate student",
  },
  {
    quote: "Multi-page scanning for expense receipts saves me an hour every week.",
    name: "Daniel O.",
    role: "Freelance consultant",
  },
  {
    quote: "The OCR export straight to DOCX means I stopped retyping old contracts by hand.",
    name: "Marisol T.",
    role: "Office manager",
  },
];

const FAQS = [
  {
    q: "Do I need an account to scan a document?",
    a: "You'll need a free ScanVerse account so your documents are saved, searchable, and available whenever you come back.",
  },
  {
    q: "What file types can I upload?",
    a: "JPG, PNG, JPEG, WEBP, and PDF are all supported for upload, in addition to capturing directly from your camera.",
  },
  {
    q: "Can I edit the detected corners if the crop looks off?",
    a: "Yes — every scan shows adjustable corner handles so you can fine-tune the crop by hand whenever confidence is low.",
  },
  {
    q: "What can I export a finished scan as?",
    a: "PDF, DOCX, TXT, PNG, and JPEG, depending on whether you need the images, the extracted text, or both.",
  },
];

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`mx-auto max-w-6xl px-6 ${className}`}>{children}</section>;
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-line-light/70 bg-paper/80 backdrop-blur">
        <Section className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <Logo size={26} />
            <span className="font-display text-lg font-semibold tracking-tight">ScanVerse</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-ink/70 hover:text-ink">
              Sign in
            </Link>
            <Link to="/register" className="btn-primary text-sm">
              Get started free
            </Link>
          </div>
        </Section>
      </header>

      {/* Hero */}
      <Section className="grid grid-cols-1 items-center gap-12 py-20 md:grid-cols-2 md:py-28">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl"
          >
            Scan Smarter with AI.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 max-w-md text-lg text-ink/60"
          >
            Transform paper documents into clean, searchable, high-quality digital files in seconds.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 flex flex-wrap gap-3"
          >
            <Link to="/register" className="btn-primary">
              Start scanning — it's free
            </Link>
            <a href="#features" className="btn-secondary">
              See what it does
            </a>
          </motion.div>
        </div>

        {/* Signature visual: the scan-frame doing its actual job */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto aspect-[4/5] w-full max-w-sm"
        >
          <div className="absolute inset-0 rounded-xl2 bg-gradient-to-br from-brand/10 to-laser/10" />
          <div className="relative m-6 h-[calc(100%-3rem)] overflow-hidden rounded-xl border border-line-light bg-white shadow-soft">
            <div className="flex h-full flex-col justify-between p-6">
              <div className="flex justify-between text-xs text-ink/40">
                <span>INVOICE_2024_08.jpg</span>
                <span className="text-laser">98% match</span>
              </div>
              <div className="space-y-2">
                <div className="h-2 w-3/4 rounded bg-ink/10" />
                <div className="h-2 w-1/2 rounded bg-ink/10" />
                <div className="h-2 w-2/3 rounded bg-ink/10" />
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 animate-sweep bg-gradient-to-r from-transparent via-laser to-transparent" />
          </div>
          {/* corner brackets */}
          {[
            "top-2 left-2 border-t-2 border-l-2",
            "top-2 right-2 border-t-2 border-r-2",
            "bottom-2 left-2 border-b-2 border-l-2",
            "bottom-2 right-2 border-b-2 border-r-2",
          ].map((pos) => (
            <div key={pos} className={`absolute h-6 w-6 border-brand ${pos}`} />
          ))}
        </motion.div>
      </Section>

      {/* Stats */}
      <Section className="border-y border-line-light py-10">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display text-3xl font-semibold text-brand">{s.value}</p>
              <p className="mt-1 text-sm text-ink/50">{s.label}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section className="py-24" >
        <div id="features" className="scroll-mt-20">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Everything a scan needs, nothing it doesn't</h2>
          <p className="mt-3 max-w-xl text-ink/60">
            Built around the actual workflow of turning paper into a document you'll use again.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-6">
                <div className="mb-4 h-8 w-8 rounded-lg bg-brand/10" />
                <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-ink/60">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Testimonials */}
      <Section className="py-16">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">People who scan a lot, use it a lot</h2>
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="card p-6">
              <p className="text-sm text-ink/80">&ldquo;{t.quote}&rdquo;</p>
              <p className="mt-4 text-sm font-medium">{t.name}</p>
              <p className="text-xs text-ink/50">{t.role}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section className="py-16">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Questions, answered</h2>
        <div className="mt-8 divide-y divide-line-light border-y border-line-light">
          {FAQS.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                {item.q}
                <span className="text-ink/40 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-ink/60">{item.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section className="py-20">
        <div className="card flex flex-col items-center gap-5 px-8 py-14 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Scan your first document in under a minute</h2>
          <Link to="/register" className="btn-primary">Get started free</Link>
        </div>
      </Section>

      <footer className="border-t border-line-light py-10">
        <Section className="flex flex-col items-center justify-between gap-4 text-sm text-ink/50 md:flex-row">
          <div className="flex items-center gap-2">
            <Logo size={18} />
            <span>ScanVerse</span>
          </div>
          <p>© {new Date().getFullYear()} ScanVerse. All rights reserved.</p>
        </Section>
      </footer>
    </div>
  );
}
