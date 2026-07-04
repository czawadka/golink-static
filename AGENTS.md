# golink-static

A static go-link / URL-shortener service. No backend, no build step — a
static file host (GitHub Pages, nginx, or a Docker container) serving plain
HTML/JS/JSON is all it needs.

## How it works

- `links.json` is the single source of truth: a JSON array of
  `{ "alias": "...", "url": "...", "description": "..." }`. Order in the file
  is the display order on the landing page. `description` is optional.
- `index.html` is a search + paginated listing page over `links.json`.
- `404.html` is the redirect handler. Any request for `/<alias>` doesn't match
  a real file, so the host (GitHub Pages / nginx) falls back to serving
  `404.html`. Its inline script reads the requested path, looks up the alias
  in `links.json`, and does `location.replace(url)`.
- Aliases can contain slashes (`team/eng` is a single alias, not nested
  paths) — the alias is everything after the site's base prefix.

## Base-prefix auto-detection

`index.html` is always served at the site's real root, so its relative asset
references just work. `404.html` is the only page whose apparent URL varies
(GitHub Pages serves its content while the browser still shows the original
requested path), so it detects the base prefix at runtime instead of relying
on a hardcoded constant:

1. Try `fetch('/links.json')`. If that succeeds, the base prefix is `''`
   (root hosting — custom domain, `go/` DNS shortcut, or the Docker/nginx
   setup).
2. If that 404s, take the first path segment (e.g. `golink-static`) and try
   `fetch('/golink-static/links.json')`. If that succeeds, the base prefix is
   `/golink-static` (GitHub Pages' default project-page URL).

This means migrating hosts (GitHub Pages → custom domain → `go/` shortcut)
needs zero code changes. It only assumes at most one prefix segment, which
covers every real GitHub Pages topology; an arbitrary multi-segment
reverse-proxy prefix isn't auto-detected (you'd control that server config
directly anyway).

## Code layout

- `assets/links.js` — pure functions only (`aliasFromPath`, `findByAlias`,
  `filterLinks`), no fetching, no globals. Loaded as an ES module.
- `assets/config.js` — deployment-level settings (currently just
  `PAGE_SIZE`), kept separate from `links.json`'s content data.
- `assets/app.js` — `index.html`'s glue: fetches `links.json`, renders the
  list, wires up search and pagination.
- `404.html` inlines everything, including its own copies of `aliasFromPath`
  and `findByAlias` (duplicated from `assets/links.js` rather than fetched or
  dynamically imported). This is deliberate: it originally loaded
  `assets/links.js` via a dynamic `import()` after detecting the base prefix,
  but that added a second network round-trip with a failure mode that showed
  as an indefinite "Redirecting…" with no error surfaced. Inlining removes
  that dependency entirely, so a redirect only ever needs the `links.json`
  probe fetch.

Everything else is plain ES modules (`export`/`import`) — no `window`
globals, no build step, no dependencies. If you change the alias/lookup
logic, update both `assets/links.js` and the inlined copy in `404.html`.

## Adding or editing a link

Edit `links.json`, commit, push. Aliases are matched case-insensitively, so
don't define two aliases that differ only by case. Avoid aliases that
collide with real top-level paths (`assets`, `index`, `404`, `links`,
`favicon.ico`, ...) — the server serves the real file/folder before ever
falling back to `404.html`, so a colliding alias is unreachable.

## Local development

`dev/serve.py` mimics GitHub Pages'/nginx's 404-fallback behavior (plain
`python3 -m http.server` doesn't — it returns a bare 404 with no body, so the
redirect flow can't be exercised with it). Run with either:

```
uv run dev/serve.py               # simulates root hosting (future state)
uv run dev/serve.py --prefix golink-static   # simulates today's GitHub Pages URL
```

or plain `python3 dev/serve.py [--prefix ...]` if you don't have `uv`
(zero dependencies either way).

Then visit the printed URL, try searching, and visit `/docs`, `/team/eng`,
and a bogus alias to exercise the redirect and not-found paths.

## GitHub Pages setup

1. Push to a **public** repo (private-repo Pages needs GitHub Pro/Team/Enterprise).
2. Settings → Pages → Source: Deploy from branch → `main` / `/ (root)`.
3. `.nojekyll` is already present at the repo root — required so GitHub
   doesn't run the site through Jekyll (which mangles `_`-prefixed paths and
   adds unneeded processing for a plain static/JS site).
4. `404.html` at the repo root is picked up automatically, no extra config.

## Docker

```
docker build -f docker/Dockerfile -t golink-static .
docker run -p 8080:80 golink-static
```

Built now (not just planned) to validate that the same static bundle and
404.html mechanism works identically outside GitHub Pages — `docker/nginx.conf`
uses `error_page 404 /404.html;` to reproduce the same fallback behavior.

## Known limitations / future ideas

- No popularity/most-used ranking on the landing page — would need click
  tracking, which is out of scope for a stateless static site for now.
- No admin UI; `links.json` is edited directly via git.
- Reserved-name collisions (see above) aren't validated automatically.
