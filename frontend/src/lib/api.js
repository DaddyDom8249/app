import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API, timeout: 120000 });

function projectContext(p) {
  // Keep only lightweight metadata for text-generation calls.
  // Full base64 image data is sent ONLY to /generate-scene-image (Gemini) on user click.
  const lyrics = (p.lyrics || "").slice(0, 1200);
  const notes = (p.notes || "").slice(0, 500);
  return {
    title: (p.title || "").slice(0, 120),
    artist: (p.artist || "").slice(0, 80),
    lyrics,
    style: p.style,
    notes,
    referencePhotos: (p.referencePhotos || []).map((r) => ({
      id: r.id,
      type: r.type,
      description: (r.description || "").slice(0, 160),
      fileName: (r.fileName || "").slice(0, 80),
      // NO imageDataUrl for text generation.
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
