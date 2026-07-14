import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { STYLE_PRESETS } from "@/lib/constants";
import { newProject, upsertProject } from "@/lib/storage";
import ReferencePhotoUploader from "@/components/ReferencePhotoUploader";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function CreateProject() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    title: "",
    artist: "",
    lyrics: "",
    notes: "",
    style: "dark_cinematic_surreal",
    referencePhotos: [],
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function handleReveal() {
    if (!form.title.trim()) {
      toast.error("Please enter a song title");
      return;
    }
    const project = newProject(form);
    const saved = upsertProject(project);
    if (!saved) {
      toast.error(
        "Could not save project to browser storage. Try removing large reference photos."
      );
      return;
    }
    toast.success("Project created");
    nav(`/project/${saved.id}`);
  }

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-12 md:py-16">
      <div className="mb-10">
        <div className="overline text-neutral-500 mb-2">New Project</div>
        <h1 className="font-display text-4xl md:text-5xl uppercase leading-none">
          Reveal a <span className="font-serif-italic italic font-normal">world.</span>
        </h1>
        <p className="mt-3 font-body text-neutral-400 max-w-2xl">
          Give BeatVision a song, a style, and optional reference photos. It will build the world,
          storyboard, and scene prompts. You approve every step.
        </p>
      </div>

      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="bv-label">Song Title *</label>
            <input
              className="bv-input"
              placeholder="e.g. Wolves in the Rain"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              data-testid="create-title"
            />
          </div>
          <div>
            <label className="bv-label">Artist Name</label>
            <input
              className="bv-input"
              placeholder="e.g. Nara Kova"
              value={form.artist}
              onChange={(e) => set("artist", e.target.value)}
              data-testid="create-artist"
            />
          </div>
        </div>

        <div>
          <label className="bv-label">Lyrics</label>
          <textarea
            className="bv-textarea"
            rows={8}
            placeholder="Paste your lyrics here..."
            value={form.lyrics}
            onChange={(e) => set("lyrics", e.target.value)}
            data-testid="create-lyrics"
          />
        </div>

        <div>
          <label className="bv-label">Creator Notes (optional)</label>
          <textarea
            className="bv-textarea"
            rows={3}
            placeholder="Tone, memories, references, forbidden imagery..."
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            data-testid="create-notes"
          />
        </div>

        <div>
          <label className="bv-label">Style Preset</label>
          <select
            className="bv-select"
            value={form.style}
            onChange={(e) => set("style", e.target.value)}
            data-testid="create-style"
          >
            {STYLE_PRESETS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="bv-label">Reference Photos (optional)</label>
          <div className="text-xs text-neutral-500 font-body mb-3">
            Upload photos of your main character, environment, wardrobe, symbols, and mood.
            These influence the world report, prompts, and scene image generation.
          </div>
          <ReferencePhotoUploader
            photos={form.referencePhotos}
            onChange={(photos) => set("referencePhotos", photos)}
            testidPrefix="create-ref"
          />
        </div>

        <div className="pt-6 border-t border-white/5">
          <button
            className="btn-gold inline-flex items-center gap-2 text-base px-6 py-3"
            onClick={handleReveal}
            data-testid="create-reveal-btn"
          >
            <Sparkles className="w-4 h-4" /> Reveal World
          </button>
        </div>
      </div>
    </div>
  );
}
