/*
 * Deterministic long-song renderer.
 *
 * Long exports are encoded as fixed-timestamp frames in 45-second work batches,
 * then written into one properly muxed WebM file. The batches are an internal
 * rendering strategy, not separate files and not naive Blob concatenation.
 */

export const SEGMENTED_RENDER_THRESHOLD_SECONDS = 50;
export const RENDER_SEGMENT_SECONDS = 45;
export const SEGMENTED_RENDER_CANCELLED_CODE = "BEATVISION_RENDER_CANCELLED";
export const SEGMENTED_RENDER_UNSUPPORTED_CODE =
  "BEATVISION_SEGMENTED_UNSUPPORTED";

export class SegmentedRenderUnsupportedError extends Error {
  constructor(message = "Segmented WebM rendering is unavailable in this browser.") {
    super(message);
    this.name = "SegmentedRenderUnsupportedError";
    this.code = SEGMENTED_RENDER_UNSUPPORTED_CODE;
  }
}

export class SegmentedRenderCancelledError extends Error {
  constructor(message = "Video rendering was cancelled.") {
    super(message);
    this.name = "SegmentedRenderCancelledError";
    this.code = SEGMENTED_RENDER_CANCELLED_CODE;
  }
}

export function buildRenderSegments(
  duration,
  segmentSeconds = RENDER_SEGMENT_SECONDS
) {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("A positive render duration is required.");
  }
  if (!Number.isFinite(segmentSeconds) || segmentSeconds <= 0) {
    throw new Error("A positive segment duration is required.");
  }

  const count = Math.max(1, Math.ceil(duration / segmentSeconds));
  return Array.from({ length: count }, (_, index) => {
    const start = index * segmentSeconds;
    const end = index === count - 1
      ? duration
      : Math.min(duration, start + segmentSeconds);

    return {
      index,
      number: index + 1,
      start,
      end,
      duration: Math.max(0, end - start),
    };
  });
}

export function shouldUseSegmentedRender(duration) {
  return (
    Number.isFinite(duration) &&
    duration > SEGMENTED_RENDER_THRESHOLD_SECONDS
  );
}

export function getSegmentedRenderSupport() {
  if (typeof window === "undefined") {
    return {
      supported: false,
      reason: "Segmented rendering requires a browser.",
    };
  }

  if (
    typeof window.VideoEncoder !== "function" ||
    typeof window.AudioEncoder !== "function"
  ) {
    return {
      supported: false,
      reason: "WebCodecs video and audio encoding are unavailable.",
    };
  }

  return { supported: true, reason: "" };
}

function throwIfCancelled(shouldCancel) {
  if (shouldCancel?.()) {
    throw new SegmentedRenderCancelledError();
  }
}

function yieldToBrowser(milliseconds = 0) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function sliceAudioBuffer(audioContext, source, startSeconds, endSeconds) {
  const sampleRate = source.sampleRate;
  const startFrame = Math.max(
    0,
    Math.min(source.length, Math.round(startSeconds * sampleRate))
  );
  const endFrame = Math.max(
    startFrame,
    Math.min(source.length, Math.round(endSeconds * sampleRate))
  );
  const frameCount = Math.max(1, endFrame - startFrame);
  const chunk = audioContext.createBuffer(
    source.numberOfChannels,
    frameCount,
    sampleRate
  );

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const values = source
      .getChannelData(channel)
      .subarray(startFrame, endFrame);
    chunk.copyToChannel(values, channel, 0);
  }

  return chunk;
}

async function resolveCodecs(mediabunny, format, renderConfig, audioBuffer) {
  const containableVideoCodecs = format
    .getSupportedVideoCodecs()
    .filter((codec) => codec === "vp9" || codec === "vp8");
  const containableAudioCodecs = format
    .getSupportedAudioCodecs()
    .filter((codec) => codec === "opus" || codec === "vorbis");

  const videoCodec = await mediabunny.getFirstEncodableVideoCodec(
    containableVideoCodecs,
    {
      width: renderConfig.width,
      height: renderConfig.height,
      bitrate: renderConfig.videoBitsPerSecond,
    }
  );
  const audioCodec = await mediabunny.getFirstEncodableAudioCodec(
    containableAudioCodecs,
    {
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
      bitrate: renderConfig.audioBitsPerSecond,
    }
  );

  if (!videoCodec || !audioCodec) {
    throw new SegmentedRenderUnsupportedError(
      "This browser cannot encode the VP8/VP9 and Opus/Vorbis combination required for segmented WebM export."
    );
  }

  return { videoCodec, audioCodec };
}

export async function renderSegmentedWebM({
  canvas,
  audioContext,
  audioBuffer,
  duration,
  renderConfig,
  drawFrame,
  onProgress,
  shouldCancel,
}) {
  const basicSupport = getSegmentedRenderSupport();
  if (!basicSupport.supported) {
    throw new SegmentedRenderUnsupportedError(basicSupport.reason);
  }

  throwIfCancelled(shouldCancel);

  const mediabunny = await import("mediabunny");
  const format = new mediabunny.WebMOutputFormat();
  const { videoCodec, audioCodec } = await resolveCodecs(
    mediabunny,
    format,
    renderConfig,
    audioBuffer
  );

  throwIfCancelled(shouldCancel);

  const target = new mediabunny.BufferTarget();
  const output = new mediabunny.Output({ format, target });
  const videoSource = new mediabunny.CanvasSource(canvas, {
    codec: videoCodec,
    bitrate: renderConfig.videoBitsPerSecond,
  });
  const audioSource = new mediabunny.AudioBufferSource({
    codec: audioCodec,
    bitrate: renderConfig.audioBitsPerSecond,
  });

  output.addVideoTrack(videoSource, { frameRate: renderConfig.fps });
  output.addAudioTrack(audioSource);

  const segments = buildRenderSegments(duration);
  const totalFrames = Math.max(1, Math.ceil(duration * renderConfig.fps));
  let frameIndex = 0;

  const report = (stage, percent, details = {}) => {
    onProgress?.({
      stage,
      percent,
      segment: details.segment,
      totalSegments: segments.length,
      frame: frameIndex,
      totalFrames,
      timestamp: details.timestamp,
    });
  };

  try {
    report("preparing_encoder", 20, {
      segment: 1,
      timestamp: 0,
    });
    await output.start();

    for (const segment of segments) {
      throwIfCancelled(shouldCancel);

      report("encoding_audio", 20 + (segment.index / segments.length) * 75, {
        segment: segment.number,
        timestamp: segment.start,
      });

      const audioChunk = sliceAudioBuffer(
        audioContext,
        audioBuffer,
        segment.start,
        segment.end
      );
      await audioSource.add(audioChunk);
      throwIfCancelled(shouldCancel);

      const segmentEndFrame =
        segment.index === segments.length - 1
          ? totalFrames
          : Math.min(
              totalFrames,
              Math.ceil(segment.end * renderConfig.fps)
            );

      while (frameIndex < segmentEndFrame) {
        throwIfCancelled(shouldCancel);

        const timestamp = frameIndex / renderConfig.fps;
        const frameDuration = Math.max(
          Number.EPSILON,
          Math.min(1 / renderConfig.fps, duration - timestamp)
        );
        drawFrame(timestamp);

        const keyFrameInterval = Math.max(
          1,
          Math.round(renderConfig.fps * 2)
        );
        const isSegmentStart =
          frameIndex === Math.round(segment.start * renderConfig.fps);

        await videoSource.add(timestamp, frameDuration, {
          keyFrame:
            isSegmentStart || frameIndex % keyFrameInterval === 0,
        });

        frameIndex += 1;

        if (frameIndex % 12 === 0 || frameIndex === totalFrames) {
          const percent = 20 + (frameIndex / totalFrames) * 75;
          report("rendering_segmented", percent, {
            segment: segment.number,
            timestamp: Math.min(duration, timestamp),
          });
          await yieldToBrowser(0);
        }
      }

      await yieldToBrowser(25);
    }

    throwIfCancelled(shouldCancel);

    videoSource.close();
    audioSource.close();
    report("muxing", 97, {
      segment: segments.length,
      timestamp: duration,
    });

    await output.finalize();
    throwIfCancelled(shouldCancel);

    const buffer = target.buffer;
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) {
      throw new Error("The segmented renderer produced an empty WebM file.");
    }

    const mimeType = (await output.getMimeType()) || "video/webm";
    const blob = new Blob([buffer], { type: mimeType });

    if (blob.size === 0) {
      throw new Error("The segmented renderer produced an empty WebM file.");
    }

    report("complete", 100, {
      segment: segments.length,
      timestamp: duration,
    });

    return {
      blob,
      mimeType,
      segmentCount: segments.length,
      renderMode: "segmented_webcodecs",
      videoCodec,
      audioCodec,
      totalFrames,
    };
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") {
      try {
        await output.cancel();
      } catch {
        // The original rendering error is more useful than a cleanup error.
      }
    }

    if (
      error?.code === SEGMENTED_RENDER_CANCELLED_CODE ||
      shouldCancel?.()
    ) {
      throw new SegmentedRenderCancelledError();
    }

    throw error;
  }
}
