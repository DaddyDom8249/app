#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import os
import random
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

HOST = "127.0.0.1"
PORT = 8001
POLLINATIONS_API_KEY = os.environ.get("POLLINATIONS_API_KEY", "").strip()
POLLINATIONS_MODEL = os.environ.get("POLLINATIONS_MODEL", "zimage").strip() or "zimage"
MAX_BODY_BYTES = 20 * 1024 * 1024
MAX_IMAGE_BYTES = 12 * 1024 * 1024


def json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "BeatVisionPollinationsTest/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[pollinations-test] {self.address_string()} {fmt % args}", flush=True)

    def cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def send_json(self, status: int, payload: Any) -> None:
        body = json_bytes(payload)
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path in ("/api/", "/api/health"):
            self.send_json(
                200,
                {
                    "service": "BeatVision Pollinations Test Provider",
                    "status": "ok",
                    "mode": "prompt_guided_test",
                    "model": POLLINATIONS_MODEL,
                    "keyConfigured": bool(POLLINATIONS_API_KEY),
                },
            )
            return

        if self.path == "/api/provider-status":
            connected = bool(POLLINATIONS_API_KEY)
            self.send_json(
                200,
                {
                    "image_generation": {
                        "connected": connected,
                        "provider": (
                            f"Pollinations {POLLINATIONS_MODEL} (Prompt-Guided Test)"
                            if connected
                            else None
                        ),
                        "purpose": "Free/credit-backed text-to-image workflow testing",
                        "status": "ready" if connected else "not_connected",
                        "mode": "prompt_guided_test",
                        "references_directly_used": False,
                    },
                    "reference_photo_image_generation": {
                        "connected": False,
                        "provider": None,
                        "purpose": "Reference pixels are not sent in test mode",
                        "status": "metadata_prompt_only",
                        "mode": "metadata_prompt_only",
                    },
                },
            )
            return

        self.send_json(404, {"detail": "Not found"})

    def do_POST(self) -> None:
        if self.path != "/api/generate-scene-image":
            self.send_json(404, {"detail": "Not found"})
            return

        if not POLLINATIONS_API_KEY:
            self.send_json(
                503,
                {
                    "detail": (
                        "Pollinations test provider has no API key. "
                        "Add POLLINATIONS_API_KEY and restart the test server."
                    )
                },
            )
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_json(413, {"detail": "Invalid request size."})
            return

        try:
            request_data = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self.send_json(400, {"detail": "Invalid JSON request."})
            return

        scene_prompt = str(request_data.get("scenePrompt") or "").strip()
        if not scene_prompt:
            self.send_json(400, {"detail": "Scene prompt is required."})
            return

        references = request_data.get("referenceImages") or []
        reference_lines = []

        for ref in references:
            if not isinstance(ref, dict):
                continue
            ref_type = str(ref.get("type") or "reference").strip()
            description = str(
                ref.get("description") or ref.get("fileName") or "visual reference"
            ).strip()
            reference_lines.append(f"{ref_type}: {description}")

        reference_guidance = (
            "; ".join(reference_lines)
            if reference_lines
            else "no reference metadata selected"
        )

        prompt = (
            "Create one original cinematic music-video still, widescreen 16:9, "
            "high visual coherence, no text, no logo, no watermark. "
            f"Style preset: {request_data.get('stylePreset') or 'cinematic'}. "
            f"Scene: {scene_prompt}. "
            f"Character continuity: {request_data.get('characterConsistencyNotes') or 'consistent protagonist'}. "
            f"Environment continuity: {request_data.get('environmentConsistencyNotes') or 'consistent environment'}. "
            f"Selected reference metadata: {reference_guidance}. "
            f"Avoid: {request_data.get('negativePrompt') or 'blur, distorted anatomy, duplicate subjects, text, watermark'}."
        )[:3000]

        seed = random.randint(0, 2_147_483_647)
        encoded_prompt = urllib.parse.quote(prompt, safe="")
        query = urllib.parse.urlencode(
            {
                "model": POLLINATIONS_MODEL,
                "width": 1024,
                "height": 576,
                "seed": seed,
                "safe": "true",
            }
        )
        url = f"https://gen.pollinations.ai/image/{encoded_prompt}?{query}"

        request = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {POLLINATIONS_API_KEY}",
                "Accept": "image/jpeg,image/png",
                "User-Agent": "BeatVision-Free-Image-Test/1.0",
            },
            method="GET",
        )

        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                content_type = response.headers.get_content_type()
                image_bytes = response.read(MAX_IMAGE_BYTES + 1)

                if len(image_bytes) > MAX_IMAGE_BYTES:
                    raise ValueError("Generated image exceeded the test size limit.")

                if content_type not in ("image/jpeg", "image/png"):
                    raise ValueError(
                        f"Provider returned unexpected content type: {content_type}"
                    )
        except urllib.error.HTTPError as exc:
            detail = exc.read(500).decode("utf-8", errors="replace")
            if exc.code == 401:
                message = "Pollinations rejected the API key. Check the key and restart."
            elif exc.code == 402:
                message = (
                    "Pollinations authenticated the key, but its Pollen balance or "
                    "per-key budget is exhausted."
                )
            elif exc.code == 429:
                message = "Pollinations is rate-limiting requests. Try again later."
            else:
                message = f"Pollinations request failed with HTTP {exc.code}."

            print(f"{message} Provider detail: {detail}", flush=True)
            self.send_json(503, {"detail": message})
            return
        except Exception as exc:
            print(f"Pollinations generation failed: {exc}", flush=True)
            self.send_json(
                503,
                {
                    "detail": (
                        "Pollinations test image generation is unavailable. "
                        "Manual upload remains available."
                    )
                },
            )
            return

        mime = "image/png" if content_type == "image/png" else "image/jpeg"
        encoded_image = base64.b64encode(image_bytes).decode("ascii")
        reference_ids = [
            str(ref.get("id"))
            for ref in references
            if isinstance(ref, dict) and ref.get("id")
        ]

        self.send_json(
            200,
            {
                "generatedImageBase64": f"data:{mime};base64,{encoded_image}",
                "providerName": (
                    f"Pollinations {POLLINATIONS_MODEL} (Prompt-Guided Test)"
                ),
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "referencePhotoIdsUsed": reference_ids,
                "referenceMode": "metadata_prompt_only",
                "seed": seed,
            },
        )


if __name__ == "__main__":
    print(
        f"BeatVision Pollinations test provider listening on "
        f"http://{HOST}:{PORT}",
        flush=True,
    )
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
