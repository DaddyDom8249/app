const DATABASE_NAME = "beatvision.assets.v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "images";

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isInlineImage(value) {
  return typeof value === "string" && /^data:image\//i.test(value);
}

function referenceKey(projectId, referenceId) {
  return `reference:${projectId}:${referenceId}`;
}

function sceneKey(projectId, sceneId) {
  return `scene:${projectId}:${sceneId}`;
}

export class DurableImageStorageError extends Error {
  constructor(message = "Durable image storage is unavailable.") {
    super(message);
    this.name = "DurableImageStorageError";
    this.code = "BEATVISION_IMAGE_STORAGE_UNAVAILABLE";
  }
}

export function createDurableProjectSnapshot(project) {
  if (!isObject(project) || !project.id) {
    throw new Error("A project id is required for durable image storage.");
  }

  const writes = [];

  const referencePhotos = (Array.isArray(project.referencePhotos)
    ? project.referencePhotos
    : []
  ).map((photo, index) => {
    if (!isObject(photo)) return photo;

    const existingKey =
      typeof photo.imageStorageKey === "string" && photo.imageStorageKey
        ? photo.imageStorageKey
        : "";
    const imageStorageKey =
      existingKey ||
      referenceKey(project.id, String(photo.id || `reference-${index + 1}`));

    if (!isInlineImage(photo.imageDataUrl)) return photo;

    if (!existingKey) {
      writes.push({ key: imageStorageKey, dataUrl: photo.imageDataUrl });
    }

    return {
      ...photo,
      imageDataUrl: "",
      imageStorageKey,
    };
  });

  const sceneImages = Object.fromEntries(
    Object.entries(isObject(project.sceneImages) ? project.sceneImages : {}).map(
      ([sceneId, image]) => {
        if (!isObject(image)) return [sceneId, image];

        const existingKey =
          typeof image.imageStorageKey === "string" && image.imageStorageKey
            ? image.imageStorageKey
            : "";
        const imageStorageKey =
          existingKey || sceneKey(project.id, String(sceneId));

        if (!isInlineImage(image.imageDataUrl)) return [sceneId, image];

        if (!existingKey) {
          writes.push({ key: imageStorageKey, dataUrl: image.imageDataUrl });
        }

        return [
          sceneId,
          {
            ...image,
            imageDataUrl: "",
            imageStorageKey,
          },
        ];
      }
    )
  );

  return {
    project: {
      ...project,
      referencePhotos,
      sceneImages,
    },
    writes,
  };
}

export function collectImageStorageKeys(project) {
  const keys = new Set();

  for (const photo of project?.referencePhotos || []) {
    if (photo?.imageStorageKey) keys.add(photo.imageStorageKey);
  }

  for (const image of Object.values(project?.sceneImages || {})) {
    if (image?.imageStorageKey) keys.add(image.imageStorageKey);
  }

  return [...keys];
}

export function hydrateProjectFromImageMap(project, imageMap) {
  const safeMap =
    imageMap instanceof Map
      ? imageMap
      : new Map(Object.entries(imageMap || {}));

  const referencePhotos = (project?.referencePhotos || []).map((photo) => {
    const dataUrl = photo?.imageStorageKey
      ? safeMap.get(photo.imageStorageKey)
      : null;

    return dataUrl ? { ...photo, imageDataUrl: dataUrl } : photo;
  });

  const sceneImages = Object.fromEntries(
    Object.entries(project?.sceneImages || {}).map(([sceneId, image]) => {
      const dataUrl = image?.imageStorageKey
        ? safeMap.get(image.imageStorageKey)
        : null;

      return [sceneId, dataUrl ? { ...image, imageDataUrl: dataUrl } : image];
    })
  );

  return {
    ...project,
    referencePhotos,
    sceneImages,
  };
}

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new DurableImageStorageError(
        "This browser does not provide IndexedDB image storage."
      )
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ||
          new DurableImageStorageError(
            "BeatVision could not open durable image storage."
          )
      );
    request.onblocked = () =>
      reject(
        new DurableImageStorageError(
          "BeatVision image storage is blocked by another open tab."
        )
      );
  });
}

async function writeImages(writes) {
  if (!writes.length) return;

  let database;
  try {
    database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      for (const write of writes) {
        store.put(write.dataUrl, write.key);
      }

      transaction.oncomplete = resolve;
      transaction.onerror = () =>
        reject(
          transaction.error ||
            new DurableImageStorageError(
              "BeatVision could not save generated image data."
            )
        );
      transaction.onabort = () =>
        reject(
          transaction.error ||
            new DurableImageStorageError(
              "BeatVision image storage was cancelled."
            )
        );
    });
  } catch (error) {
    if (error?.name === "QuotaExceededError") {
      const quotaError = new DurableImageStorageError(
        "Device browser storage is full. Remove unused BeatVision images or projects."
      );
      quotaError.code = "BEATVISION_STORAGE_QUOTA";
      throw quotaError;
    }
    if (error instanceof DurableImageStorageError) throw error;
    throw new DurableImageStorageError(
      error?.message || "BeatVision could not save generated image data."
    );
  } finally {
    database?.close();
  }
}

async function readImages(keys) {
  const images = new Map();
  if (!keys.length) return images;

  let database;
  try {
    database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);

      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => {
          if (typeof request.result === "string" && request.result) {
            images.set(key, request.result);
          }
        };
      }

      transaction.oncomplete = resolve;
      transaction.onerror = () =>
        reject(
          transaction.error ||
            new DurableImageStorageError(
              "BeatVision could not read saved image data."
            )
        );
      transaction.onabort = () =>
        reject(
          transaction.error ||
            new DurableImageStorageError(
              "BeatVision image loading was cancelled."
            )
        );
    });
    return images;
  } finally {
    database?.close();
  }
}

async function pruneImages(projectId, keepKeys) {
  if (!projectId || typeof indexedDB === "undefined") return;

  const keep = new Set(keepKeys || []);
  const prefixes = [`reference:${projectId}:`, `scene:${projectId}:`];
  let database;

  try {
    database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;

        const key = String(cursor.key);
        if (
          prefixes.some((prefix) => key.startsWith(prefix)) &&
          !keep.has(key)
        ) {
          cursor.delete();
        }
        cursor.continue();
      };

      transaction.oncomplete = resolve;
      transaction.onerror = () =>
        reject(transaction.error || new Error("Image cleanup failed."));
      transaction.onabort = () =>
        reject(transaction.error || new Error("Image cleanup was cancelled."));
    });
  } finally {
    database?.close();
  }
}

export async function persistProjectImages(project) {
  const snapshot = createDurableProjectSnapshot(project);
  await writeImages(snapshot.writes);
  await pruneImages(snapshot.project.id, collectImageStorageKeys(snapshot.project));

  if (typeof navigator !== "undefined" && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => false);
  }

  return snapshot.project;
}

export async function hydrateProjectImages(project) {
  const keys = collectImageStorageKeys(project);
  if (!keys.length) return project;

  const images = await readImages(keys);
  return hydrateProjectFromImageMap(project, images);
}

export async function deleteProjectImages(projectId) {
  await pruneImages(projectId, []);
}
