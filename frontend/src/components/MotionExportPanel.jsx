import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Music2,
  RotateCcw,
  Square,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { MOTION_TYPES } from "@/lib/constants";
import StatusBadge from "@/components/StatusBadge";
import {
  DEFAULT_RENDER_PRESET_ID,
  RENDER_PRESETS,
  estimateOutputBytes,
  getVideoRenderSupport,
  renderVideo,
  VideoRenderCancelledError,
} from "@/lib/videoRenderer";

const TIMING_SOURCE_LABELS = {
  storyboard: "Storyboard timing",
  storyboard_scaled: "Storyboard timing scaled to song length",
  even_split: "Even timing fallback",
};

const PROGRESS_LABELS = {
  preparing_audio: "Preparing audio",
  loading_images: "Loading scene images",
  rendering: "Rendering scenes",
  finalizing: "Finalizing video",
  complete: "Complete",
};

const RENDER_PRESET_STORAGE_KEY = "beatvision:render-preset";

function readStoredRenderPreset() {
  if (typeof window === "undefined") return DEFAULT_RENDER_PRESET_ID;
  try {
    const stored = window.localStorage.getItem(RENDER_PRESET_STORAGE_KEY);
    return RENDER_PRESETS[stored] ? stored : DEFAULT_RENDER_PRESET_ID;
  } catch {
    return DEFAULT_RENDER_PRESET_ID;
  }
}

function formatSeconds(value) {
  if (!Number.isFinite(value)) return "--:--";
  const total = Math.max(0, Math.round(value));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function readAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      try {
        audio.load();
      } catch {
        // Some browsers reject load() after the source is removed.
      }
      URL.revokeObjectURL(url);
    };

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    const timeoutId = window.setTimeout(() => {
      finish(reject, new Error("The song metadata took too long to load."));
    }, 30_000);

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        finish(reject, new Error("The song duration could not be read."));
        return;
      }
      finish(resolve, duration);
    };
    audio.onerror = () => {
      finish(reject, new Error("The selected song could not be opened."));
    };
    audio.src = url;
  });
}

function Requirement({ ok, children }) {
  return (
    <div className="flex items-start gap-2 text-sm font-body">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#34D399]" />
      ) : (
        <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#F87171]" />
      )}
      <span className={ok ? "text-neutral-300" : "text-neutral-500"}>{children}</span>
    </div>
  );
}

export default function MotionExportPanel({
  project,
  approvedImagesCount,
  missingImagesCount,
  totalScenes,
}) {
  const [audioFile, setAudioFile] = useState(null);
  const [audioDuration, setAudioDuration] = useState(null);
  const [audioError, setAudioError] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState({ stage: "", percent: 0 });
  const [renderError, setRenderError] = useState("");
  const [renderResult, setRenderResult] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [renderPresetId, setRenderPresetId] = useState(readStoredRenderPreset);
  const cancelRef = useRef(false);
  const mountedRef = useRef(true);
  const videoUrlRef = useRef("");
  const fileInputRef = useRef(null);
  const audioSelectionIdRef = useRef(0);

  const browserSupport = useMemo(() => getVideoRenderSupport(), []);
  const selectedPreset =
    RENDER_PRESETS[renderPresetId] ||
    RENDER_PRESETS[DEFAULT_RENDER_PRESET_ID];
  const estimatedBytes = useMemo(
    () => estimateOutputBytes(audioDuration, renderPresetId),
    [audioDuration, renderPresetId]
  );
  const isLikelyMobile = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  }, []);

  const scenes = useMemo(() => {
    return [...(project.storyboardScenes || [])]
      .sort((a, b) => Number(a.scene_number || 0) - Number(b.scene_number || 0))
      .map((scene, index) => ({
        ...scene,
        imageDataUrl: project.sceneImages?.[scene.scene_number]?.imageDataUrl || "",
        approved: Boolean(project.sceneImages?.[scene.scene_number]?.approved),
        motion: MOTION_TYPES[index % MOTION_TYPES.length],
      }));
  }, [project.storyboardScenes, project.sceneImages]);

  const missingScenes = useMemo(
    () => scenes.filter((scene) => !scene.approved || !scene.imageDataUrl),
    [scenes]
  );

  const requirements = {
    hasScenes: scenes.length > 0,
    allImagesApproved: scenes.length > 0 && missingScenes.length === 0,
    hasAudio: Boolean(audioFile && Number.isFinite(audioDuration)),
    browserSupported: browserSupport.supported,
  };

  const canRender = Object.values(requirements).every(Boolean) && !isRendering;

  useEffect(() => {
    try {
      window.localStorage.setItem(RENDER_PRESET_STORAGE_KEY, renderPresetId);
    } catch {
      // The preset is a convenience only; rendering still works without storage.
    }
  }, [renderPresetId]);

  useEffect(() => {
    // React StrictMode runs an extra setup/cleanup cycle in development.
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      cancelRef.current = true;
      audioSelectionIdRef.current += 1;
      if (videoUrlRef.current) {
        URL.revokeObjectURL(videoUrlRef.current);
        videoUrlRef.current = "";
      }
    };
  }, []);

  function clearRenderedVideo() {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = "";
    }
    setVideoUrl("");
    setRenderResult(null);
    setProgress({ stage: "", percent: 0 });
  }

  async function handleAudioChange(event) {
    const file = event.target.files?.[0] || null;
    // Clear the native input after capture so selecting the same file later still
    // fires onChange. Component state keeps the actual File for this session.
    event.target.value = "";
    const selectionId = audioSelectionIdRef.current + 1;
    audioSelectionIdRef.current = selectionId;

    setAudioError("");
    setRenderError("");
    clearRenderedVideo();

    if (!file) {
      setAudioFile(null);
      setAudioDuration(null);
      return;
    }

    setAudioFile(file);
    setAudioDuration(null);

    try {
      const duration = await readAudioDuration(file);
      if (
        !mountedRef.current ||
        audioSelectionIdRef.current !== selectionId
      ) {
        return;
      }
      setAudioDuration(duration);
    } catch (error) {
      if (
        !mountedRef.current ||
        audioSelectionIdRef.current !== selectionId
      ) {
        return;
      }
      setAudioError(error.message || "The selected song could not be opened.");
    }
  }

  function clearAudioSelection() {
    audioSelectionIdRef.current += 1;
    setAudioFile(null);
    setAudioDuration(null);
    setAudioError("");
    setRenderError("");
    clearRenderedVideo();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleRender() {
    if (!canRender) return;

    clearRenderedVideo();
    setRenderError("");
    setIsRendering(true);
    setProgress({ stage: "preparing_audio", percent: 1 });
    cancelRef.current = false;

    try {
      const result = await renderVideo({
        audioFile,
        projectTitle: project.title,
        scenes,
        renderPreset: renderPresetId,
        shouldCancel: () => cancelRef.current || !mountedRef.current,
        onProgress: (nextProgress) => {
          if (mountedRef.current) setProgress(nextProgress);
        },
      });

      if (!mountedRef.current || cancelRef.current) return;
      const nextUrl = URL.createObjectURL(result.blob);
      videoUrlRef.current = nextUrl;
      setRenderResult(result);
      setVideoUrl(nextUrl);
    } catch (error) {
      if (!mountedRef.current) return;
      if (error instanceof VideoRenderCancelledError || error?.code === "BEATVISION_RENDER_CANCELLED") {
        setRenderError("Video rendering was cancelled.");
      } else {
        setRenderError(error.message || "The video could not be rendered.");
      }
    } finally {
      if (mountedRef.current) setIsRendering(false);
    }
  }

  function handleCancel() {
    cancelRef.current = true;
    setProgress((current) => ({ ...current, stage: "cancelling" }));
  }

  const complete = approvedImagesCount === totalScenes && totalScenes > 0;
  const currentStageLabel =
    progress.stage === "cancelling"
      ? "Cancelling render"
      : PROGRESS_LABELS[progress.stage] || "Preparing render";

  return (
    <div className="space-y-6" data-testid="motion-export-panel">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bv-card p-4">
          <div className="overline text-neutral-500">Approved Scene Images</div>
          <div className="font-display text-4xl text-[#34D399] mt-2">{approvedImagesCount}</div>
        </div>
        <div className="bv-card p-4">
          <div className="overline text-neutral-500">Missing Scene Images</div>
          <div className="font-display text-4xl text-[#F87171] mt-2">{missingImagesCount}</div>
        </div>
        <div className="bv-card p-4">
          <div className="overline text-neutral-500">Export Status</div>
          <div className="font-display text-xl mt-2 uppercase">
            {complete ? "Images ready" : "Complete scene approvals"}
          </div>
        </div>
      </div>

      <div className="bv-card p-5">
        <div className="flex items-start gap-3 mb-4">
          <Music2 className="w-5 h-5 text-[#E5B83B] shrink-0 mt-0.5" />
          <div>
            <div className="overline text-neutral-500">Song for export</div>
            <p className="font-body text-sm text-neutral-300 mt-1">
              BeatVision does not keep large audio files in browser storage. Re-select the original song for each export session.
            </p>
          </div>
        </div>

        <label className="btn-ghost inline-flex items-center gap-2 cursor-pointer" data-testid="export-audio-select">
          <Upload className="w-4 h-4" />
          Re-select song for export
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
            className="hidden"
            onChange={handleAudioChange}
            disabled={isRendering}
          />
        </label>

        {audioFile && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-body">
            <span className="text-neutral-200 break-all">{audioFile.name}</span>
            <span className="font-mono text-neutral-500">
              {Number.isFinite(audioDuration) ? formatSeconds(audioDuration) : "Reading duration…"}
            </span>
            <span className="font-mono text-neutral-500">{formatBytes(audioFile.size)}</span>
            <button
              type="button"
              className="text-xs font-mono uppercase tracking-widest text-neutral-500 hover:text-neutral-200"
              onClick={clearAudioSelection}
              disabled={isRendering}
            >
              Clear song
            </button>
          </div>
        )}

        {audioError && <div className="mt-3 text-sm text-[#F87171] font-body">{audioError}</div>}
      </div>

      <div className="bv-card p-5">
        <div className="overline text-neutral-500">Export quality</div>
        <div className="font-display text-xl mt-1">Choose a render preset</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          {Object.values(RENDER_PRESETS).map((preset) => {
            const selected = preset.id === renderPresetId;
            return (
              <button
                key={preset.id}
                type="button"
                className={`text-left border p-4 transition-colors ${
                  selected
                    ? "border-[#E5B83B] bg-[#E5B83B]/10"
                    : "border-white/10 bg-black/20 hover:border-white/25"
                }`}
                onClick={() => {
                  clearRenderedVideo();
                  setRenderPresetId(preset.id);
                }}
                disabled={isRendering}
                data-testid={`render-preset-${preset.id}`}
              >
                <span className="font-display text-lg">{preset.label}</span>
                <span className="block font-mono text-xs text-neutral-500 mt-2">
                  {preset.width} × {preset.height} · {preset.fps} FPS
                </span>
                <span className="block font-body text-xs text-neutral-400 mt-2">
                  {preset.id === "mobile"
                    ? "Best for phones and long songs."
                    : preset.id === "standard"
                      ? "Recommended balance of quality and smoothness."
                      : "Best quality for faster desktop computers."}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-mono text-neutral-500">
          <span>Selected: {selectedPreset.label}</span>
          <span>
            Estimated size:{" "}
            {Number.isFinite(audioDuration) && audioDuration > 0
              ? `about ${formatBytes(estimatedBytes)}`
              : "select a song"}
          </span>
        </div>

        {renderPresetId === "high" && isLikelyMobile && (
          <div className="mt-4 p-4 border border-[#FDBA74]/35 bg-[#F97316]/5 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-[#FDBA74] shrink-0" />
            <div className="font-body text-sm text-neutral-300">
              High mode can drop frames or freeze during long renders on phones.
              Standard or Mobile is recommended on this device.
            </div>
          </div>
        )}
      </div>

      <div className="bv-card p-5">
        <div className="overline text-neutral-500 mb-4">Export requirements</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Requirement ok={requirements.hasScenes}>Storyboard scenes are available.</Requirement>
          <Requirement ok={requirements.allImagesApproved}>
            Every scene has an approved image.
          </Requirement>
          <Requirement ok={requirements.hasAudio}>The original song is selected.</Requirement>
          <Requirement ok={requirements.browserSupported}>
            Browser supports Canvas capture, Web Audio, MediaRecorder, and WebM.
          </Requirement>
        </div>

        {missingScenes.length > 0 && (
          <div className="mt-4 p-3 border border-[#F87171]/25 bg-[#EF4444]/5 text-xs font-mono text-neutral-400">
            Missing approved image: {missingScenes.map((scene) => `S${String(scene.scene_number).padStart(2, "0")}`).join(", ")}
          </div>
        )}

        {!browserSupport.supported && (
          <div className="mt-4 p-4 border border-[#FDBA74]/35 bg-[#F97316]/5 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-[#FDBA74] shrink-0" />
            <div className="font-body text-sm text-neutral-300">
              This browser cannot render BeatVision video locally. Try current Chrome or desktop Chromium.
              {browserSupport.reason ? ` ${browserSupport.reason}` : ""}
            </div>
          </div>
        )}
      </div>

      <div className="bv-card p-5">
        <button
          type="button"
          className="w-full flex items-center justify-between text-left"
          onClick={() => setShowPlan((value) => !value)}
          data-testid="toggle-export-plan"
        >
          <div>
            <div className="overline text-neutral-500">Planning section</div>
            <div className="font-display text-lg mt-1">Suggested motion and scene order</div>
          </div>
          {showPlan ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {showPlan && (
          <div className="mt-5 space-y-2" data-testid="export-plan-summary">
            {scenes.map((scene) => (
              <div
                key={scene.scene_number}
                className="flex items-center justify-between border-b border-white/5 py-2 text-sm font-body gap-3"
              >
                <span className="font-mono text-neutral-500">
                  S{String(scene.scene_number).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate">{scene.scene_title}</span>
                <span className="text-[#E5B83B] font-mono uppercase text-xs tracking-widest">
                  {scene.motion}
                </span>
                {scene.approved ? (
                  <StatusBadge status="approved" label="OK" />
                ) : (
                  <StatusBadge status="missing" label="No image" />
                )}
              </div>
            ))}
            <div className="pt-3 text-xs font-mono text-neutral-500">
              Output: {selectedPreset.width} × {selectedPreset.height} WebM · {selectedPreset.fps} FPS · cinematic cover crop · scene crossfades
            </div>
          </div>
        )}
      </div>

      {isRendering && (
        <div className="bv-card p-5" data-testid="render-progress">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-[#E5B83B]" />
              <div>
                <div className="font-body text-sm text-neutral-200">{currentStageLabel}</div>
                {progress.scene && progress.totalScenes && (
                  <div className="font-mono text-xs text-neutral-500 mt-1">
                    Scene {progress.scene} of {progress.totalScenes}
                  </div>
                )}
              </div>
            </div>
            <div className="font-display text-2xl">{progress.percent || 0}%</div>
          </div>
          <div className="h-2 bg-neutral-900 overflow-hidden">
            <div
              className="h-full bg-[#E5B83B] transition-[width] duration-200"
              style={{ width: `${progress.percent || 0}%` }}
            />
          </div>
          <button type="button" className="btn-danger mt-4" onClick={handleCancel}>
            <Square className="w-3 h-3 inline mr-2" /> Cancel Render
          </button>
        </div>
      )}

      {renderError && !isRendering && (
        <div className="p-4 border border-[#F87171]/35 bg-[#EF4444]/5 text-sm font-body text-[#FCA5A5]">
          {renderError}
        </div>
      )}

      {!renderResult && !isRendering && (
        <button
          type="button"
          className="btn-gold inline-flex items-center gap-2"
          onClick={handleRender}
          disabled={!canRender}
          data-testid="render-full-video"
        >
          <Film className="w-4 h-4" /> Render full video
        </button>
      )}

      {renderResult && videoUrl && (
        <div className="bv-card p-5 space-y-5" data-testid="rendered-video-result">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="overline text-[#34D399]">Video ready</div>
              <div className="font-display text-xl mt-1">{renderResult.filename}</div>
            </div>
            <CheckCircle2 className="w-6 h-6 text-[#34D399]" />
          </div>

          <video
            controls
            playsInline
            src={videoUrl}
            className="w-full bg-black aspect-video border border-white/10"
            data-testid="generated-video-preview"
          />

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-mono text-neutral-400">
            <div><span className="block text-neutral-600">Duration</span>{formatSeconds(renderResult.duration)}</div>
            <div><span className="block text-neutral-600">Scenes</span>{renderResult.sceneCount}</div>
            <div><span className="block text-neutral-600">Size</span>{formatBytes(renderResult.blob.size)}</div>
            <div><span className="block text-neutral-600">Quality</span>{renderResult.renderPresetLabel || `${renderResult.width}p`}</div>
            <div><span className="block text-neutral-600">Timing</span>{TIMING_SOURCE_LABELS[renderResult.timingSource] || renderResult.timingSource}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <a className="btn-gold inline-flex items-center gap-2" href={videoUrl} download={renderResult.filename}>
              <Download className="w-4 h-4" /> Download video
            </a>
            <button type="button" className="btn-ghost inline-flex items-center gap-2" onClick={handleRender}>
              <RotateCcw className="w-4 h-4" /> Render again
            </button>
            <button type="button" className="btn-danger inline-flex items-center gap-2" onClick={clearRenderedVideo}>
              <Trash2 className="w-4 h-4" /> Remove rendered video
            </button>
          </div>

          <div className="text-xs font-mono text-neutral-500 flex items-start gap-2">
            <ImageIcon className="w-4 h-4 shrink-0" />
            The video Blob exists only in this browser session and is never uploaded automatically.
          </div>
        </div>
      )}
    </div>
  );
}
