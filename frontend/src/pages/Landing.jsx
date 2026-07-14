import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Camera,
  Image as ImageIcon,
  LayoutGrid,
  User,
  Sparkles,
  Wand2,
  CheckCircle2,
  ArrowRight,
  Film,
} from "lucide-react";

const FEATURES = [
  { icon: Sparkles, title: "Visual World Report", body: "A creative-director-grade breakdown of mood, palette, symbols, and camera language for your song." },
  { icon: Camera, title: "Reference Photo Control", body: "Upload photos of your character, wardrobe, location and mood — every prompt inherits their DNA." },
  { icon: LayoutGrid, title: "Storyboard Builder", body: "Eight scenes, each with timing, camera moves, symbols, and reference-photo continuity notes." },
  { icon: User, title: "Character & Environment Sheets", body: "Locked-in appearance, clothing, atmosphere and consistency rules that survive every regenerate." },
  { icon: Wand2, title: "Scene Image Prompts", body: "Polished, ready-to-paste prompts with negative rules and lighting for any image model." },
  { icon: ImageIcon, title: "Photo-Based Scene Generation", body: "Generate scene images that mirror your uploaded references — when a provider is connected." },
  { icon: CheckCircle2, title: "Manual Image Approval", body: "You are the director. Approve, regenerate, or upload manually. Nothing ships without your yes." },
  { icon: Film, title: "Motion / Export Roadmap", body: "Suggested motion per scene and an export plan you can hand to any renderer." },
];

export default function Landing() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-40"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=2400&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 -z-10 bg-black/70" />
        <div className="max-w-7xl mx-auto px-5 md:px-8 pt-20 md:pt-32 pb-24 md:pb-40">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="overline text-[#FCD34D] mb-6" data-testid="hero-overline">
              — A Creative Director For Your Song
            </div>
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[0.9] uppercase max-w-5xl">
              Every song has a<br />
              <span className="text-[#E5B83B]">world.</span>{" "}
              <span className="font-serif-italic italic font-normal text-neutral-100 normal-case">
                BeatVision reveals it.
              </span>
            </h1>
            <p className="mt-8 max-w-2xl text-lg md:text-xl text-neutral-300 font-body leading-relaxed">
              Upload a song, paste lyrics, add reference photos, choose a style —
              and BeatVision reveals the visual world behind your music. Storyboards,
              character sheets, scene prompts, and photo-guided images. You approve every frame.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link to="/new" data-testid="hero-start-project">
                <button className="btn-gold inline-flex items-center gap-2">
                  Start a Project <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
              <Link to="/dashboard" data-testid="hero-dashboard">
                <button className="btn-ghost">Open Dashboard</button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 py-20 md:py-28">
        <div className="mb-14 max-w-3xl">
          <div className="overline text-neutral-500 mb-3">The Console</div>
          <h2 className="font-display text-3xl md:text-5xl leading-tight uppercase">
            Eight tools. One{" "}
            <span className="font-serif-italic italic font-normal">visual world</span>.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              className="bv-card p-6 min-h-[220px] flex flex-col"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
              data-testid={`feature-${i}`}
            >
              <f.icon className="w-6 h-6 text-[#E5B83B] mb-4" strokeWidth={1.5} />
              <div className="overline text-neutral-500 mb-2">0{i + 1}</div>
              <h3 className="font-display text-lg mb-3 leading-tight uppercase">{f.title}</h3>
              <p className="text-sm text-neutral-400 font-body leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-16 border-t border-white/10 pt-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <p className="font-serif-italic italic text-2xl md:text-3xl max-w-2xl text-neutral-200">
            &ldquo;BeatVision doesn&apos;t pretend to be an AI toy. It behaves like a director on call.&rdquo;
          </p>
          <Link to="/new" data-testid="cta-start-bottom">
            <button className="btn-gold whitespace-nowrap">Start a Project</button>
          </Link>
        </div>
      </section>
    </div>
  );
}
