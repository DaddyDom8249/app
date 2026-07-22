#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import os
import random
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

HOST = "127.0.0.1"
PORT = 8001
ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
MODEL = "@cf/black-forest-labs/flux-1-schnell"
MAX_BODY_BYTES = 20 * 1024 * 1024


def encode_json(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "BeatVisionCloudflareTest/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(
            f"[cloudflare-test] {self.address_string()} {fmt % args}",
            flush=True,
        )

    def add_cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization",
        )
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS",
        )

    def send_json(self, status: int, payload: Any) -> None:
        body = encode_json(payload)
        self.send_response(status)
        self.add_cors()
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8",
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.add_cors()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path in ("/api/", "/api/health"):
            self.send_json(
                200,
                {
                    "service": "BeatVision Cloudflare Test Provider",
                    "status": "ok",
                    "mode": "prompt_guided_test",
                    "model": MODEL,
                    "credentialsConfigured": bool(
                        ACCOUNT_ID and API_TOKEN
                    ),
                },
            )
            return

        if self.path == "/api/provider-status":
            connected = bool(ACCOUNT_ID and API_TOKEN)

            self.send_json(
                200,
                {
                    "image_generation": {
                        "connected": connected,
                        "provider": (
                            "Cloudflare FLUX.1 Schnell (Free Test)"
                            if connected
                            else None
                        ),
                        "purpose": (
                            "Cloudflare Workers AI text-to-image "
                            "workflow testing"
                        ),
                        "status": (
                            "ready" if connected else "not_connected"
                        ),
                        "mode": "prompt_guided_test",
                        "references_directly_used": False,
                    },
                    "reference_photo_image_generation": {
                        "connected": False,
                        "provider": None,
                        "purpose": (
                            "Reference pixels are not sent in test mode"
                        ),
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

        if not ACCOUNT_ID or not API_TOKEN:
            self.send_json(
                503,
                {
                    "detail": (
                        "Cloudflare test provider credentials "
                        "are not configured."
                    )
                },
            )
            return

        length = int(
            self.headers.get("Content-Length", "0") or "0"
        )

        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_json(
                413,
                {"detail": "Invalid request size."},
            )
            return

        try:
            request_data = json.loads(
                self.rfile.read(length).decode("utf-8")
            )
        except Exception:
            self.send_json(
                400,
                {"detail": "Invalid JSON request."},
            )
            return

        scene_prompt = str(
            request_data.get("scenePrompt") or ""
        ).strip()

        if not scene_prompt:
            self.send_json(
                400,
                {"detail": "Scene prompt is required."},
            )
            return

        references = request_data.get("referenceImages") or []
        reference_lines = []

        for reference in references:
            if not isinstance(reference, dict):
                continue

            reference_type = str(
                reference.get("type") or "reference"
            ).strip()

            description = str(
                reference.get("description")
                or reference.get("fileName")
                or "visual reference"
            ).strip()

            reference_lines.append(
                f"{reference_type}: {description}"
            )

        reference_guidance = (
            "; ".join(reference_lines)
            if reference_lines
            else "no reference metadata selected"
        )

        prompt = (
            "Create one original cinematic music-video still. "
            "Strong widescreen composition inside the square frame, "
            "dramatic professional lighting, coherent subject design, "
            "no text, no logo, no watermark. "
            f"Style preset: "
            f"{request_data.get('stylePreset') or 'cinematic'}. "
            f"Scene: {scene_prompt}. "
            f"Character continuity: "
            f"{request_data.get('characterConsistencyNotes') or 'consistent protagonist'}. "
            f"Environment continuity: "
            f"{request_data.get('environmentConsistencyNotes') or 'consistent environment'}. "
            f"Selected reference metadata: {reference_guidance}. "
            f"Avoid: "
            f"{request_data.get('negativePrompt') or 'blur, distorted anatomy, duplicate subjects, text, watermark'}."
        )[:2048]

        payload = json.dumps(
            {
                "prompt": prompt,
                "steps": 4,
                "seed": random.randint(0, 2_147_483_647),
            }
        ).encode("utf-8")

        url = (
            "https://api.cloudflare.com/client/v4/accounts/"
            f"{ACCOUNT_ID}/ai/run/{MODEL}"
        )

        provider_request = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Authorization": f"Bearer {API_TOKEN}",
                "Content-Type": "application/json",
                "User-Agent": (
                    "BeatVision-Cloudflare-Free-Test/1.0"
                ),
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(
                provider_request,
                timeout=180,
            ) as response:
                provider_data = json.loads(
                    response.read().decode("utf-8")
                )
        except urllib.error.HTTPError as exc:
            detail = exc.read(1500).decode(
                "utf-8",
                errors="replace",
            )
            print(
                f"Cloudflare HTTP {exc.code}: {detail}",
                flush=True,
            )

            if exc.code in (401, 403):
                message = (
                    "Cloudflare rejected the Account ID or "
                    "Workers AI API token."
                )
            elif exc.code == 429:
                message = (
                    "Cloudflare Workers AI daily free limit "
                    "or rate limit was reached."
                )
            else:
                message = (
                    f"Cloudflare image request failed with "
                    f"HTTP {exc.code}."
                )

            self.send_json(503, {"detail": message})
            return
        except Exception as exc:
            print(
                f"Cloudflare generation failed: {exc}",
                flush=True,
            )
            self.send_json(
                503,
                {
                    "detail": (
                        "Cloudflare free test image generation "
                        "is unavailable. Manual upload remains "
                        "available."
                    )
                },
            )
            return

        image_base64 = (
            (provider_data.get("result") or {}).get("image")
        )

        if (
            not provider_data.get("success")
            or not image_base64
        ):
            print(
                f"Unexpected Cloudflare response: "
                f"{str(provider_data)[:1200]}",
                flush=True,
            )
            self.send_json(
                502,
                {
                    "detail": (
                        "Cloudflare returned no generated image."
                    )
                },
            )
            return

        try:
            base64.b64decode(
                image_base64,
                validate=True,
            )
        except Exception:
            self.send_json(
                502,
                {
                    "detail": (
                        "Cloudflare returned invalid image data."
                    )
                },
            )
            return

        reference_ids = [
            str(reference.get("id"))
            for reference in references
            if isinstance(reference, dict)
            and reference.get("id")
        ]

        self.send_json(
            200,
            {
                "generatedImageBase64": (
                    "data:image/jpeg;base64,"
                    f"{image_base64}"
                ),
                "providerName": (
                    "Cloudflare FLUX.1 Schnell (Free Test)"
                ),
                "createdAt": (
                    datetime.now(timezone.utc).isoformat()
                ),
                "referencePhotoIdsUsed": reference_ids,
                "referenceMode": "metadata_prompt_only",
            },
        )


if __name__ == "__main__":
    print(
        "BeatVision Cloudflare test provider listening "
        f"on http://{HOST}:{PORT}",
        flush=True,
    )

    ThreadingHTTPServer(
        (HOST, PORT),
        Handler,
    ).serve_forever()
