"""
BeatVision Fallback Resilience Tests (iteration 4)

Validates that when Claude / EMERGENT_LLM_KEY is unavailable (budget exceeded, timeout,
network, parse error), each of the 4 text endpoints returns HTTP 200 with a fully-shaped
schema plus the fallback flags:
  - _fallback: true
  - _fallback_reason: one of budget_exceeded | timeout | rate_limited | network | unavailable
  - _fallback_message: contains "Claude generation was unavailable"

Also verifies:
  - /api/generate-scene-image still works with base64 payload (Gemini path)
  - Text endpoints must NOT ever return 5xx for budget/timeout/parse.
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

FALLBACK_MSG_FRAGMENT = "Claude generation was unavailable"
VALID_REASONS = {"budget_exceeded", "timeout", "rate_limited", "network", "unavailable"}


# ---------- helpers ----------
def _make_data_url(color):
    img = Image.new("RGB", (32, 32), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"


def _post(path, payload, timeout=180):
    return requests.post(f"{API}{path}", json=payload, timeout=timeout)


@pytest.fixture(scope="session")
def ref_photos():
    return [
        {
            "id": f"ref-char-{uuid.uuid4().hex[:6]}",
            "type": "main_character",
            "description": "Lone figure in dark trench coat",
            "fileName": "character.png",
            "imageDataUrl": _make_data_url((30, 30, 60)),
        },
        {
            "id": f"ref-env-{uuid.uuid4().hex[:6]}",
            "type": "environment",
            "description": "Neon-lit rainy alleyway",
            "fileName": "alley.png",
            "imageDataUrl": _make_data_url((200, 40, 120)),
        },
    ]


@pytest.fixture(scope="session")
def base_ctx(ref_photos):
    # Send only lightweight metadata for text calls (mimics frontend api.js)
    return {
        "title": "TEST_Wolves in the Rain",
        "artist": "TEST_Nara Kova",
        "lyrics": "The city breathes in neon smoke tonight",
        "style": "neon_cyberpunk",
        "notes": "Isolation, saturated color, cinematic slow motion.",
        "referencePhotos": [
            {"id": r["id"], "type": r["type"], "description": r["description"], "fileName": r["fileName"]}
            for r in ref_photos
        ],
    }


def _assert_fallback_flags_optional(data, name):
    """If data has _fallback:true, validate reason + message. Otherwise pass (Claude succeeded)."""
    if data.get("_fallback"):
        assert data.get("_fallback_reason") in VALID_REASONS, f"{name}: bad reason: {data.get('_fallback_reason')}"
        assert FALLBACK_MSG_FRAGMENT in (data.get("_fallback_message") or ""), \
            f"{name}: fallback message missing fragment: {data.get('_fallback_message')}"


# ---------- 1. world-report ----------
class TestWorldReport:
    def test_returns_200_with_or_without_fallback(self, base_ctx):
        t0 = time.time()
        r = _post("/generate-world-report", base_ctx)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"expected 200 (fallback if budget), got {r.status_code}: {r.text[:400]}"
        data = r.json()
        # Schema check
        for key in [
            "logline", "mood", "seven_story_beats", "color_palette",
            "symbols", "camera_language", "ai_visual_direction_prompt",
            "reference_photo_influence", "approval_questions",
        ]:
            assert key in data, f"missing key: {key}"
        assert isinstance(data["seven_story_beats"], list) and len(data["seven_story_beats"]) == 7
        assert isinstance(data["color_palette"], list) and len(data["color_palette"]) > 0
        _assert_fallback_flags_optional(data, "world-report")
        print(f"[world-report] {elapsed:.2f}s fallback={data.get('_fallback', False)} reason={data.get('_fallback_reason')}")
        # store for downstream
        TestWorldReport.world_report = data


# ---------- 2. world-assets ----------
class TestWorldAssets:
    def test_returns_200_with_or_without_fallback(self, base_ctx):
        stub_world = getattr(TestWorldReport, "world_report", {"mood": "haunting", "color_palette": ["red"]})
        payload = {**base_ctx, "worldReport": stub_world}
        t0 = time.time()
        r = _post("/generate-world-assets", payload)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:400]}"
        data = r.json()
        for k in ["world_style_bible", "character_sheet", "environment_sheet"]:
            assert k in data and isinstance(data[k], dict), f"missing/invalid: {k}"
        assert "overall_look" in data["world_style_bible"]
        assert "appearance" in data["character_sheet"]
        assert "main_location" in data["environment_sheet"]
        _assert_fallback_flags_optional(data, "world-assets")
        print(f"[world-assets] {elapsed:.2f}s fallback={data.get('_fallback', False)} reason={data.get('_fallback_reason')}")
        TestWorldAssets.assets = data


# ---------- 3. storyboard ----------
class TestStoryboard:
    def test_returns_200_with_exactly_8_scenes(self, base_ctx):
        assets = getattr(TestWorldAssets, "assets", {})
        payload = {
            **base_ctx,
            "worldReport": getattr(TestWorldReport, "world_report", {}),
            "styleBible": assets.get("world_style_bible", {}),
            "characterSheet": assets.get("character_sheet", {}),
            "environmentSheet": assets.get("environment_sheet", {}),
        }
        t0 = time.time()
        r = _post("/generate-storyboard", payload)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:400]}"
        data = r.json()
        scenes = data.get("scenes", [])
        assert len(scenes) == 8, f"expected EXACTLY 8 scenes, got {len(scenes)}"
        for s in scenes:
            for k in ["scene_number", "scene_title", "description", "camera_movement",
                      "color_emphasis", "symbol", "reference_photo_ids", "visual_prompt",
                      "timestamp_range"]:
                assert k in s, f"scene missing key: {k}"
        _assert_fallback_flags_optional(data, "storyboard")
        print(f"[storyboard] {elapsed:.2f}s {len(scenes)} scenes fallback={data.get('_fallback', False)} reason={data.get('_fallback_reason')}")
        TestStoryboard.scenes = scenes


# ---------- 4. scene-prompts ----------
class TestScenePrompts:
    def test_returns_200_with_prompts(self, base_ctx):
        scenes = getattr(TestStoryboard, "scenes", [])
        assets = getattr(TestWorldAssets, "assets", {})
        payload = {
            **base_ctx,
            "worldReport": getattr(TestWorldReport, "world_report", {}),
            "styleBible": assets.get("world_style_bible", {}),
            "characterSheet": assets.get("character_sheet", {}),
            "environmentSheet": assets.get("environment_sheet", {}),
            "storyboard": scenes,
        }
        t0 = time.time()
        r = _post("/generate-scene-prompts", payload)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:400]}"
        data = r.json()
        prompts = data.get("prompts", [])
        assert len(prompts) >= 1, "no prompts returned"
        for p in prompts:
            for k in ["final_polished_prompt", "camera_angle", "lighting", "mood", "negative_prompt"]:
                assert k in p, f"prompt missing key: {k}"
        _assert_fallback_flags_optional(data, "scene-prompts")
        print(f"[scene-prompts] {elapsed:.2f}s {len(prompts)} prompts fallback={data.get('_fallback', False)} reason={data.get('_fallback_reason')}")


# ---------- 5. scene-image (Gemini — separate budget) ----------
class TestSceneImage:
    def test_generates_with_base64_reference(self, ref_photos):
        payload = {
            "projectId": "TEST_project",
            "sceneId": "1",
            "scenePrompt": "Cinematic still, neon cyberpunk, lone figure under rain and holograms",
            "stylePreset": "Neon Cyberpunk",
            "negativePrompt": "blur, watermark, low quality",
            "referenceImages": ref_photos,  # includes imageDataUrl
        }
        t0 = time.time()
        r = _post("/generate-scene-image", payload, timeout=180)
        elapsed = time.time() - t0
        # Gemini has separate budget: could be 200 OR 502 (image provider error)
        # For this iteration the key requirement is that text endpoints degrade, not that
        # Gemini always succeeds. Still, we assert the response shape when it does succeed.
        if r.status_code == 200:
            data = r.json()
            assert data["generatedImageBase64"].startswith("data:image/"), "not a data URL"
            assert data["providerName"] == "Gemini Nano Banana"
            expected_ids = {p["id"] for p in ref_photos}
            assert set(data["referencePhotoIdsUsed"]) == expected_ids
            print(f"[scene-image] {elapsed:.2f}s OK size={len(data['generatedImageBase64'])} refs={len(expected_ids)}")
        else:
            # 502 is acceptable (Gemini budget/network) but must NOT be 500 unhandled
            print(f"[scene-image] {elapsed:.2f}s status={r.status_code} body={r.text[:200]}")
            assert r.status_code in (200, 502, 503), f"unexpected status: {r.status_code}"


# ---------- 6. provider-status ----------
class TestProviderStatus:
    def test_provider_status_ok(self):
        r = requests.get(f"{API}/provider-status", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["text_analysis"]["connected"] is True
        assert data["image_generation"]["connected"] is True


# ---------- 7. Text endpoints must NEVER 5xx for budget/parse/timeout ----------
class TestNoText5xx:
    def test_world_report_no_5xx(self, base_ctx):
        r = _post("/generate-world-report", base_ctx)
        assert r.status_code < 500, f"world-report 5xx: {r.status_code} {r.text[:200]}"

    def test_world_assets_no_5xx(self, base_ctx):
        payload = {**base_ctx, "worldReport": {"mood": "test"}}
        r = _post("/generate-world-assets", payload)
        assert r.status_code < 500, f"world-assets 5xx: {r.status_code} {r.text[:200]}"

    def test_storyboard_no_5xx(self, base_ctx):
        payload = {
            **base_ctx,
            "worldReport": {"mood": "test"},
            "styleBible": {},
            "characterSheet": {},
            "environmentSheet": {},
        }
        r = _post("/generate-storyboard", payload)
        assert r.status_code < 500, f"storyboard 5xx: {r.status_code} {r.text[:200]}"

    def test_scene_prompts_no_5xx(self, base_ctx):
        payload = {
            **base_ctx,
            "worldReport": {"mood": "test"},
            "styleBible": {},
            "characterSheet": {},
            "environmentSheet": {},
            "storyboard": [{"scene_number": i, "scene_title": "t", "description": "d"} for i in range(1, 9)],
        }
        r = _post("/generate-scene-prompts", payload)
        assert r.status_code < 500, f"scene-prompts 5xx: {r.status_code} {r.text[:200]}"
