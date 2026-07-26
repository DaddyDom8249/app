/*
 * BeatVision browser video renderer.
 *
 * Produces a real WebM Blob from approved scene images plus an audio File using
 * native browser APIs. Nothing is uploaded and the result is kept only in memory.
 */

export const RENDER_PRESETS = Object.freeze({
  mobile: Object.freeze({
    id: "mobile",
    label: "Mobile",
    width: 854,
    height: 480,
    fps: 24,
    videoBitsPerSecond: 1_800_000,
    audioBitsPerSecond: 128_000,
  }),
  standard: Object.freeze({
    id: "standard",
    label: "Standard",
    width: 1280,
    height: 720,
    fps: 24,
    videoBitsPerSecond: 3_000_000,
    audioBitsPerSecond: 128_000,
  }),
  high: Object.freeze({
    id: "high",
    label: "High",
    width: 1280,
    height: 720,
    fps: 30,
    videoBitsPerSecond: 4_000_000,
    audioBitsPerSecond: 128_000,
  }),
});

export const DEFAULT_RENDER_PRESET_ID = "standard";
export const RENDER_WIDTH = RENDER_PRESETS.standard.width;
export const RENDER_HEIGHT = RENDER_PRESETS.standard.height;
export const RENDER_FPS = RENDER_PRESETS.standard.fps;
export const CROSSFADE_SECONDS = 0.6;

export function getRenderPreset(value = DEFAULT_RENDER_PRESET_ID) {
  if (value && typeof value === "object" && value.id && RENDER_PRESETS[value.id]) {
    return RENDER_PRESETS[value.id];
  }
  return RENDER_PRESETS[value] || RENDER_PRESETS[DEFAULT_RENDER_PRESET_ID];
}

export function estimateOutputBytes(audioDuration, value = DEFAULT_RENDER_PRESET_ID) {
  if (!Number.isFinite(audioDuration) || audioDuration <= 0) return 0;
  const preset = getRenderPreset(value);
  const bitsPerSecond =
    preset.videoBitsPerSecond + preset.audioBitsPerSecond;
  return Math.ceil((bitsPerSecond * audioDuration * 1.08) / 8);
}

const IMAGE_LOAD_TIMEOUT_MS = 30_000;
const RECORDER_STOP_TIMEOUT_MS = 5_000;

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export class VideoRenderCancelledError extends Error {
  constructor(message = "Video rendering was cancelled.") {
    super(message);
    this.name = "VideoRenderCancelledError";
    this.code = "BEATVISION_RENDER_CANCELLED";
  }
}

export function getVideoRenderSupport() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      supported: false,
      mimeType: "",
      reason: "Video rendering requires a browser.",
    };
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const canvas = document.createElement("canvas");

  if (typeof canvas.captureStream !== "function") {
    return {
      supported: false,
      mimeType: "",
      reason: "Canvas video capture is not supported.",
    };
  }

  if (typeof window.MediaRecorder !== "function") {
    return {
      supported: false,
      mimeType: "",
      reason: "MediaRecorder is not supported.",
    };
  }

  if (typeof window.MediaStream !== "function") {
    return {
      supported: false,
      mimeType: "",
      reason: "MediaStream is not supported.",
    };
  }

  if (!AudioContextClass) {
    return {
      supported: false,
      mimeType: "",
      reason: "Web Audio is not supported.",
    };
  }

  const mimeType = MIME_CANDIDATES.find((candidate) => {
    try {
      return window.MediaRecorder.isTypeSupported(candidate);
    } catch {
      return false;
    }
  });

  if (!mimeType) {
    return {
      supported: false,
      mimeType: "",
      reason: "No supported WebM recording codec was found.",
    };
  }

  return { supported: true, mimeType, reason: "" };
}

function parseClockValue(value) {
  if (typeof value !== "string") return null;

  const parts = value.trim().split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    if (minutes < 0 || seconds < 0 || seconds >= 60) return null;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    if (
      hours < 0 ||
      minutes < 0 ||
      minutes >= 60 ||
      seconds < 0 ||
      seconds >= 60
    ) {
      return null;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

export function parseTimestampRange(range) {
  if (typeof range !== "string") return null;
  const match = range.match(/^\s*([^–—-]+?)\s*[–—-]\s*([^–—-]+?)\s*$/);
  if (!match) return null;

  const start = parseClockValue(match[1]);
  const end = parseClockValue(match[2]);

  if (start === null || end === null || end <= start) return null;
  return { start, end, duration: end - start };
}

export function sanitizeProjectTitle(title) {
  const cleaned = String(title || "BeatVision")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return cleaned || "BeatVision";
}

function normalizeDurations(weights, audioDuration) {
  const count = weights.length;
  const safeWeights = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 1
  );
  const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0);

  const durations = safeWeights.map(
    (weight) => (audioDuration * weight) / totalWeight
  );

  const total = durations.reduce((sum, duration) => sum + duration, 0);
  durations[count - 1] += audioDuration - total;
  return durations;
}

export function buildRenderPlan(scenes, audioDuration) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error("No storyboard scenes are available for export.");
  }

  if (!Number.isFinite(audioDuration) || audioDuration <= 0) {
    throw new Error("The selected song duration could not be determined.");
  }

  const sorted = [...scenes].sort(
    (a, b) => Number(a.scene_number || 0) - Number(b.scene_number || 0)
  );

  const parsed = sorted.map((scene) => parseTimestampRange(scene.timestamp_range));
  const everyTimestampValid = parsed.every(Boolean);

  let durations;
  let timingSource;

  if (everyTimestampValid) {
    const rawDurations = parsed.map((item) => item.duration);
    const rawTotal = rawDurations.reduce((sum, duration) => sum + duration, 0);
    const difference = Math.abs(rawTotal - audioDuration);

    durations = normalizeDurations(rawDurations, audioDuration);
    timingSource = difference <= 0.5 ? "storyboard" : "storyboard_scaled";
  } else {
    durations = normalizeDurations(sorted.map(() => 1), audioDuration);
    timingSource = "even_split";
  }

  let cursor = 0;
  const plan = sorted.map((scene, index) => {
    const start = cursor;
    const end =
      index === sorted.length - 1
        ? audioDuration
        : Math.min(audioDuration, start + durations[index]);
    cursor = end;

    return {
      ...scene,
      start,
      end,
      duration: Math.max(Number.EPSILON, end - start),
      motion: normalizeMotion(scene.motion, index),
    };
  });

  return { plan, timingSource, duration: audioDuration };
}

function normalizeMotion(value, index) {
  const text = String(value || "").toLowerCase();
  if (text.includes("zoom out")) return "zoom_out";
  if (text.includes("slow zoom") || text.includes("push in")) return "zoom_in";
  if (text.includes("pan left")) return "pan_left";
  if (text.includes("pan right")) return "pan_right";
  if (text.includes("drift")) return "drift";
  if (text.includes("shake") || text.includes("glitch")) return "shake";
  if (text.includes("fade")) return "fade";

  return ["zoom_in", "pan_left", "zoom_out", "pan_right", "drift", "static"][
    index % 6
  ];
}

function createImage(imageSource, shouldCancel) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    let timeoutId = 0;
    let cancellationId = 0;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(cancellationId);
      image.onload = null;
      image.onerror = null;
      callback(value);
    };

    timeoutId = window.setTimeout(() => {
      finish(reject, new Error("A scene image took too long to load."));
    }, IMAGE_LOAD_TIMEOUT_MS);

    cancellationId = window.setInterval(() => {
      if (shouldCancel?.()) {
        finish(reject, new VideoRenderCancelledError());
      }
    }, 100);

    image.decoding = "async";
    if (/^https?:\/\//i.test(imageSource)) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        finish(reject, new Error("A scene image has invalid dimensions."));
        return;
      }
      finish(resolve, image);
    };
    image.onerror = () => {
      finish(reject, new Error("A scene image could not be loaded."));
    };
    image.src = imageSource;
  });
}

function coverGeometry(image, progress, motion, renderConfig) {
  const renderWidth = renderConfig.width;
  const renderHeight = renderConfig.height;
  const baseScale = Math.max(
    renderWidth / image.naturalWidth,
    renderHeight / image.naturalHeight
  );

  let scaleMultiplier = 1.04;
  let offsetX = 0;
  let offsetY = 0;

  switch (motion) {
    case "zoom_in":
      scaleMultiplier = 1.02 + progress * 0.12;
      break;
    case "zoom_out":
      scaleMultiplier = 1.14 - progress * 0.12;
      break;
    case "pan_left":
      scaleMultiplier = 1.12;
      offsetX = (0.5 - progress) * renderWidth * 0.08;
      break;
    case "pan_right":
      scaleMultiplier = 1.12;
      offsetX = (progress - 0.5) * renderWidth * 0.08;
      break;
    case "drift":
      scaleMultiplier = 1.09;
      offsetY = Math.sin(progress * Math.PI * 2) * renderHeight * 0.025;
      break;
    case "shake": {
      scaleMultiplier = 1.09;
      const damping = Math.max(0.2, 1 - progress * 0.65);
      offsetX = Math.sin(progress * Math.PI * 22) * 7 * damping;
      offsetY = Math.cos(progress * Math.PI * 17) * 5 * damping;
      break;
    }
    case "fade":
    case "static":
    default:
      scaleMultiplier = 1.04;
      break;
  }

  const scale = baseScale * scaleMultiplier;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;

  return {
    x: (renderWidth - width) / 2 + offsetX,
    y: (renderHeight - height) / 2 + offsetY,
    width,
    height,
  };
}

function drawScene(ctx, image, progress, motion, renderConfig, alpha = 1) {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const geometry = coverGeometry(image, clampedProgress, motion, renderConfig);
  const localAlpha =
    motion === "fade" ? 0.82 + Math.sin(clampedProgress * Math.PI) * 0.18 : 1;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha * localAlpha));
  ctx.drawImage(image, geometry.x, geometry.y, geometry.width, geometry.height);
  ctx.restore();
}

function drawVignette(ctx, renderConfig) {
  const renderWidth = renderConfig.width;
  const renderHeight = renderConfig.height;
  const gradient = ctx.createRadialGradient(
    renderWidth / 2,
    renderHeight / 2,
    renderHeight * 0.15,
    renderWidth / 2,
    renderHeight / 2,
    renderWidth * 0.65
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(0.72, "rgba(0,0,0,0.08)");
  gradient.addColorStop(1, "rgba(0,0,0,0.48)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, renderWidth, renderHeight);
}

function findSceneIndex(plan, elapsed) {
  const found = plan.findIndex((scene) => elapsed >= scene.start && elapsed < scene.end);
  return found >= 0 ? found : plan.length - 1;
}

function smoothstep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function drawTimelineFrame(ctx, plan, images, elapsed, renderConfig) {
  const sceneIndex = findSceneIndex(plan, elapsed);
  const scene = plan[sceneIndex];
  const sceneElapsed = Math.max(0, elapsed - scene.start);
  const sceneProgress = Math.min(1, sceneElapsed / scene.duration);

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, renderConfig.width, renderConfig.height);
  drawScene(ctx, images[sceneIndex], sceneProgress, scene.motion, renderConfig, 1);

  if (sceneIndex < plan.length - 1) {
    const nextScene = plan[sceneIndex + 1];
    const fadeDuration = Math.min(
      CROSSFADE_SECONDS,
      scene.duration * 0.35,
      nextScene.duration * 0.35
    );
    const timeToEnd = scene.end - elapsed;

    if (fadeDuration > 0 && timeToEnd < fadeDuration) {
      const fadeProgress = smoothstep(1 - timeToEnd / fadeDuration);
      drawScene(
        ctx,
        images[sceneIndex + 1],
        0,
        nextScene.motion,
        renderConfig,
        fadeProgress
      );
    }
  }

  drawVignette(ctx, renderConfig);
  return sceneIndex;
}

function reportProgress(onProgress, stage, percent, details = {}) {
  if (typeof onProgress === "function") {
    onProgress({
      stage,
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      ...details,
    });
  }
}

function createMediaRecorder(stream, preferredMimeType, renderConfig) {
  const optionSets = [
    {
      mimeType: preferredMimeType,
      videoBitsPerSecond: renderConfig.videoBitsPerSecond,
      audioBitsPerSecond: renderConfig.audioBitsPerSecond,
    },
    { mimeType: preferredMimeType },
    undefined,
  ];

  let lastError = null;
  for (const options of optionSets) {
    try {
      return options
        ? new window.MediaRecorder(stream, options)
        : new window.MediaRecorder(stream);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("The browser video recorder could not start.");
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function renderVideo({
  audioFile,
  scenes,
  projectTitle,
  renderPreset = DEFAULT_RENDER_PRESET_ID,
  onProgress,
  shouldCancel,
}) {
  const support = getVideoRenderSupport();
  if (!support.supported) {
    throw new Error(
      "This browser cannot render BeatVision video locally. Try current Chrome or desktop Chromium."
    );
  }

  if (!(audioFile instanceof File)) {
    throw new Error("Re-select the original song before rendering.");
  }

  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error("No approved scene images are available for rendering.");
  }

  const invalidScene = scenes.find(
    (scene) => !scene?.approved || !scene?.imageDataUrl
  );
  if (invalidScene) {
    throw new Error(
      `Scene ${invalidScene.scene_number || "unknown"} needs an approved image before export.`
    );
  }

  const renderConfig = getRenderPreset(renderPreset);

  let animationFrameId = 0;
  let audioContext = null;
  let audioSource = null;
  let audioDestination = null;
  let canvasStream = null;
  let combinedStream = null;
  let recorder = null;
  let recorderStopped = Promise.resolve();
  let recorderError = null;
  let cancelled = false;
  let renderSafetyTimeoutId = 0;

  const isCancelled = () => cancelled || Boolean(shouldCancel?.());

  const requestRecorderStop = () => {
    if (!recorder || recorder.state === "inactive") return;
    try {
      recorder.stop();
    } catch {
      // The recorder may already be stopping.
    }
  };

  const cleanup = async () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
    if (renderSafetyTimeoutId) {
      window.clearTimeout(renderSafetyTimeoutId);
      renderSafetyTimeoutId = 0;
    }
    if (audioSource) {
      audioSource.onended = null;
    }

    try {
      audioSource?.stop();
    } catch {
      // The source may already be stopped.
    }

    requestRecorderStop();
    if (recorder) {
      await Promise.race([recorderStopped, wait(RECORDER_STOP_TIMEOUT_MS)]);
    }

    try {
      audioSource?.disconnect();
    } catch {
      // Ignore disconnect errors during cleanup.
    }

    try {
      audioDestination?.disconnect();
    } catch {
      // Ignore disconnect errors during cleanup.
    }

    for (const stream of [combinedStream, canvasStream]) {
      try {
        stream?.getTracks().forEach((track) => track.stop());
      } catch {
        // Ignore track cleanup errors.
      }
    }

    if (audioContext && audioContext.state !== "closed") {
      try {
        await audioContext.close();
      } catch {
        // Ignore context cleanup errors.
      }
    }
  };

  try {
    reportProgress(onProgress, "preparing_audio", 2);

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    await audioContext.resume();

    const audioBuffer = await audioContext.decodeAudioData(await audioFile.arrayBuffer());
    if (isCancelled()) throw new VideoRenderCancelledError();

    const { plan, timingSource, duration } = buildRenderPlan(
      scenes,
      audioBuffer.duration
    );

    reportProgress(onProgress, "loading_images", 8, {
      scene: 0,
      totalScenes: plan.length,
    });

    const loadedImages = [];
    for (let index = 0; index < plan.length; index += 1) {
      if (isCancelled()) throw new VideoRenderCancelledError();
      const imageDataUrl = plan[index].imageDataUrl;
      if (!imageDataUrl) {
        throw new Error(
          `Scene ${plan[index].scene_number || index + 1} has no approved image.`
        );
      }
      loadedImages.push(await createImage(imageDataUrl, isCancelled));
      reportProgress(
        onProgress,
        "loading_images",
        8 + ((index + 1) / plan.length) * 12,
        {
          scene: index + 1,
          totalScenes: plan.length,
        }
      );
    }

    const canvas = document.createElement("canvas");
    canvas.width = renderConfig.width;
    canvas.height = renderConfig.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("The browser could not create a video canvas.");

    drawTimelineFrame(ctx, plan, loadedImages, 0, renderConfig);
    canvasStream = canvas.captureStream(renderConfig.fps);

    audioDestination = audioContext.createMediaStreamDestination();
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioDestination);

    combinedStream = new window.MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks(),
    ]);

    const chunks = [];
    recorder = createMediaRecorder(combinedStream, support.mimeType, renderConfig);
    recorderStopped = new Promise((resolve) => {
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = (event) => {
        recorderError =
          event.error || new Error("The browser video recorder failed.");
        requestRecorderStop();
      };
      recorder.onstop = resolve;
    });

    reportProgress(onProgress, "rendering", 20, {
      scene: 1,
      totalScenes: plan.length,
    });

    recorder.start(1000);
    let audioStartedAt = 0;
    let lastReportedPercent = -1;
    let lastReportedScene = -1;

    await new Promise((resolve, reject) => {
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        if (renderSafetyTimeoutId) {
          window.clearTimeout(renderSafetyTimeoutId);
          renderSafetyTimeoutId = 0;
        }
        audioSource.onended = null;
        callback(value);
      };

      const drawFinalFrameAndStop = () => {
        drawTimelineFrame(ctx, plan, loadedImages, duration, renderConfig);
        requestRecorderStop();
        finish(resolve);
      };

      audioSource.onended = () => {
        if (isCancelled()) {
          cancelled = true;
          requestRecorderStop();
          finish(reject, new VideoRenderCancelledError());
          return;
        }
        drawFinalFrameAndStop();
      };

      const drawFrame = () => {
        if (settled) return;

        if (isCancelled()) {
          cancelled = true;
          requestRecorderStop();
          try {
            audioSource.stop();
          } catch {
            // Ignore audio stop errors while cancelling.
          }
          finish(reject, new VideoRenderCancelledError());
          return;
        }

        if (recorderError) {
          finish(reject, recorderError);
          return;
        }

        if (recorder.state === "inactive") {
          finish(
            reject,
            new Error("The browser video recorder stopped before the song finished.")
          );
          return;
        }

        const elapsed = Math.min(
          Math.max(0, audioContext.currentTime - audioStartedAt),
          duration
        );
        const sceneIndex = drawTimelineFrame(
          ctx,
          plan,
          loadedImages,
          elapsed,
          renderConfig
        );
        const percent = Math.round(20 + (elapsed / duration) * 75);

        if (percent !== lastReportedPercent || sceneIndex !== lastReportedScene) {
          lastReportedPercent = percent;
          lastReportedScene = sceneIndex;
          reportProgress(onProgress, "rendering", percent, {
            scene: sceneIndex + 1,
            totalScenes: plan.length,
          });
        }

        // Once the audio clock reaches the end, keep drawing the exact final
        // frame until AudioBufferSourceNode.onended stops the recorder.
        animationFrameId = requestAnimationFrame(drawFrame);
      };

      renderSafetyTimeoutId = window.setTimeout(() => {
        requestRecorderStop();
        finish(
          reject,
          new Error("Video rendering did not stop after the song ended.")
        );
      }, Math.ceil((duration + 15) * 1000));

      audioStartedAt = audioContext.currentTime;
      audioSource.start(audioStartedAt);
      animationFrameId = requestAnimationFrame(drawFrame);
    });

    reportProgress(onProgress, "finalizing", 97, {
      scene: plan.length,
      totalScenes: plan.length,
    });

    await recorderStopped;

    if (recorderError) throw recorderError;
    if (isCancelled()) throw new VideoRenderCancelledError();
    if (chunks.length === 0) {
      throw new Error(
        "The browser recorder produced an empty video. Try current desktop Chrome or Chromium."
      );
    }

    const mimeType = recorder.mimeType || support.mimeType || "video/webm";
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size === 0) {
      throw new Error(
        "The browser recorder produced an empty video. Try current desktop Chrome or Chromium."
      );
    }

    reportProgress(onProgress, "complete", 100, {
      scene: plan.length,
      totalScenes: plan.length,
    });

    return {
      blob,
      mimeType,
      filename: `BeatVision-${sanitizeProjectTitle(projectTitle)}.webm`,
      duration,
      sceneCount: plan.length,
      timingSource,
      width: renderConfig.width,
      height: renderConfig.height,
      fps: renderConfig.fps,
      renderPresetId: renderConfig.id,
      renderPresetLabel: renderConfig.label,
    };
  } catch (error) {
    if (error instanceof VideoRenderCancelledError || isCancelled()) {
      cancelled = true;
      throw new VideoRenderCancelledError();
    }
    throw error;
  } finally {
    await cleanup();
  }
}
