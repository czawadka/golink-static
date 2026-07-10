#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Local dev server that mimics GitHub Pages' / nginx's 404.html fallback behavior.

Serves src/ (the deployable site) as static files. Any request that doesn't
resolve to a real file gets a 404 status with 404.html's content as the
body, matching GitHub Pages and the docker/nginx.conf setup.

Use --prefix to simulate GitHub Pages' default project-page topology
(https://user.github.io/<repo>/...) locally, e.g.:

    uv run dev/serve.py --prefix golink-static

Without --prefix, it simulates root hosting (custom domain / go/ shortcut):

    uv run dev/serve.py
"""

import argparse
import http.server
import os
import socketserver
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src"


def make_handler(prefix_path):
    # Decide the links source once at startup, mirroring the build-time copy the
    # Docker image and Pages workflow do: serve the real links.json if it exists
    # (a downstream fork's committed link database), otherwise fall back to the
    # committed links.example.json (this repo's demo data). Deciding here avoids
    # both a per-request check and littering the working tree with an untracked
    # links.json when developing upstream.
    links_source = "/links.json" if (ROOT / "links.json").is_file() else "/links.example.json"

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def do_GET(self):
            clean_path = self.path.split("?", 1)[0].split("#", 1)[0]
            effective_path = clean_path

            if prefix_path:
                if clean_path == prefix_path:
                    effective_path = "/"
                elif clean_path.startswith(prefix_path + "/"):
                    effective_path = clean_path[len(prefix_path):]
                else:
                    self.send_404()
                    return

            if effective_path == "/links.json":
                effective_path = links_source

            fs_path = self.translate_path(effective_path)
            if os.path.isdir(fs_path):
                fs_path = os.path.join(fs_path, "index.html")
            if os.path.isfile(fs_path):
                self.path = effective_path
                self._cacheable = True
                return super().do_GET()

            self.send_404()

        def end_headers(self):
            # Only the real-file branch above sets this; 404 responses stay
            # fully uncached (default), same as before. Real files get
            # no-cache rather than a max-age: dev never runs
            # scripts/fingerprint.py, so nothing served here is actually
            # immutable the way a hashed assets-<hash>/data-<hash> folder is
            # in prod -- pretending otherwise (even briefly) risks masking a
            # local edit. Still gets cheap 304s via If-Modified-Since.
            if getattr(self, "_cacheable", False):
                self.send_header("Cache-Control", "no-cache")
            super().end_headers()

        def send_404(self):
            not_found = ROOT / "404.html"
            body = not_found.read_bytes() if not_found.exists() else b"404 Not Found"
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *args):
            print(f"{self.address_string()} - {fmt % args}")

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--prefix",
        default="",
        help="Simulate a GitHub Pages project-path prefix, e.g. --prefix golink-static",
    )
    args = parser.parse_args()

    prefix = args.prefix.strip("/")
    prefix_path = f"/{prefix}" if prefix else ""

    handler = make_handler(prefix_path)
    with socketserver.TCPServer(("", args.port), handler) as httpd:
        base_url = f"http://localhost:{args.port}{prefix_path}/"
        print(f"Serving {ROOT}")
        print(f"Landing page: {base_url}")
        print(f"Try an alias: {base_url}docs")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
