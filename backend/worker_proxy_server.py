#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from http.server import (
    BaseHTTPRequestHandler,
    ThreadingHTTPServer,
)
from typing import Any

HOST = "127.0.0.1"
PORT = 8001

WORKER_URL = os.environ.get(
    "BEATVISION_WORKER_URL",
    "",
).rstrip("/")

WORKER_KEY = os.environ.get(
    "BEATVISION_WORKER_KEY",
    "",
)

MAX_BODY_BYTES = 20 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "BeatVisionWorkerProxy/1.0"

    def log_message(
        self,
        fmt: str,
        *args: Any,
    ) -> None:
        print(
            f"[worker-proxy] {fmt % args}",
            flush=True,
        )

    def add_cors(self) -> None:
        self.send_header(
            "Access-Control-Allow-Origin",
            "*",
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type",
        )
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS",
        )

    def send_payload(
        self,
        status: int,
        body: bytes,
        content_type: str,
    ) -> None:
        self.send_response(status)
        self.add_cors()
        self.send_header(
            "Content-Type",
            content_type,
        )
        self.send_header(
            "Cache-Control",
            "no-store",
        )
        self.send_header(
            "Content-Length",
            str(len(body)),
        )
        self.end_headers()
        self.wfile.write(body)

    def send_json(
        self,
        status: int,
        payload: Any,
    ) -> None:
        body = json.dumps(payload).encode("utf-8")

        self.send_payload(
            status,
            body,
            "application/json; charset=utf-8",
        )

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.add_cors()
        self.end_headers()

    def do_GET(self) -> None:
        self.forward("GET")

    def do_POST(self) -> None:
        self.forward("POST")

    def forward(self, method: str) -> None:
        if not WORKER_URL or not WORKER_KEY:
            self.send_json(
                503,
                {
                    "detail":
                        "Worker proxy is not configured."
                },
            )
            return

        body = None

        if method == "POST":
            length = int(
                self.headers.get(
                    "Content-Length",
                    "0",
                ) or "0"
            )

            if (
                length <= 0 or
                length > MAX_BODY_BYTES
            ):
                self.send_json(
                    413,
                    {
                        "detail":
                            "Invalid request size."
                    },
                )
                return

            body = self.rfile.read(length)

        upstream = urllib.request.Request(
            f"{WORKER_URL}{self.path}",
            data=body,
            method=method,
            headers={
                "Content-Type":
                    self.headers.get(
                        "Content-Type",
                        "application/json",
                    ),
                "X-BeatVision-Key":
                    WORKER_KEY,
                "User-Agent":
                    "BeatVision-Local-Worker-Proxy/1.0",
            },
        )

        try:
            with urllib.request.urlopen(
                upstream,
                timeout=210,
            ) as response:
                self.send_payload(
                    response.status,
                    response.read(),
                    response.headers.get(
                        "Content-Type",
                        "application/json; charset=utf-8",
                    ),
                )

        except urllib.error.HTTPError as exc:
            self.send_payload(
                exc.code,
                exc.read(),
                exc.headers.get(
                    "Content-Type",
                    "application/json; charset=utf-8",
                ),
            )

        except Exception as exc:
            print(
                f"Worker proxy failure: {exc}",
                flush=True,
            )

            self.send_json(
                503,
                {
                    "detail": (
                        "The local BeatVision proxy "
                        "could not reach the Cloudflare "
                        "Worker. Manual upload remains "
                        "available."
                    )
                },
            )


if __name__ == "__main__":
    print(
        f"Worker proxy listening on "
        f"http://{HOST}:{PORT}",
        flush=True,
    )
    print(
        f"Forwarding to {WORKER_URL}",
        flush=True,
    )

    ThreadingHTTPServer(
        (HOST, PORT),
        Handler,
    ).serve_forever()
