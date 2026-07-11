#!/usr/bin/env python3
import http.client
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8081"))
DIST_DIR = Path(os.environ.get("DIST_DIR", "./dist")).resolve()
BACKEND_HOST = os.environ.get("BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.environ.get("BACKEND_PORT", "8787"))
BASE_PATH = os.environ.get("BASE_PATH", "").rstrip("/")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}", flush=True)

    def do_GET(self):
        request_path = self.normalized_path()
        if request_path is None:
            return
        if request_path.startswith("/api/"):
            return self.proxy()
        return self.serve_static()

    def do_HEAD(self):
        request_path = self.normalized_path()
        if request_path is None:
            return
        if request_path.startswith("/api/"):
            return self.proxy()
        return self.serve_static(write_body=False)

    def do_POST(self):
        request_path = self.normalized_path()
        if request_path is None:
            return
        if request_path.startswith("/api/"):
            return self.proxy()
        self.send_error(404)

    def do_OPTIONS(self):
        request_path = self.normalized_path()
        if request_path is None:
            return
        if request_path.startswith("/api/"):
            return self.proxy()
        self.send_response(204)
        self.end_headers()

    def normalized_path(self):
        if not BASE_PATH:
            return self.path
        parsed = urlsplit(self.path)
        if parsed.path == BASE_PATH:
            self.send_response(308)
            self.send_header("Location", f"{BASE_PATH}/")
            self.end_headers()
            return None
        if parsed.path.startswith(f"{BASE_PATH}/"):
            suffix = parsed.path[len(BASE_PATH):] or "/"
            return suffix + (f"?{parsed.query}" if parsed.query else "")
        self.send_error(404)
        return None

    def proxy(self):
        body = None
        length = self.headers.get("Content-Length")
        if length:
            body = self.rfile.read(int(length))

        conn = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=30)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in {"host", "connection"}}
        upstream_path = self.normalized_path()
        if upstream_path is None:
            return
        try:
            conn.request(self.command, upstream_path, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
            self.send_response(resp.status)
            for key, value in resp.getheaders():
                if key.lower() not in {"connection", "transfer-encoding"}:
                    self.send_header(key, value)
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:
            self.send_error(502, f"Backend proxy failed: {exc}")
        finally:
            conn.close()

    def serve_static(self, write_body=True):
        request_path = self.normalized_path()
        if request_path is None:
            return
        parsed = urlsplit(request_path)
        rel = parsed.path.lstrip("/")
        target = (DIST_DIR / rel).resolve() if rel else DIST_DIR / "index.html"
        if not str(target).startswith(str(DIST_DIR)):
            self.send_error(403)
            return
        if not target.exists() or target.is_dir():
            target = DIST_DIR / "index.html"
        if not target.exists():
            self.send_error(404, "dist/index.html not found")
            return
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.end_headers()
        if write_body:
            self.wfile.write(data)


if __name__ == "__main__":
    if not DIST_DIR.exists():
        raise SystemExit(f"DIST_DIR does not exist: {DIST_DIR}")
    prefix = BASE_PATH or "/"
    print(f"Serving {DIST_DIR} at {prefix} on http://{HOST}:{PORT}, proxying /api to {BACKEND_HOST}:{BACKEND_PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
