import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const IMAGE_TEST_URL = process.env.REACT_APP_IMAGE_TEST_URL || "";

export const API = `${BACKEND_URL}/api`;
const IMAGE_API = IMAGE_TEST_URL ? `${IMAGE_TEST_URL}/api` : API;

const client = axios.create({
  baseURL: API,
  timeout: 120000,
});

const imageClient = axios.create({
  baseURL: IMAGE_API,
  timeout: 210000,
});

function projectContext(project) {
  const lyrics = (project.lyrics || "").slice(0, 1200);
  const notes = (project.notes || "").slice(0, 500);

  return {
    title: (project.title || "").slice(0, 120),
    artist: (project.artist || "").slice(0, 80),
    lyrics,
    style: project.style,
    notes,
    referencePhotos: (project.referencePhotos || []).map((reference) => ({
      id: reference.id,
      type: reference.type,
      description: (reference.description || "").slice(0, 160),
      fileName: (reference.fileName || "").slice(0, 80),
    })),
  };
}

export async function fetchProviderStatus() {
  const { data: primaryStatus } = await client.get("/provider-status");

  if (!IMAGE_TEST_URL) {
    return primaryStatus;
  }

  try {
    const { data: imageStatus } = await imageClient.get("/provider-status");

    return {
      ...primaryStatus,
      image_generation:
        imageStatus.image_generation ||
        primaryStatus.image_generation,
      reference_photo_image_generation:
        imageStatus.reference_photo_image_generation ||
        primaryStatus.reference_photo_image_generation,
    };
  } catch (error) {
    console.warn("Free image test provider is unavailable", error);
    return primaryStatus;
  }
}

export async function generateWorldReport(project) {
  const { data } = await client.post(
    "/generate-world-report",
    projectContext(project)
  );
  return data;
}

export async function generateWorldAssets(project) {
  const { data } = await client.post("/generate-world-assets", {
    ...projectContext(project),
    worldReport: project.worldReport,
  });
  return data;
}

export async function generateStoryboard(project) {
  const { data } = await client.post("/generate-storyboard", {
    ...projectContext(project),
    worldReport: project.worldReport,
    styleBible: project.styleBible,
    characterSheet: project.characterSheet,
    environmentSheet: project.environmentSheet,
  });
  return data;
}

export async function generateScenePrompts(project) {
  const { data } = await client.post("/generate-scene-prompts", {
    ...projectContext(project),
    worldReport: project.worldReport,
    styleBible: project.styleBible,
    characterSheet: project.characterSheet,
    environmentSheet: project.environmentSheet,
    storyboard: project.storyboardScenes || [],
  });
  return data;
}

export async function generateSceneImage({
  projectId,
  sceneId,
  scenePrompt,
  stylePreset,
  negativePrompt,
  characterConsistencyNotes,
  environmentConsistencyNotes,
  referenceImages,
}) {
  const promptGuidedTest = Boolean(IMAGE_TEST_URL);

  const { data } = await imageClient.post("/generate-scene-image", {
    projectId,
    sceneId,
    scenePrompt,
    stylePreset,
    negativePrompt: negativePrompt || "",
    characterConsistencyNotes:
      characterConsistencyNotes || "",
    environmentConsistencyNotes:
      environmentConsistencyNotes || "",
    referenceImages: (referenceImages || []).map((reference) => ({
      id: reference.id,
      type: reference.type,
      description: reference.description || "",
      fileName: reference.fileName || "",
      imageDataUrl: promptGuidedTest
        ? undefined
        : reference.imageDataUrl,
    })),
  });

  return data;
}
