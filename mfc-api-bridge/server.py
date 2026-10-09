#!/usr/bin/env python3
"""Authenticated HTTP adapter for the myfigurecollection-api Python package.

Run on a trusted machine with a connection MFC accepts and expose it only through
an HTTPS tunnel. The bridge provides read-only item and upload-image endpoints.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import mimetypes
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from mfc_api import MFCClient, MFCError, MFCNotFoundError, MFCRateLimitedError

LOG = logging.getLogger("mfc-api-bridge")
TOKEN = os.environ.get("MFC_API_BRIDGE_TOKEN", "").strip()
HOST = os.environ.get("MFC_API_BRIDGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("MFC_API_BRIDGE_PORT", "8765"))
CACHE_DIR = Path(
    os.environ.get("MFC_API_BRIDGE_CACHE_DIR", "~/.cache/figure-collection/mfc-images")
).expanduser()
IMAGE_URL_HOST = "static.myfigurecollection.net"
IMAGE_PATH = re.compile(r"^/upload/(?:items|pictures)/", re.IGNORECASE)
CLIENT_LOCK = threading.Lock()
CLIENT = None


def get_client() -> MFCClient:
    global CLIENT
    if CLIENT is None:
        CLIENT = MFCClient(
            rate_limit=float(os.environ.get("MFC_API_RATE_LIMIT", "1.0")),
            cache_ttl=float(os.environ.get("MFC_API_CACHE_TTL", "3600")),
            cache_dir=os.environ.get("MFC_API_CACHE_DIR"),
        )
    return CLIENT


def safe_image_url(value: str):
    try:
        parsed = urlsplit(value)
        if (
            parsed.scheme != "https"
            or parsed.hostname != IMAGE_URL_HOST
            or parsed.username
            or parsed.password
            or parsed.port not in (None, 443)
            or not IMAGE_PATH.match(parsed.path)
        ):
            return None
        return parsed
    except (TypeError, ValueError):
        return None


class Handler(BaseHTTPRequestHandler):
    server_version = "MFC-API-Bridge/1"

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _send_image(self, body: bytes, content_type: str, head_only: bool = False):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def _authorized(self) -> bool:
        value = self.headers.get("Authorization", "")
        scheme, _, supplied = value.partition(" ")
        return scheme.lower() == "bearer" and bool(TOKEN) and hmac.compare_digest(supplied, TOKEN)

    def _handle(self, head_only: bool = False):
        if not self._authorized():
            self._send_json(401, {"error": "Unauthorized"})
            return

        parsed = urlsplit(self.path)
        item_match = re.fullmatch(r"/api/item/([0-9]+)", parsed.path)
        if item_match and not head_only:
            item_id = int(item_match.group(1))
            try:
                with CLIENT_LOCK:
                    item = get_client().get_item(item_id)
                body = json.dumps(item.model_dump(mode="json"), ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(body)
            except MFCNotFoundError as exc:
                self._send_json(404, {"error": str(exc)})
            except MFCRateLimitedError as exc:
                body = json.dumps({"error": str(exc)}).encode("utf-8")
                self.send_response(429)
                if exc.retry_after is not None:
                    self.send_header("Retry-After", str(exc.retry_after))
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except MFCError as exc:
                self._send_json(502, {"error": str(exc)})
            except Exception:
                LOG.exception("MFC item lookup failed")
                self._send_json(502, {"error": "The MFC item lookup failed."})
            return

        if parsed.path == "/api/image" and not head_only:
            value = parse_qs(parsed.query).get("url", [""])[0]
            safe_url = safe_image_url(value)
            if safe_url is None:
                self._send_json(400, {"error": "A valid MFC image URL is required."})
                return

            image_url = safe_url.geturl()
            cache_key = hashlib.sha256(image_url.encode("utf-8")).hexdigest()
            cache_path = CACHE_DIR / (cache_key + ".image")
            try:
                body = cache_path.read_bytes()
            except FileNotFoundError:
                try:
                    CACHE_DIR.mkdir(parents=True, exist_ok=True)
                    with CLIENT_LOCK:
                        body = get_client().transport.get_bytes(image_url)
                    temporary_path = cache_path.with_suffix(".tmp")
                    temporary_path.write_bytes(body)
                    temporary_path.replace(cache_path)
                except MFCError as exc:
                    self._send_json(502, {"error": str(exc)})
                    return
                except Exception:
                    LOG.exception("MFC image fetch failed")
                    self._send_json(502, {"error": "The MFC image could not be fetched."})
                    return

            content_type = mimetypes.guess_type(safe_url.path)[0] or "application/octet-stream"
            if not content_type.startswith("image/"):
                self._send_json(415, {"error": "The requested URL is not a supported image."})
                return
            self._send_image(body, content_type)
            return

        self._send_json(404, {"error": "Not found"})

    def do_GET(self):
        self._handle()

    def do_HEAD(self):
        self._handle(head_only=True)

    def log_message(self, fmt, *args):
        LOG.info("%s - %s", self.address_string(), fmt % args)


def main():
    if not TOKEN:
        raise SystemExit("Set MFC_API_BRIDGE_TOKEN to a long random secret before starting the bridge.")
    logging.basicConfig(level=os.environ.get("MFC_API_LOG_LEVEL", "WARNING").upper())
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    LOG.warning("Listening on %s:%s; expose it only through an authenticated HTTPS tunnel.", HOST, PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if CLIENT is not None:
            CLIENT.close()


if __name__ == "__main__":
    main()
