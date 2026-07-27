import {
  collectImageStorageKeys,
  createDurableProjectSnapshot,
  hydrateProjectFromImageMap,
} from "./imageStorage";

function makeProject() {
  return {
    id: "project-1",
    referencePhotos: [
      {
        id: "reference-1",
        imageDataUrl: "data:image/png;base64,REFERENCE",
      },
    ],
    sceneImages: {
      1: {
        imageDataUrl: "data:image/webp;base64,SCENE",
        approved: true,
        providerName: "Cloudflare Workers AI",
      },
    },
  };
}

describe("BeatVision durable image snapshots", () => {
  test("moves new inline images out of localStorage metadata", () => {
    const snapshot = createDurableProjectSnapshot(makeProject());

    expect(snapshot.writes).toEqual([
      {
        key: "reference:project-1:reference-1",
        dataUrl: "data:image/png;base64,REFERENCE",
      },
      {
        key: "scene:project-1:1",
        dataUrl: "data:image/webp;base64,SCENE",
      },
    ]);

    expect(snapshot.project.referencePhotos[0].imageDataUrl).toBe("");
    expect(snapshot.project.sceneImages[1].imageDataUrl).toBe("");
  });

  test("does not rewrite an already stored hydrated image", () => {
    const project = makeProject();
    project.sceneImages[1].imageStorageKey = "scene:project-1:1";

    const snapshot = createDurableProjectSnapshot(project);

    expect(snapshot.writes).toHaveLength(1);
    expect(snapshot.project.sceneImages[1].imageStorageKey).toBe(
      "scene:project-1:1"
    );
  });

  test("hydrates image payloads and preserves metadata", () => {
    const snapshot = createDurableProjectSnapshot(makeProject());
    const hydrated = hydrateProjectFromImageMap(
      snapshot.project,
      new Map([
        [
          "reference:project-1:reference-1",
          "data:image/png;base64,REFERENCE",
        ],
        ["scene:project-1:1", "data:image/webp;base64,SCENE"],
      ])
    );

    expect(hydrated.referencePhotos[0].imageDataUrl).toBe(
      "data:image/png;base64,REFERENCE"
    );
    expect(hydrated.sceneImages[1]).toMatchObject({
      imageDataUrl: "data:image/webp;base64,SCENE",
      approved: true,
      providerName: "Cloudflare Workers AI",
    });
  });

  test("collects only the image keys still referenced by the project", () => {
    const snapshot = createDurableProjectSnapshot(makeProject());

    expect(collectImageStorageKeys(snapshot.project).sort()).toEqual([
      "reference:project-1:reference-1",
      "scene:project-1:1",
    ]);
  });
});
