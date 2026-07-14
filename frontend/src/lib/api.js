import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API, timeout: 120000 });

function projectContext(p) {
  return {
    title: p.title,
    artist: p.artist || "",
    lyrics: p.lyrics || "",
    style: p.style,
    notes: p.notes || "",
    referencePhotos: (p.referencePhotos || []).map((r) => ({
      id: r.id,
      type: r.type,
      description: r.description || "",
      fileName: r.fileName || "",
      // Do not send imageDataUrl for text generation (saves bandwidth)
    })),
  };
}

export async function fetchProviderStatus() {
  const { data } = await client.get("/provider-status");
  return data;
}

export async function generateWorldReport(project) {
  const { data } = await client.post("/generate-world-report", projectContext(project));
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
  referenceImages,
}) {
  const { data } = await client.post("/generate-scene-image", {
    projectId,
    sceneId,
    scenePrompt,
    stylePreset,
    negativePrompt: negativePrompt || "",
    referenceImages: (referenceImages || []).map((r) => ({
      id: r.id,
      type: r.type,
      description: r.description || "",
      fileName: r.fileName || "",
      imageDataUrl: r.imageDataUrl, // required for image gen
    })),
  });
  return data;
}
