import {
  DEFAULT_RENDER_PRESET_ID,
  RENDER_PRESETS,
  buildRenderPlan,
  estimateOutputBytes,
  getRenderPreset,
  parseTimestampRange,
  sanitizeProjectTitle,
} from "./videoRenderer";

describe("BeatVision video render presets", () => {
  test("uses Standard as the default", () => {
    expect(DEFAULT_RENDER_PRESET_ID).toBe("standard");
    expect(getRenderPreset().width).toBe(1280);
    expect(getRenderPreset().height).toBe(720);
    expect(getRenderPreset().fps).toBe(24);
  });

  test("defines Mobile, Standard, and High modes", () => {
    expect(RENDER_PRESETS.mobile).toMatchObject({ width: 854, height: 480, fps: 24 });
    expect(RENDER_PRESETS.standard).toMatchObject({ width: 1280, height: 720, fps: 24 });
    expect(RENDER_PRESETS.high).toMatchObject({ width: 1280, height: 720, fps: 30 });
  });

  test("falls back to Standard for an unknown preset", () => {
    expect(getRenderPreset("unknown").id).toBe("standard");
  });

  test("estimates a larger file for higher bitrate modes", () => {
    const duration = 300;
    expect(estimateOutputBytes(duration, "mobile")).toBeGreaterThan(0);
    expect(estimateOutputBytes(duration, "standard")).toBeGreaterThan(
      estimateOutputBytes(duration, "mobile")
    );
    expect(estimateOutputBytes(duration, "high")).toBeGreaterThan(
      estimateOutputBytes(duration, "standard")
    );
  });
});

describe("BeatVision render timing", () => {
  test("parses storyboard timestamps", () => {
    expect(parseTimestampRange("0:00 - 0:15")).toEqual({
      start: 0,
      end: 15,
      duration: 15,
    });
  });

  test("keeps the total plan duration equal to the song", () => {
    const scenes = [
      { scene_number: 2, timestamp_range: "0:10 - 0:20" },
      { scene_number: 1, timestamp_range: "0:00 - 0:10" },
    ];
    const result = buildRenderPlan(scenes, 20);
    expect(result.plan.map((scene) => scene.scene_number)).toEqual([1, 2]);
    expect(result.plan[result.plan.length - 1].end).toBeCloseTo(20, 8);
    expect(
      result.plan.reduce((sum, scene) => sum + scene.duration, 0)
    ).toBeCloseTo(20, 8);
  });

  test("uses even split when timestamps are invalid", () => {
    const result = buildRenderPlan(
      [
        { scene_number: 1, timestamp_range: "bad" },
        { scene_number: 2, timestamp_range: "" },
      ],
      8
    );
    expect(result.timingSource).toBe("even_split");
    expect(result.plan[0].duration).toBeCloseTo(4, 8);
    expect(result.plan[1].duration).toBeCloseTo(4, 8);
  });

  test("sanitizes the output filename portion", () => {
    expect(sanitizeProjectTitle(" My / Song?! ")).toBe("My-Song");
  });
});


describe("BeatVision segmented render planning", () => {
  const {
    RENDER_SEGMENT_SECONDS,
    SEGMENTED_RENDER_THRESHOLD_SECONDS,
    buildRenderSegments,
    shouldUseSegmentedRender,
  } = require("./segmentedVideoRenderer");

  test("uses 45-second internal work batches", () => {
    expect(RENDER_SEGMENT_SECONDS).toBe(45);
    const segments = buildRenderSegments(300);
    expect(segments).toHaveLength(7);
    expect(segments[0]).toMatchObject({ start: 0, end: 45, duration: 45 });
    expect(segments[6]).toMatchObject({ start: 270, end: 300, duration: 30 });
  });

  test("keeps segments continuous and within the maximum duration", () => {
    const segments = buildRenderSegments(300.8);
    for (let index = 0; index < segments.length; index += 1) {
      expect(segments[index].duration).toBeGreaterThan(0);
      expect(segments[index].duration).toBeLessThanOrEqual(45);
      if (index > 0) {
        expect(segments[index].start).toBeCloseTo(
          segments[index - 1].end,
          8
        );
      }
    }
    expect(segments[segments.length - 1].end).toBeCloseTo(300.8, 8);
  });

  test("keeps short songs on the single-pass renderer", () => {
    expect(SEGMENTED_RENDER_THRESHOLD_SECONDS).toBe(50);
    expect(shouldUseSegmentedRender(50)).toBe(false);
    expect(shouldUseSegmentedRender(50.001)).toBe(true);
  });

  test("rejects invalid segment input", () => {
    expect(() => buildRenderSegments(0)).toThrow(
      "A positive render duration is required."
    );
    expect(() => buildRenderSegments(20, 0)).toThrow(
      "A positive segment duration is required."
    );
  });
});
