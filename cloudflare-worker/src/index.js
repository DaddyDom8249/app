const MODEL = "@cf/black-forest-labs/flux-1-schnell";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-BeatVision-Key",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function cleanText(value, maximumLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

function suppliedAccessKey(request) {
  const direct = request.headers.get("X-BeatVision-Key");

  if (direct) {
    return direct.trim();
  }

  const authorization =
    request.headers.get("Authorization") || "";

  return authorization.replace(/^Bearer\s+/i, "").trim();
}

function isAuthorized(request, env) {
  const supplied = suppliedAccessKey(request);

  return Boolean(
    env.BEATVISION_ACCESS_KEY &&
      supplied &&
      supplied === env.BEATVISION_ACCESS_KEY,
  );
}

function referenceMetadata(body) {
  const references = Array.isArray(body.referenceImages)
    ? body.referenceImages
    : [];

  const descriptions = references
    .filter(
      (reference) =>
        reference && typeof reference === "object",
    )
    .map((reference) => {
      const type = cleanText(
        reference.type || "reference",
        60,
      );

      const description = cleanText(
        reference.description ||
          reference.fileName ||
          "visual reference",
        180,
      );

      return `${type}: ${description}`;
    })
    .slice(0, 12);

  return descriptions.length
    ? descriptions.join("; ")
    : "No reference metadata selected.";
}

function buildPrompt(body) {
  return [
    "Create one original cinematic music-video still.",
    "Use dramatic professional lighting and strong visual composition.",
    "Keep the main subject coherent and visually consistent.",
    "Do not include text, captions, logos, signatures, or watermarks.",
    `Visual style: ${
      cleanText(body.stylePreset, 200) || "dark cinematic"
    }.`,
    `Scene description: ${cleanText(body.scenePrompt, 1000)}.`,
    `Character continuity: ${
      cleanText(body.characterConsistencyNotes, 300) ||
      "Maintain one consistent protagonist."
    }.`,
    `Environment continuity: ${
      cleanText(body.environmentConsistencyNotes, 300) ||
      "Maintain a consistent environment."
    }.`,
    `Reference metadata: ${referenceMetadata(body)}.`,
    `Avoid: ${
      cleanText(body.negativePrompt, 350) ||
      "blur, distorted anatomy, duplicate subjects, text, watermark"
    }.`,
  ]
    .join(" ")
    .slice(0, 2048);
}

function providerStatus(env) {
  const connected = Boolean(
    env.AI && env.BEATVISION_ACCESS_KEY,
  );

  return {
    image_generation: {
      connected,
      provider: connected
        ? "Cloudflare FLUX.1 Schnell (Worker)"
        : null,
      purpose: "BeatVision scene-image generation",
      status: connected ? "ready" : "not_connected",
      mode: "worker_ai_binding",
      references_directly_used: false,
    },
    reference_photo_image_generation: {
      connected: false,
      provider: null,
      purpose:
        "Reference descriptions guide the prompt; reference pixels are not sent.",
      status: "metadata_prompt_only",
      mode: "metadata_prompt_only",
    },
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (
      request.method === "GET" &&
      (
        url.pathname === "/" ||
        url.pathname === "/api/" ||
        url.pathname === "/api/health"
      )
    ) {
      return jsonResponse({
        service:
          "BeatVision Cloudflare Worker Image Provider",
        status: "ok",
        mode: "worker_ai_binding",
        model: MODEL,
        aiBindingConfigured: Boolean(env.AI),
        accessKeyConfigured: Boolean(
          env.BEATVISION_ACCESS_KEY,
        ),
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/provider-status"
    ) {
      return jsonResponse(providerStatus(env));
    }

    if (
      request.method !== "POST" ||
      url.pathname !== "/api/generate-scene-image"
    ) {
      return jsonResponse(
        {
          detail: "Route not found.",
        },
        404,
      );
    }

    if (!isAuthorized(request, env)) {
      return jsonResponse(
        {
          detail:
            "BeatVision Worker access key is missing or invalid.",
        },
        403,
      );
    }

    if (!env.AI) {
      return jsonResponse(
        {
          detail:
            "Cloudflare Workers AI binding is not configured.",
        },
        503,
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        {
          detail:
            "The request body must contain valid JSON.",
        },
        400,
      );
    }

    const scenePrompt = cleanText(
      body.scenePrompt,
      1000,
    );

    if (!scenePrompt) {
      return jsonResponse(
        {
          detail: "Scene prompt is required.",
        },
        400,
      );
    }

    const prompt = buildPrompt(body);
    const seed = Math.floor(
      Math.random() * 2147483647,
    );

    try {
      const result = await env.AI.run(MODEL, {
        prompt,
        steps: 4,
        seed,
      });

      if (!result?.image) {
        throw new Error(
          "Workers AI returned no image data.",
        );
      }

      const references = Array.isArray(body.referenceImages)
        ? body.referenceImages
        : [];

      const referencePhotoIdsUsed = references
        .map((reference) => reference?.id)
        .filter(Boolean)
        .map(String);

      return jsonResponse({
        generatedImageBase64:
          `data:image/jpeg;base64,${result.image}`,
        providerName:
          "Cloudflare FLUX.1 Schnell (Worker)",
        createdAt: new Date().toISOString(),
        referencePhotoIdsUsed,
        referenceMode: "metadata_prompt_only",
        model: MODEL,
        seed,
      });
    } catch (error) {
      console.error(
        "BeatVision generation failed:",
        error,
      );

      return jsonResponse(
        {
          detail:
            "Cloudflare Worker image generation failed. Manual upload remains available.",
        },
        503,
      );
    }
  },
};
