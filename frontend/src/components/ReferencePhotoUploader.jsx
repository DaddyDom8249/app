import React, { useRef } from "react";
import { REFERENCE_TYPES, refTypeLabel } from "@/lib/constants";
import { fileToDataUrl } from "@/lib/storage";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";

export default function ReferencePhotoUploader({ photos, onChange, testidPrefix = "ref" }) {
  const inputRef = useRef(null);

  async function handleFiles(files) {
    const arr = Array.from(files || []);
    if (!arr.length) return;
    const next = [...photos];
    for (const file of arr) {
      if (!file.type.startsWith("image/")) {
        toast.error(`Skipped ${file.name}: not an image`);
        continue;
      }
      if (file.size > 3.5 * 1024 * 1024) {
        toast.warning(`${file.name} is large (${(file.size / 1024 / 1024).toFixed(1)}MB). Large uploaded photos may only persist during this browser session in the MVP.`);
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        next.push({
          id: crypto.randomUUID(),
          type: "main_character",
          description: "",
          fileName: file.name,
          imageDataUrl: dataUrl,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {
        toast.error(`Failed to read ${file.name}`);
      }
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function update(id, patch) {
    onChange(photos.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function remove(id) {
    onChange(photos.filter((p) => p.id !== id));
  }

  return (
    <div>
      <div
        className="border border-dashed border-white/15 hover:border-[#E5B83B]/50 transition-colors p-8 text-center cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        data-testid={`${testidPrefix}-dropzone`}
      >
        <Upload className="w-6 h-6 mx-auto mb-3 text-neutral-500" strokeWidth={1.5} />
        <div className="overline text-neutral-400">Drop reference photos or click to upload</div>
        <div className="text-xs text-neutral-500 mt-2 font-body">
          JPG / PNG · Character · Environment · Outfit · Symbol · Mood
        </div>
        <input
          ref={inputRef}
          data-testid={`${testidPrefix}-file-input`}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {photos.map((p, idx) => (
            <div key={p.id} className="bv-card p-3" data-testid={`${testidPrefix}-card-${idx}`}>
              <div className="aspect-video w-full overflow-hidden bg-black">
                {p.imageDataUrl ? (
                  <img
                    src={p.imageDataUrl}
                    alt={p.fileName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs font-mono">
                    (no preview)
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-2">
                <label className="bv-label">Type</label>
                <select
                  className="bv-select"
                  value={p.type}
                  onChange={(e) => update(p.id, { type: e.target.value })}
                  data-testid={`${testidPrefix}-type-${idx}`}
                >
                  {REFERENCE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <label className="bv-label">Description (optional)</label>
                <input
                  className="bv-input"
                  placeholder="e.g. lead singer's silver jacket"
                  value={p.description}
                  onChange={(e) => update(p.id, { description: e.target.value })}
                  data-testid={`${testidPrefix}-desc-${idx}`}
                />
                <div className="flex justify-between items-center pt-1">
                  <div className="overline text-neutral-500 truncate max-w-[65%]">
                    {refTypeLabel(p.type)}
                  </div>
                  <button
                    className="btn-danger"
                    onClick={() => remove(p.id)}
                    data-testid={`${testidPrefix}-remove-${idx}`}
                  >
                    <X className="w-3 h-3 inline mr-1" /> Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
