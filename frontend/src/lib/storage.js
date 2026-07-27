import {
  deleteProjectImages,
  hydrateProjectImages,
  persistProjectImages,
} from "./imageStorage";

const KEY = "beatvision.projects.v1";

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanIdArray(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((id) => typeof id === "string" && id))]
    : [];
}

export class StorageQuotaError extends Error {
  constructor(message = "Browser storage is full.") {
    super(message);
    this.name = "StorageQuotaError";
    this.code = "BEATVISION_STORAGE_QUOTA";
  }
}

export function isStorageQuotaError(error) {
  return (
    error instanceof StorageQuotaError ||
    error?.name === "QuotaExceededError" ||
    error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error?.code === 22 ||
    error?.code === 1014 ||
    error?.code === "BEATVISION_STORAGE_QUOTA"
  );
}

export function normalizeProject(project) {
  if (!isObject(project)) return project;

  const referencePhotos = Array.isArray(project.referencePhotos)
    ? project.referencePhotos.filter(Boolean)
    : [];

  const sceneImages = isObject(project.sceneImages)
    ? project.sceneImages
    : {};

  const sceneReferencePhotoIds = isObject(project.sceneReferencePhotoIds)
    ? Object.fromEntries(
        Object.entries(project.sceneReferencePhotoIds).map(([key, ids]) => [
          String(key),
          cleanIdArray(ids),
        ])
      )
    : {};

  for (const scene of Array.isArray(project.storyboardScenes)
    ? project.storyboardScenes
    : []) {
    const key = String(scene?.scene_number ?? scene?.id ?? "");
    if (!key) continue;

    if (
      !Object.prototype.hasOwnProperty.call(sceneReferencePhotoIds, key) &&
      Array.isArray(scene?.reference_photo_overrides)
    ) {
      sceneReferencePhotoIds[key] = cleanIdArray(
        scene.reference_photo_overrides
      );
    }
  }

  return {
    ...project,
    referencePhotos,
    sceneImages,
    sceneReferencePhotoIds,
  };
}

export function loadProjects() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map(normalizeProject).filter(Boolean);
  } catch (error) {
    console.error("loadProjects failed", error);
    return [];
  }
}

export function saveProjects(projects) {
  const normalized = Array.isArray(projects)
    ? projects.map(normalizeProject).filter(Boolean)
    : [];

  try {
    localStorage.setItem(KEY, JSON.stringify(normalized));
    return true;
  } catch (error) {
    console.error("saveProjects failed", error);

    if (isStorageQuotaError(error)) {
      throw new StorageQuotaError(
        "Browser storage is full. Remove large reference or scene images before adding more."
      );
    }

    throw error;
  }
}

export function getProject(id) {
  return loadProjects().find((project) => project.id === id) || null;
}

export async function getProjectDurable(id) {
  const project = getProject(id);
  if (!project) return null;

  const metadataProject = await persistProjectImages(project);
  const savedProject = upsertProject(metadataProject);

  try {
    return await hydrateProjectImages(savedProject);
  } catch (error) {
    console.error("Project image hydration failed", error);
    return savedProject;
  }
}

export function upsertProject(project) {
  const now = new Date().toISOString();
  const projects = loadProjects();
  const normalized = normalizeProject(project);
  const index = projects.findIndex((item) => item.id === normalized.id);

  const next = normalizeProject({
    ...normalized,
    updatedAt: now,
  });

  if (index >= 0) {
    projects[index] = next;
  } else {
    projects.unshift({
      ...next,
      createdAt: next.createdAt || now,
    });
  }

  saveProjects(projects);
  return next;
}

export async function upsertProjectDurable(project) {
  const metadataProject = await persistProjectImages(project);
  return upsertProject(metadataProject);
}

export function deleteProject(id) {
  const projects = loadProjects().filter(
    (project) => project.id !== id
  );
  const saved = saveProjects(projects);

  deleteProjectImages(id).catch((error) => {
    console.error("Project image cleanup failed", error);
  });

  return saved;
}

export function newProject(fields) {
  return normalizeProject({
    id: crypto.randomUUID(),
    title: fields.title || "Untitled",
    artist: fields.artist || "",
    lyrics: fields.lyrics || "",
    style: fields.style || "dark_cinematic_surreal",
    notes: fields.notes || "",
    referencePhotos: Array.isArray(fields.referencePhotos)
      ? fields.referencePhotos
      : [],
    worldReport: null,
    worldReportApproved: false,
    styleBible: null,
    styleBibleApproved: false,
    characterSheet: null,
    characterSheetApproved: false,
    environmentSheet: null,
    environmentSheetApproved: false,
    worldAssetsFallback: null,
    storyboardScenes: null,
    storyboardApproved: false,
    storyboardFallback: null,
    scenePrompts: null,
    scenePromptsApproved: false,
    scenePromptsFallback: null,
    sceneImages: {},
    sceneReferencePhotoIds: {},
    motionPlan: null,
    createdAt: null,
    updatedAt: null,
  });
}

export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function projectStatus(project) {
  if (!project) return "missing";

  if (
    Object.keys(project.sceneImages || {}).some(
      (key) => project.sceneImages[key]?.approved
    )
  ) {
    return "in_production";
  }

  if (project.scenePromptsApproved) return "prompts_ready";
  if (project.storyboardApproved) return "storyboard_ready";
  if (project.worldReportApproved) return "world_ready";
  return "draft";
}
