import React, { useEffect, useState } from "react";
import { fetchProviderStatus } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { Cpu, Image as ImageIcon, Film, Camera, MonitorPlay } from "lucide-react";

const CARDS = [
  {
    key: "text_analysis",
    icon: Cpu,
    title: "Text Analysis",
    what: "Generates the Visual World Report, storyboards, and polished scene prompts.",
    cost: "Uses your Emergent LLM credits.",
  },
  {
    key: "image_generation",
    icon: ImageIcon,
    title: "Image Generation",
    what: "Turns approved scene prompts into cinematic scene images.",
    cost: "Uses Emergent LLM credits when connected.",
  },
  {
    key: "reference_photo_image_generation",
    icon: Camera,
    title: "Reference-Photo Image Generation",
    what: "Uses your uploaded reference photos to guide each generated scene image.",
    cost: "Uses Emergent LLM credits when connected.",
  },
  {
    key: "motion_generation",
    icon: Film,
    title: "Motion Generation",
    what: "Would turn scene stills into short animated clips.",
    cost: "Disabled in MVP.",
  },
  {
    key: "video_export",
    icon: MonitorPlay,
    title: "Video Export",
    what: "Would stitch approved clips into a final MP4.",
    cost: "Demo plan only — full renderer coming later.",
  },
];

function statusToBadge(s) {
  if (!s) return "locked";
  if (s.connected && s.status === "ready") return "ready";
  if (s.status === "demo_mode") return "demo";
  if (s.status === "demo_plan_only") return "demo";
  if (s.status === "not_connected") return "provider_missing";
  return "locked";
}

export default function Settings() {
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetchProviderStatus()
      .then(setStatus)
      .catch((e) => setErr(e.message || "Failed to reach backend"));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 py-12 md:py-16">
      <div className="mb-10">
        <div className="overline text-neutral-500 mb-2">Providers</div>
        <h1 className="font-display text-4xl md:text-5xl uppercase leading-none">Settings</h1>
        <p className="mt-3 font-serif-italic italic text-lg text-neutral-400">
          What&apos;s connected, what&apos;s not, and what things cost.
        </p>
      </div>

      {err && (
        <div className="bv-card p-5 mb-6 border-red-500/40" data-testid="settings-error">
          <div className="overline text-[#F87171] mb-2">Backend Unreachable</div>
          <div className="font-body text-sm text-neutral-300">{err}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CARDS.map((c, idx) => {
          const s = status?.[c.key];
          const badge = statusToBadge(s);
          return (
            <div key={c.key} className="bv-card p-6" data-testid={`provider-card-${c.key}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <c.icon className="w-5 h-5 text-[#E5B83B] mt-1" strokeWidth={1.5} />
                  <div>
                    <h3 className="font-display text-lg uppercase leading-tight">{c.title}</h3>
                    <p className="text-sm text-neutral-400 font-body mt-2">{c.what}</p>
                  </div>
                </div>
                <StatusBadge status={badge} testid={`provider-badge-${c.key}`} />
              </div>
              <div className="mt-4 pt-4 border-t border-white/5 space-y-1 font-mono text-xs text-neutral-500">
                <div><span className="text-neutral-400">Status:</span> {s?.status || "unknown"}</div>
                <div><span className="text-neutral-400">Provider:</span> {s?.provider || "—"}</div>
                <div><span className="text-neutral-400">Cost:</span> {c.cost}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 bv-card p-6" data-testid="settings-note">
        <div className="overline text-neutral-500 mb-2">Safety Note</div>
        <p className="font-body text-sm text-neutral-300 leading-relaxed">
          BeatVision will never say an image was generated if it was not. If an image provider
          is not connected, you can still upload scene images manually and approve them. API keys
          are never exposed in the frontend — they live on the server.
        </p>
      </div>
    </div>
  );
}
