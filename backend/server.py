from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import json
import re
import asyncio
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from json_repair import repair_json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"
GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("beatvision")

app = FastAPI(title="BeatVision API")
api_router = APIRouter(prefix="/api")


# ------------------------------------------------------------
# Models
# ------------------------------------------------------------
class ReferencePhotoPayload(BaseModel):
    id: str
    type: str  # main_character | environment | outfit | object_symbol | mood
    description: Optional[str] = ""
    fileName: Optional[str] = ""
    imageDataUrl: Optional[str] = None  # data:image/png;base64,....


class ProjectContext(BaseModel):
    title: str
    artist: Optional[str] = ""
    lyrics: Optional[str] = ""
    style: str
    notes: Optional[str] = ""
    referencePhotos: List[ReferencePhotoPayload] = Field(default_factory=list)


class WorldReportRequest(ProjectContext):
    pass


class WorldAssetsRequest(ProjectContext):
    worldReport: dict


class StoryboardRequest(ProjectContext):
    worldReport: dict
    styleBible: dict
    characterSheet: dict
    environmentSheet: dict


class ScenePromptsRequest(ProjectContext):
    worldReport: dict
    styleBible: dict
    characterSheet: dict
    environmentSheet: dict
    storyboard: List[dict]


class SceneImageRequest(BaseModel):
    projectId: str
    sceneId: str
    scenePrompt: str
    stylePreset: str
    negativePrompt: Optional[str] = ""
    referenceImages: List[ReferencePhotoPayload] = Field(default_factory=list)


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
def _summarize_photos(photos: List[ReferencePhotoPayload]) -> str:
    if not photos:
        return "(no reference photos uploaded)"
    lines = []
    for p in photos:
        lines.append(f"- [{p.type}] {p.fileName or 'photo'}: {p.description or 'no description'}")
    return "\n".join(lines)


def _extract_json(raw: str) -> dict:
    """Extract JSON from Claude's response even if wrapped in code fences or prose.
    Uses json_repair to tolerate unescaped newlines / trailing commas / minor malformations."""
    def _parse(s: str) -> dict:
        try:
            return json.loads(s)
        except Exception:
            repaired = repair_json(s, return_objects=False)
            return json.loads(repaired)

    # try fenced ```json ... ```
    m = re.search(r"```json\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if m:
        return _parse(m.group(1))
    m = re.search(r"```\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if m:
        return _parse(m.group(1))
    # find first { .... last }
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        return _parse(raw[start : end + 1])
    raise ValueError("No JSON object found in model response")


async def _claude_json(system: str, user_text: str, session_id: str) -> dict:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured on server.")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system,
    ).with_model("anthropic", CLAUDE_MODEL).with_params(max_tokens=4096)
    msg = UserMessage(text=user_text)
    response = await chat.send_message(msg)
    text = response if isinstance(response, str) else str(response)
    try:
        return _extract_json(text)
    except Exception as e:
        logger.error(f"Failed to parse Claude JSON: {e}. Raw first 300: {text[:300]}")
        raise HTTPException(status_code=502, detail="Model returned invalid JSON. Please regenerate.")


# ------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"service": "BeatVision", "status": "ok"}


@api_router.get("/provider-status")
async def provider_status():
    image_ready = bool(EMERGENT_LLM_KEY)
    text_ready = bool(EMERGENT_LLM_KEY)
    return {
        "text_analysis": {
            "connected": text_ready,
            "provider": "Anthropic Claude Sonnet 4.5 (via Emergent)" if text_ready else None,
            "status": "ready" if text_ready else "demo_mode",
        },
        "image_generation": {
            "connected": image_ready,
            "provider": "Gemini Nano Banana (via Emergent)" if image_ready else None,
            "status": "ready" if image_ready else "not_connected",
        },
        "reference_photo_image_generation": {
            "connected": image_ready,
            "provider": "Gemini Nano Banana (via Emergent)" if image_ready else None,
            "status": "ready" if image_ready else "not_connected",
        },
        "motion_generation": {"connected": False, "status": "not_connected"},
        "video_export": {"connected": False, "status": "demo_plan_only"},
    }


@api_router.post("/generate-world-report")
async def generate_world_report(req: WorldReportRequest):
    photos_txt = _summarize_photos(req.referencePhotos)
    system = (
        "You are BeatVision — an award-winning music video creative director. "
        "Return ONLY a JSON object matching the requested schema. No prose outside JSON."
    )
    user = f"""Song title: {req.title}
Artist: {req.artist or 'Unknown'}
Style preset: {req.style}
Creator notes: {req.notes or '(none)'}
Uploaded reference photos:
{photos_txt}

Lyrics:
{req.lyrics or '(none provided — infer emotion from title + style)'}

Return this JSON schema:
{{
  "song_title": string,
  "artist": string,
  "selected_style": string,
  "reference_photos_used": [string],           // brief summary per photo used
  "core_emotional_themes": [string],
  "mood": string,
  "logline": string,
  "visual_world_setting": string,
  "main_protagonist": string,
  "visual_conflict": string,
  "color_palette": [string],
  "symbols": [string],
  "camera_language": string,
  "seven_story_beats": [                        // exactly 7 items
    {{"beat": int, "title": string, "description": string}}
  ],
  "ai_visual_direction_prompt": string,
  "creator_memory_style_note": string,
  "reference_photo_influence": string,          // how uploaded photos shape the direction
  "approval_questions": [string]
}}"""
    data = await _claude_json(system, user, f"world-report-{uuid.uuid4()}")
    return data


@api_router.post("/generate-world-assets")
async def generate_world_assets(req: WorldAssetsRequest):
    """Split into 3 concurrent Claude calls to stay under Cloudflare's ~60s ingress timeout."""
    photos_txt = _summarize_photos(req.referencePhotos)
    world_ctx = json.dumps(req.worldReport)[:2500]
    header = f"Song: {req.title} by {req.artist or 'Unknown'} | Style: {req.style}\nReference photos:\n{photos_txt}\n\nApproved World Report:\n{world_ctx}\n\n"

    style_prompt = header + """Return ONLY this JSON:
{
  "overall_look": string,
  "lighting": string,
  "color_rules": string,
  "camera_rules": string,
  "texture_material_rules": string,
  "symbol_rules": string,
  "reference_photo_usage_rules": string,
  "what_to_avoid": string
}"""
    character_prompt = header + """Return ONLY this JSON for the main character sheet:
{
  "name_role": string,
  "appearance": string,
  "clothing": string,
  "emotional_state": string,
  "signature_object": string,
  "consistency_rules": string,
  "character_reference_photo_notes": string
}"""
    environment_prompt = header + """Return ONLY this JSON for the environment sheet:
{
  "main_location": string,
  "atmosphere": string,
  "time_of_day": string,
  "weather": string,
  "key_objects": [string],
  "background_details": string,
  "consistency_rules": string,
  "environment_reference_photo_notes": string
}"""
    system = "You are BeatVision. Return ONLY the requested JSON object. No prose."
    sid = uuid.uuid4()
    style, character, environment = await asyncio.gather(
        _claude_json(system, style_prompt, f"world-assets-style-{sid}"),
        _claude_json(system, character_prompt, f"world-assets-char-{sid}"),
        _claude_json(system, environment_prompt, f"world-assets-env-{sid}"),
    )
    return {
        "world_style_bible": style,
        "character_sheet": character,
        "environment_sheet": environment,
    }


@api_router.post("/generate-storyboard")
async def generate_storyboard(req: StoryboardRequest):
    """Split into 2 concurrent calls (scenes 1-4 and 5-8) to fit the 60s timeout."""
    photos_txt = _summarize_photos(req.referencePhotos)
    ref_ids = [p.id for p in req.referencePhotos]
    header = f"""Song: {req.title} by {req.artist or 'Unknown'} | Style: {req.style}
Lyrics: {req.lyrics or '(none)'}
Available reference photo ids: {ref_ids}
Reference photos:
{photos_txt}

World Report summary: {json.dumps(req.worldReport)[:1200]}
Style Bible summary: {json.dumps(req.styleBible)[:800]}
Character Sheet summary: {json.dumps(req.characterSheet)[:600]}
Environment Sheet summary: {json.dumps(req.environmentSheet)[:600]}

"""
    schema = """Return ONLY this JSON:
{
  "scenes": [
    {
      "scene_number": int,
      "timestamp_range": string,
      "scene_title": string,
      "description": string,
      "camera_movement": string,
      "color_emphasis": string,
      "symbol": string,
      "reference_photo_ids": [string],
      "visual_prompt": string
    }
  ]
}
"""
    system = "You are BeatVision. Return ONLY the requested JSON. No prose."
    p1 = header + schema + "Provide EXACTLY 4 scenes with scene_number 1,2,3,4 (opening act)."
    p2 = header + schema + "Provide EXACTLY 4 scenes with scene_number 5,6,7,8 (climax + resolution). Continue the narrative arc."

    sid = uuid.uuid4()
    part1, part2 = await asyncio.gather(
        _claude_json(system, p1, f"storyboard-a-{sid}"),
        _claude_json(system, p2, f"storyboard-b-{sid}"),
    )
    scenes = (part1.get("scenes") or []) + (part2.get("scenes") or [])
    # ensure sorted 1..8
    scenes.sort(key=lambda s: s.get("scene_number", 0))
    return {"scenes": scenes}


@api_router.post("/generate-scene-prompts")
async def generate_scene_prompts(req: ScenePromptsRequest):
    """Split into 2 concurrent calls: prompts 1-4 and 5-8."""
    photos_txt = _summarize_photos(req.referencePhotos)
    header = f"""Song: {req.title} | Style: {req.style}
Reference photos:
{photos_txt}

Style Bible: {json.dumps(req.styleBible)[:1000]}
Character Sheet: {json.dumps(req.characterSheet)[:700]}
Environment Sheet: {json.dumps(req.environmentSheet)[:700]}
"""
    schema = """Return ONLY this JSON:
{
  "prompts": [
    {
      "scene_number": int,
      "scene_description": string,
      "character_consistency_notes": string,
      "environment_consistency_notes": string,
      "uploaded_reference_photo_guidance": string,
      "style_bible_notes": string,
      "camera_angle": string,
      "lighting": string,
      "mood": string,
      "negative_prompt": string,
      "final_polished_prompt": string
    }
  ]
}
"""
    system = "You are BeatVision. Return ONLY the requested JSON. No prose."
    sb_first = [s for s in (req.storyboard or []) if s.get("scene_number", 0) <= 4]
    sb_second = [s for s in (req.storyboard or []) if s.get("scene_number", 0) >= 5]
    p1 = header + f"Storyboard scenes 1-4: {json.dumps(sb_first)[:2500]}\n\n" + schema + "Return EXACTLY 4 prompts for scene_number 1,2,3,4."
    p2 = header + f"Storyboard scenes 5-8: {json.dumps(sb_second)[:2500]}\n\n" + schema + "Return EXACTLY 4 prompts for scene_number 5,6,7,8."

    sid = uuid.uuid4()
    part1, part2 = await asyncio.gather(
        _claude_json(system, p1, f"scene-prompts-a-{sid}"),
        _claude_json(system, p2, f"scene-prompts-b-{sid}"),
    )
    prompts = (part1.get("prompts") or []) + (part2.get("prompts") or [])
    prompts.sort(key=lambda p: p.get("scene_number", 0))
    return {"prompts": prompts}


@api_router.post("/generate-scene-image")
async def generate_scene_image(req: SceneImageRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="Image provider is not configured.")

    # Build ImageContent list from reference photos (strip data URL prefix if present)
    image_contents = []
    for photo in req.referenceImages:
        if not photo.imageDataUrl:
            continue
        b64 = photo.imageDataUrl
        if "," in b64 and b64.startswith("data:"):
            b64 = b64.split(",", 1)[1]
        try:
            image_contents.append(ImageContent(b64))
        except Exception as e:
            logger.warning(f"Skipping malformed reference image: {e}")

    ref_desc_lines = []
    for p in req.referenceImages:
        ref_desc_lines.append(f"[{p.type}] {p.description or p.fileName or 'reference photo'}")
    ref_desc = "\n".join(ref_desc_lines) if ref_desc_lines else "(no reference photos)"

    prompt = f"""Create a cinematic music-video still.
Style preset: {req.stylePreset}
Scene prompt: {req.scenePrompt}
Reference photo guidance (visual continuity — mirror these):
{ref_desc}
Avoid: {req.negativePrompt or 'blur, low quality, watermark, distorted anatomy'}"""

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"scene-img-{req.sceneId}-{uuid.uuid4()}",
            system_message="You are a cinematic still photographer AI. Produce one high quality image.",
        ).with_model("gemini", GEMINI_IMAGE_MODEL).with_params(modalities=["image", "text"])

        msg = UserMessage(text=prompt, file_contents=image_contents if image_contents else None)
        text, images = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        logger.exception("Image generation failed")
        raise HTTPException(status_code=502, detail=f"Image provider error: {str(e)[:200]}")

    if not images:
        raise HTTPException(status_code=502, detail="Image provider returned no image.")

    img = images[0]
    return {
        "generatedImageBase64": f"data:{img.get('mime_type','image/png')};base64,{img['data']}",
        "providerName": "Gemini Nano Banana",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "referencePhotoIdsUsed": [p.id for p in req.referenceImages if p.imageDataUrl],
    }


# ------------------------------------------------------------
# Wire up
# ------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.exception("Unhandled error")
    return JSONResponse(status_code=500, content={"detail": str(exc)[:300]})
