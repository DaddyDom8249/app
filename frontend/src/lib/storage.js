const KEY = "beatvision.projects.v1";

export function loadProjects() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("loadProjects failed", e);
    return [];
  }
}

export function saveProjects(projects) {
  try {
    localStorage.setItem(KEY, JSON.stringify(projects));
    return true;
  } catch (e) {
    console.error("saveProjects failed (quota?)", e);
    return false;
  }
}

export function getProject(id) {
  return loadProjects().find((p) => p.id === id) || null;
}

export function upsertProject(project) {
  const now = new Date().toISOString();
  const projects = loadProjects();
  const idx = projects.findIndex((p) => p.id === project.id);
  const next = { ...project, updatedAt: now };
  if (idx >= 0) projects[idx] = next;
  else projects.unshift({ ...next, createdAt: now });
  return saveProjects(projects) ? next : null;
}

export function deleteProject(id) {
  const projects = loadProjects().filter((p) => p.id !== id);
  return saveProjects(projects);
}

export function newProject(fields) {
  return {
    id: crypto.randomUUID(),
    title: fields.title || "Untitled",
    artist: fields.artist || "",
    lyrics: fields.lyrics || "",
    style: fields.style || "dark_cinematic_surreal",
    notes: fields.notes || "",
    referencePhotos: fields.referencePhotos || [],
    worldReport: null,
    worldReportApproved: false,
    styleBible: null,
    styleBibleApproved: false,
    characterSheet: null,
    characterSheetApproved: false,
    environmentSheet: null,
    environmentSheetApproved: false,
    storyboardScenes: null,
    storyboardApproved: false,
    scenePrompts: null,
    scenePromptsApproved: false,
    sceneImages: {}, // sceneNumber -> { imageDataUrl, sourceType, approved, providerName, generatedAt, referencePhotoIdsUsed }
    motionPlan: null,
    createdAt: null,
    updatedAt: null,
  };
}

export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function projectStatus(p) {
  if (!p) return "missing";
  if (Object.keys(p.sceneImages || {}).some((k) => p.sceneImages[k]?.approved))
    return "in_production";
  if (p.scenePromptsApproved) return "prompts_ready";
  if (p.storyboardApproved) return "storyboard_ready";
  if (p.worldReportApproved) return "world_ready";
  return "draft";
}
