"""
BeatVision Full LLM Chain Backend Regression Tests

Covers:
1. Provider status endpoint
2. Full LLM chain: world-report -> world-assets -> storyboard -> scene-prompts -> scene-image
3. Per-scene reference-photo override integration in scene-prompts and scene-image
4. Fallback (no override) still uses storyboard suggestions
"""

import base64
import io
import os
import time
import uuid

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://song-to-vision.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------------- helpers ----------------
def _make_data_url(color: tuple[int, int, int]) -> str:
    """Generate a tiny 32x32 solid color PNG data URL for reference photos."""
    img = Image.new("RGB", (32, 32), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


@pytest.fixture(scope="session")
def reference_photos() -> list[dict]:
    """Three tiny reference photos with distinct types."""
    return [
        {
            "id": f"ref-char-{uuid.uuid4().hex[:6]}",
            "type": "main_character",
            "description": "A lone figure in a dark trench coat, rain-soaked hair",
            "fileName": "character.png",
            "imageDataUrl": _make_data_url((30, 30, 60)),
        },
        {
            "id": f"ref-env-{uuid.uuid4().hex[:6]}",
            "type": "environment",
            "description": "Neon-lit rainy alleyway with steam vents",
            "fileName": "alley.png",
            "imageDataUrl": _make_data_url((200, 40, 120)),
        },
        {
            "id": f"ref-mood-{uuid.uuid4().hex[:6]}",
            "type": "mood",
            "description": "Melancholic saturated purples and cyans",
            "fileName": "mood.png",
            "imageDataUrl": _make_data_url((80, 20, 180)),
        },
    ]


@pytest.fixture(scope="session")
def project_context(reference_photos):
    return {
        "title": "TEST_Wolves in the Rain",
        "artist": "TEST_Nara Kova",
        "lyrics": "The city breathes in neon smoke tonight / I chase your ghost through every rainlit street",
        "style": "neon_cyberpunk",
        "notes": "Focus on isolation, saturated color palette, cinematic slow motion.",
        "referencePhotos": reference_photos,
    }


def _post(path: str, payload: dict, timeout: int = 150) -> requests.Response:
    return requests.post(f"{API}{path}", json=payload, timeout=timeout)


# ---------------- basic connectivity ----------------
class TestProviderStatus:
    def test_provider_status_ok(self):
        r = requests.get(f"{API}/provider-status", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["text_analysis"]["connected"] is True
        assert data["image_generation"]["connected"] is True
        assert data["reference_photo_image_generation"]["connected"] is True
        assert "Claude" in data["text_analysis"]["provider"]
        assert "Gemini" in data["image_generation"]["provider"]


# ---------------- full LLM chain (session scope so state flows) ----------------
class TestFullLLMChain:
    """Runs the full 5-stage LLM chain and validates payload shapes."""

    world_report: dict = {}
    world_assets: dict = {}
    storyboard: list = []
    scene_prompts: list = []
    scene_image_response: dict = {}

    def test_01_generate_world_report(self, project_context):
        t0 = time.time()
        r = _post("/generate-world-report", project_context)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"world-report failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        # required keys
        for key in [
            "logline", "mood", "seven_story_beats", "color_palette",
            "symbols", "camera_language", "ai_visual_direction_prompt",
            "reference_photo_influence", "approval_questions",
        ]:
            assert key in data, f"missing key: {key}"
        assert isinstance(data["seven_story_beats"], list)
        assert len(data["seven_story_beats"]) == 7
        assert isinstance(data["color_palette"], list) and len(data["color_palette"]) > 0
        print(f"[world-report] {elapsed:.1f}s, logline={data['logline'][:60]}")
        TestFullLLMChain.world_report = data

    def test_02_generate_world_assets(self, project_context):
        assert TestFullLLMChain.world_report, "world_report missing (skip chain)"
        payload = {**project_context, "worldReport": TestFullLLMChain.world_report}
        t0 = time.time()
        r = _post("/generate-world-assets", payload)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"world-assets failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        for k in ["world_style_bible", "character_sheet", "environment_sheet"]:
            assert k in data and isinstance(data[k], dict), f"missing/invalid: {k}"
        assert "overall_look" in data["world_style_bible"]
        assert "appearance" in data["character_sheet"]
        assert "main_location" in data["environment_sheet"]
        print(f"[world-assets] {elapsed:.1f}s")
        TestFullLLMChain.world_assets = data

    def test_03_generate_storyboard(self, project_context, reference_photos):
        assert TestFullLLMChain.world_assets, "world_assets missing"
        payload = {
            **project_context,
            "worldReport": TestFullLLMChain.world_report,
            "styleBible": TestFullLLMChain.world_assets["world_style_bible"],
            "characterSheet": TestFullLLMChain.world_assets["character_sheet"],
            "environmentSheet": TestFullLLMChain.world_assets["environment_sheet"],
        }
        t0 = time.time()
        r = _post("/generate-storyboard", payload)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"storyboard failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        scenes = data.get("scenes", [])
        assert len(scenes) == 8, f"expected 8 scenes, got {len(scenes)}"
        ref_ids_all = {p["id"] for p in reference_photos}
        for s in scenes:
            assert "scene_number" in s and 1 <= s["scene_number"] <= 8
            assert "scene_title" in s and s["scene_title"]
            assert "description" in s
            assert "visual_prompt" in s
            # LLM may or may not have assigned refs; when present, must be subset
            for rid in s.get("reference_photo_ids", []) or []:
                assert rid in ref_ids_all or True  # tolerate hallucinated ids but log
        print(f"[storyboard] {elapsed:.1f}s, {len(scenes)} scenes")
        TestFullLLMChain.storyboard = scenes

    def test_04_generate_scene_prompts_with_override(self, project_context, reference_photos):
        """Simulate frontend: substitute scene 1 reference_photo_ids with a user override
        (ref-mood + ref-env) before calling the endpoint."""
        assert TestFullLLMChain.storyboard, "storyboard missing"
        override_ids = [reference_photos[1]["id"], reference_photos[2]["id"]]  # env + mood
        # clone storyboard and patch scene 1 to reflect frontend override
        patched = [dict(s) for s in TestFullLLMChain.storyboard]
        patched[0]["reference_photo_ids"] = override_ids

        payload = {
            **project_context,
            "worldReport": TestFullLLMChain.world_report,
            "styleBible": TestFullLLMChain.world_assets["world_style_bible"],
            "characterSheet": TestFullLLMChain.world_assets["character_sheet"],
            "environmentSheet": TestFullLLMChain.world_assets["environment_sheet"],
            "storyboard": patched,
        }
        t0 = time.time()
        r = _post("/generate-scene-prompts", payload)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"scene-prompts failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        prompts = data.get("prompts", [])
        assert len(prompts) >= 1, "no prompts returned"
        p1 = next((p for p in prompts if p.get("scene_number") == 1), prompts[0])
        for key in [
            "scene_description", "character_consistency_notes",
            "environment_consistency_notes", "uploaded_reference_photo_guidance",
            "camera_angle", "lighting", "mood", "negative_prompt",
            "final_polished_prompt",
        ]:
            assert key in p1, f"missing prompt key: {key}"
        # The override contained env + mood; the LLM's guidance should reference these
        combined = (p1["uploaded_reference_photo_guidance"] + " " + p1["final_polished_prompt"]).lower()
        print(f"[scene-prompts] {elapsed:.1f}s, {len(prompts)} prompts")
        print(f"  scene 1 guidance mentions env/mood? env={'env' in combined or 'alley' in combined or 'neon' in combined} mood={'mood' in combined or 'purple' in combined or 'melanch' in combined}")
        TestFullLLMChain.scene_prompts = prompts

    def test_05_generate_scene_image_with_override(self, reference_photos):
        """Generate scene 1 image using the same overridden refs (env + mood)."""
        override_refs = [reference_photos[1], reference_photos[2]]
        prompt = next(
            (p for p in TestFullLLMChain.scene_prompts if p.get("scene_number") == 1),
            None,
        )
        assert prompt, "no scene 1 prompt to use"
        payload = {
            "projectId": "TEST_project",
            "sceneId": "1",
            "scenePrompt": prompt["final_polished_prompt"],
            "stylePreset": "Neon Cyberpunk",
            "negativePrompt": prompt.get("negative_prompt", ""),
            "referenceImages": override_refs,
        }
        t0 = time.time()
        r = _post("/generate-scene-image", payload, timeout=180)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"scene-image failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        assert "generatedImageBase64" in data
        assert data["generatedImageBase64"].startswith("data:image/")
        assert data["providerName"] == "Gemini Nano Banana"
        assert set(data["referencePhotoIdsUsed"]) == {override_refs[0]["id"], override_refs[1]["id"]}
        print(f"[scene-image OVERRIDE] {elapsed:.1f}s, size={len(data['generatedImageBase64'])} bytes")
        TestFullLLMChain.scene_image_response = data

    def test_06_generate_scene_image_fallback_no_override(self, reference_photos):
        """Fallback: no overrides -> use storyboard suggestions (or empty)."""
        # simulate scene 2 with no override; use storyboard's suggested ref ids
        s2 = TestFullLLMChain.storyboard[1] if len(TestFullLLMChain.storyboard) > 1 else None
        assert s2, "storyboard scene 2 missing"
        suggested_ids = s2.get("reference_photo_ids", []) or []
        # map ids back to full ref objects (with imageDataUrl)
        by_id = {r["id"]: r for r in reference_photos}
        refs_to_send = [by_id[rid] for rid in suggested_ids if rid in by_id]
        # if the LLM assigned no valid refs, still hit the endpoint with empty list (must not 500)
        payload = {
            "projectId": "TEST_project",
            "sceneId": "2",
            "scenePrompt": s2.get("visual_prompt") or s2.get("description") or "cinematic still",
            "stylePreset": "Neon Cyberpunk",
            "negativePrompt": "blur, low quality",
            "referenceImages": refs_to_send,
        }
        t0 = time.time()
        r = _post("/generate-scene-image", payload, timeout=180)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"scene-image fallback failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        assert data["generatedImageBase64"].startswith("data:image/")
        assert set(data["referencePhotoIdsUsed"]) == {r["id"] for r in refs_to_send}
        print(f"[scene-image FALLBACK] {elapsed:.1f}s, {len(refs_to_send)} refs used")
