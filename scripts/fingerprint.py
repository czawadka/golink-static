#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Content-hash fingerprinting for src/'s deployable static assets.

Copies --src (default: src) to --out (default: dist), then:
  - hashes assets/*.js + assets/style.css together and renames the assets/
    directory to assets-<hash>/ -- sibling imports between them need no
    rewriting, since relative specifiers still resolve correctly regardless
    of what the parent folder is called
  - hashes links.json on its own and moves it into a sibling data-<hash>/
    directory, kept separate from the assets hash since it's expected to
    change far more often than the JS/CSS
  - rewrites the handful of places that reference these by a fixed path:
    app.js's links.json fetch, 404.html's links.js import and two links.json
    probes, and index.html's script/link tags

Never touches --src itself, so tests (which import src/assets/*.js directly)
and the dev server (which serves src/ as-is, unfingerprinted) are unaffected.
"""

import argparse
import hashlib
import shutil
from pathlib import Path

ASSET_FILENAMES = [
    "app.js",
    "config.js",
    "links.js",
    "loader.js",
    "pager.js",
    "style.css",
    "url.js",
]


def hash_files(paths):
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.read_bytes())
    return digest.hexdigest()[:10]


def fingerprint(src, out):
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(src, out)

    assets_dir = out / "assets"
    asset_paths = sorted(assets_dir / name for name in ASSET_FILENAMES)
    asset_hash = hash_files(asset_paths)
    hashed_assets_dir = out / f"assets-{asset_hash}"
    assets_dir.rename(hashed_assets_dir)

    links_json = out / "links.json"
    data_hash = hash_files([links_json])
    hashed_data_dir = out / f"data-{data_hash}"
    hashed_data_dir.mkdir()
    links_json.rename(hashed_data_dir / "links.json")

    app_js = hashed_assets_dir / "app.js"
    app_js.write_text(
        app_js.read_text(encoding="utf-8").replace(
            '"links.json"', f'"data-{data_hash}/links.json"'
        ),
        encoding="utf-8",
    )

    not_found = out / "404.html"
    text = not_found.read_text(encoding="utf-8")
    text = text.replace("assets/links.js", f"assets-{asset_hash}/links.js")
    text = text.replace('"/links.json"', f'"/data-{data_hash}/links.json"')
    text = text.replace(
        "${basePrefix}/links.json", f"${{basePrefix}}/data-{data_hash}/links.json"
    )
    not_found.write_text(text, encoding="utf-8")

    index = out / "index.html"
    text = index.read_text(encoding="utf-8")
    text = text.replace('href="assets/style.css"', f'href="assets-{asset_hash}/style.css"')
    text = text.replace('src="assets/app.js"', f'src="assets-{asset_hash}/app.js"')
    index.write_text(text, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--src", default="src", type=Path)
    parser.add_argument("--out", default="dist", type=Path)
    args = parser.parse_args()
    fingerprint(args.src, args.out)
    print(f"Fingerprinted {args.src} -> {args.out}")


if __name__ == "__main__":
    main()
