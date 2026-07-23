import React, { useRef, useState } from "react";
import { REFERENCE_TYPES, refTypeLabel } from "@/lib/constants";
import { fileToDataUrl } from "@/lib/storage";
import { Upload, X, Check, Undo2 } from "lucide-react";
import { toast } from "sonner";

export default function ReferencePhotoUploader({
  photos,
  onChange,
  testidPrefix = "ref",
}) {
  const inputRef = useRef(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const safePhotos = Array.isArray(photos) ? photos : [];

  async function handleFiles(files) {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;

    const next = [...safePhotos];

    for (const file of incoming) {
      if (!file.type.startsWith("image/")) {
        toast.error(`Skipped ${file.name}: not an image`);
        continue;
      }

      if (file.size > 3.5 * 1024 * 1024) {
        toast.warning(
          `${file.name} is large (${(
            file.size /
            1024 /
            1024
          ).toFixed(1)}MB). Large uploaded photos may only persist during this browser session in the MVP.`
        );
      }

      try {
        const imageDataUrl = await fileToDataUrl(file);

        next.push({
          id: crypto.randomUUID(),
          type: "main_character",
          description: "",
          fileName: file.name,
          imageDataUrl,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(error);
        toast.error(`Failed to read ${file.name}`);
      }
    }

    onChange(next);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function update(id, patch) {
    onChange(
      safePhotos.map((photo) =>
        photo.id === id ? { ...photo, ...patch } : photo
      )
    );
  }

  function confirmRemove(id) {
    onChange(safePhotos.filter((photo) => photo.id !== id));
    setConfirmRemoveId(null);
  }

  return (
    <div>
      <div
        className="border border-dashed border-white/15 hover:border-[#E5B83B]/50 transition-colors p-8 text-center cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          handleFiles(event.dataTransfer.files);
        }}
        data-testid={`${testidPrefix}-dropzone`}
      >
        <Upload
          className="w-6 h-6 mx-auto mb-3 text-neutral-500"
          strokeWidth={1.5}
        />
        <div className="overline text-neutral-400">
          Drop reference photos or click to upload
        </div>
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
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      {safePhotos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {safePhotos.map((photo, index) => {
            const confirming = confirmRemoveId === photo.id;

            return (
              <div
                key={photo.id}
                className="bv-card p-3"
                data-testid={`${testidPrefix}-card-${index}`}
              >
                <div className="aspect-video w-full overflow-hidden bg-black">
                  {photo.imageDataUrl ? (
                    <img
                      src={photo.imageDataUrl}
                      alt={photo.fileName || "Reference"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs font-mono">
                      (no preview)
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  <div>
                    <div className="overline text-neutral-500">Filename</div>
                    <div className="text-xs font-body text-neutral-300 truncate">
                      {photo.fileName || "Unnamed reference"}
                    </div>
                  </div>

                  <div>
                    <div className="overline text-neutral-500">Added</div>
                    <div className="text-xs font-mono text-neutral-400">
                      {photo.createdAt
                        ? new Date(photo.createdAt).toLocaleString()
                        : "Unknown"}
                    </div>
                  </div>

                  <label className="bv-label">Type</label>
                  <select
                    className="bv-select"
                    value={photo.type || "main_character"}
                    onChange={(event) =>
                      update(photo.id, { type: event.target.value })
                    }
                    data-testid={`${testidPrefix}-type-${index}`}
                  >
                    {REFERENCE_TYPES.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.label}
                      </option>
                    ))}
                  </select>

                  <label className="bv-label">Description (optional)</label>
                  <input
                    className="bv-input"
                    placeholder="e.g. lead singer's silver jacket"
                    value={photo.description || ""}
                    onChange={(event) =>
                      update(photo.id, {
                        description: event.target.value,
                      })
                    }
                    data-testid={`${testidPrefix}-desc-${index}`}
                  />

                  <div className="flex justify-between items-center gap-2 pt-1">
                    <div className="overline text-neutral-500 truncate max-w-[45%]">
                      {refTypeLabel(photo.type)}
                    </div>

                    {!confirming ? (
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => setConfirmRemoveId(photo.id)}
                        data-testid={`${testidPrefix}-remove-${index}`}
                      >
                        <X className="w-3 h-3 inline mr-1" />
                        Remove
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => confirmRemove(photo.id)}
                          data-testid={`${testidPrefix}-confirm-remove-${index}`}
                        >
                          <Check className="w-3 h-3 inline mr-1" />
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => setConfirmRemoveId(null)}
                          data-testid={`${testidPrefix}-cancel-remove-${index}`}
                        >
                          <Undo2 className="w-3 h-3 inline mr-1" />
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
