"""Strict provider routing audit tests for BeatVision.

Verifies:
- Claude Sonnet 4.5 is used ONLY for text endpoints (world-report, world-assets,
  storyboard, scene-prompts).
- Gemini Nano Banana is used ONLY for /api/generate-scene-image.
- /api/provider-status returns 5 provider keys with proper purpose + provider strings.
- /api/generate-scene-image error mapping produces exact spec wording.
- Fallbacks contain NO image data / generatedImageBase64.
- Text endpoints never emit generatedImageBase64 or data:image/ payloads.

Assumes EMERGENT_LLM_KEY is over budget (previous iteration confirmed budget_exceeded);
that state is exactly what triggers the exact user-facing image error strings.
"""
import os
import re
import base64
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to reading frontend/.env to obtain the public URL
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break

API = f"{BASE_URL}/api"

# 32x32 red PNG (base64) — used for scene image ref payload
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAF0lEQVR4nO3BAQ0AAADCoP"
    "dPbQ8HFAAAAABJRU5ErkJggg=="
)
TINY_DATA_URL = f"data:image/png;base64,{TINY_PNG_B64}"

BASE_PROJECT = {
    "title": "TEST_Provider Routing Song",
    "artist": "TEST_Artist",
    "lyrics": "TEST lyrics only for routing audit.",
    "style": "dark_cinematic_surreal",
    "notes": "TEST",
    "referencePhotos": [
        {"id": "ref-1", "type": "main_character", "description": "TEST character",
         "fileName": "ref1.png"}
    ],
}

WORLD_REPORT_STUB = {"song_title": "TEST", "artist": "TEST", "logline": "TEST"}
STYLE_STUB = {"overall_look": "TEST"}
CHAR_STUB = {"name_role": "TEST"}
ENV_STUB = {"main_location": "TEST"}
STORYBOARD_STUB = [
    {"scene_number": i, "scene_title": f"S{i}", "description": "desc",
     "camera_movement": "cam", "color_emphasis": "red", "symbol": "sym",
     "reference_photo_ids": [], "visual_prompt": "vp", "timestamp_range": "0:00-0:22"}
    for i in range(1, 9)
]


# ---- provider-status ----
class TestProviderStatus:
    def test_provider_status_returns_5_keys_with_purpose(self):
        r = requests.get(f"{API}/provider-status", timeout=15)
        assert r.status_code == 200
        data = r.json()
        expected = {
            "text_analysis",
            "image_generation",
            "reference_photo_image_generation",
            "motion_generation",
            "video_export",
        }
        assert expected.issubset(set(data.keys())), f"Missing keys, got {list(data.keys())}"
        for k in expected:
            assert "purpose" in data[k], f"{k} missing 'purpose'"
        # Provider strings
        assert "Claude Sonnet 4.5" in (data["text_analysis"].get("provider") or "")
        assert "Gemini Nano Banana" in (data["image_generation"].get("provider") or "")
        assert "Gemini Nano Banana" in (
            data["reference_photo_image_generation"].get("provider") or ""
        )


# ---- text endpoints never emit image data ----
class TestTextEndpointsNoImages:
    def _assert_no_image_data(self, payload_json_str):
        assert "generatedImageBase64" not in payload_json_str
        assert "data:image/" not in payload_json_str

    def test_world_report_no_image_content(self):
        r = requests.post(f"{API}/generate-world-report", json=BASE_PROJECT, timeout=90)
        assert r.status_code == 200
        raw = r.text
        self._assert_no_image_data(raw)
        # Text schema fields present
        data = r.json()
        assert "song_title" in data
        assert "seven_story_beats" in data

    def test_world_assets_no_image_content(self):
        payload = {**BASE_PROJECT, "worldReport": WORLD_REPORT_STUB}
        r = requests.post(f"{API}/generate-world-assets", json=payload, timeout=90)
        assert r.status_code == 200
        self._assert_no_image_data(r.text)
        data = r.json()
        assert "world_style_bible" in data
        assert "character_sheet" in data
        assert "environment_sheet" in data

    def test_storyboard_no_image_content(self):
        payload = {
            **BASE_PROJECT,
            "worldReport": WORLD_REPORT_STUB,
            "styleBible": STYLE_STUB,
            "characterSheet": CHAR_STUB,
            "environmentSheet": ENV_STUB,
        }
        r = requests.post(f"{API}/generate-storyboard", json=payload, timeout=90)
        assert r.status_code == 200
        self._assert_no_image_data(r.text)
        data = r.json()
        assert "scenes" in data
        assert len(data["scenes"]) == 8

    def test_scene_prompts_no_image_content(self):
        payload = {
            **BASE_PROJECT,
            "worldReport": WORLD_REPORT_STUB,
            "styleBible": STYLE_STUB,
            "characterSheet": CHAR_STUB,
            "environmentSheet": ENV_STUB,
            "storyboard": STORYBOARD_STUB,
        }
        r = requests.post(f"{API}/generate-scene-prompts", json=payload, timeout=90)
        assert r.status_code == 200
        self._assert_no_image_data(r.text)
        data = r.json()
        assert "prompts" in data


# ---- scene image endpoint error mapping ----
class TestSceneImageErrorMapping:
    def test_scene_image_accepts_new_fields(self):
        """Payload must accept characterConsistencyNotes + environmentConsistencyNotes."""
        payload = {
            "projectId": "TEST_proj",
            "sceneId": "1",
            "scenePrompt": "TEST cinematic still",
            "stylePreset": "Dark Cinematic Surreal",
            "negativePrompt": "no watermark",
            "characterConsistencyNotes": "same silhouette",
            "environmentConsistencyNotes": "same palette",
            "referenceImages": [
                {"id": "ref-1", "type": "main_character",
                 "description": "TEST", "fileName": "r.png",
                 "imageDataUrl": TINY_DATA_URL}
            ],
        }
        r = requests.post(f"{API}/generate-scene-image", json=payload, timeout=90)
        # Either 200 (success), 503 (budget), 502/504 (unavailable). NOT 422.
        assert r.status_code in (200, 502, 503, 504), (
            f"unexpected status {r.status_code} body={r.text[:400]}"
        )
        if r.status_code == 200:
            data = r.json()
            assert data.get("providerName") == "Gemini Nano Banana"
            assert data.get("generatedImageBase64", "").startswith("data:image/")
            assert "createdAt" in data
            assert isinstance(data.get("referencePhotoIdsUsed"), list)

    def test_scene_image_exact_error_strings_on_failure(self):
        """When Gemini fails (budget or otherwise), user-facing detail string
        must match the exact spec wording."""
        payload = {
            "projectId": "TEST_proj",
            "sceneId": "1",
            "scenePrompt": "TEST",
            "stylePreset": "Dark",
            "negativePrompt": "",
            "characterConsistencyNotes": "",
            "environmentConsistencyNotes": "",
            "referenceImages": [],
        }
        r = requests.post(f"{API}/generate-scene-image", json=payload, timeout=90)
        if r.status_code == 200:
            pytest.skip("Gemini succeeded — cannot verify failure wording in this run.")
        assert r.status_code in (502, 503, 504), (
            f"unexpected {r.status_code}: {r.text[:300]}"
        )
        detail = r.json().get("detail", "")
        acceptable = {
            "Image generation is blocked because the Emergent LLM budget is exceeded.",
            "Gemini Nano Banana image generation is unavailable. Upload manually or try again later.",
        }
        assert detail in acceptable, f"Unexpected error detail: {detail!r}"
        # Budget exceeded -> 503 specifically
        if r.status_code == 503:
            assert detail == (
                "Image generation is blocked because the Emergent LLM budget is exceeded."
            )


# ---- code-level provider routing audit ----
class TestCodeAudit:
    """Static grep-style checks on server.py + fallbacks.py to enforce strict routing."""

    SERVER_PATH = "/app/backend/server.py"
    FALLBACKS_PATH = "/app/backend/fallbacks.py"

    def test_claude_used_only_in_claude_json(self):
        with open(self.SERVER_PATH) as f:
            src = f.read()
        # Find all 'with_model("anthropic",' occurrences and check they live inside _claude_json.
        matches = list(re.finditer(r'with_model\(\s*"anthropic"', src))
        assert len(matches) == 1, (
            f"Expected exactly 1 anthropic with_model call in server.py, found {len(matches)}"
        )
        # Find _claude_json function span
        m = re.search(r"async def _claude_json\(", src)
        assert m is not None
        start = m.start()
        # end = next 'async def' or 'def ' at column 0 after this
        next_def = re.search(r"\n(async def |def )", src[m.end():])
        end = m.end() + next_def.start() if next_def else len(src)
        assert start <= matches[0].start() < end, (
            "Anthropic with_model call is NOT inside _claude_json"
        )

    def test_gemini_used_only_in_generate_scene_image(self):
        with open(self.SERVER_PATH) as f:
            src = f.read()
        matches = list(re.finditer(r'with_model\(\s*"gemini"', src))
        assert len(matches) == 1, (
            f"Expected exactly 1 gemini with_model call in server.py, found {len(matches)}"
        )
        # Find generate_scene_image handler span
        m = re.search(r"async def generate_scene_image\(", src)
        assert m is not None
        start = m.start()
        next_def = re.search(r"\n(async def |def |app\.)", src[m.end():])
        end = m.end() + next_def.start() if next_def else len(src)
        assert start <= matches[0].start() < end, (
            "Gemini with_model call is NOT inside generate_scene_image"
        )

    def test_fallbacks_contain_no_image_data(self):
        with open(self.FALLBACKS_PATH) as f:
            src = f.read()
        assert "generatedImageBase64" not in src
        assert "data:image/" not in src
        assert "imageDataUrl" not in src
        # None of the fallback functions should reference base64 image payloads
        assert "base64," not in src

    def test_error_strings_present_in_server(self):
        with open(self.SERVER_PATH) as f:
            src = f.read()
        assert (
            "Image generation is blocked because the Emergent LLM budget is exceeded."
            in src
        ), "Missing exact budget-exceeded error string"
        assert (
            "Gemini Nano Banana image generation is unavailable. Upload manually or try again later."
            in src
        ), "Missing exact unavailable error string"

    def test_scene_image_request_has_new_fields(self):
        with open(self.SERVER_PATH) as f:
            src = f.read()
        assert "characterConsistencyNotes" in src
        assert "environmentConsistencyNotes" in src


# ---- frontend api.js audit ----
class TestFrontendApiAudit:
    API_PATH = "/app/frontend/src/lib/api.js"

    def test_project_context_strips_image_data_url(self):
        with open(self.API_PATH) as f:
            src = f.read()
        # projectContext (used by all text endpoints) must NOT include imageDataUrl.
        m = re.search(r"function projectContext\(p\)\s*\{(.+?)\n\}", src, re.DOTALL)
        assert m is not None, "projectContext not found"
        body = m.group(1)
        assert "imageDataUrl" not in body or "// NO imageDataUrl" in body

    def test_generate_scene_image_includes_consistency_notes(self):
        with open(self.API_PATH) as f:
            src = f.read()
        m = re.search(
            r"export async function generateSceneImage\(\{(.+?)\}\)", src, re.DOTALL
        )
        assert m is not None
        params = m.group(1)
        assert "characterConsistencyNotes" in params
        assert "environmentConsistencyNotes" in params

        # And the POST body must include them
        post_body = re.search(
            r'client\.post\("/generate-scene-image",\s*\{(.+?)\}\s*\)', src, re.DOTALL
        )
        assert post_body is not None
        pb = post_body.group(1)
        assert "characterConsistencyNotes" in pb
        assert "environmentConsistencyNotes" in pb
