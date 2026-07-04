# golink-static

A static go-link / URL-shortener service. No backend, no build step — a
static file host (GitHub Pages, nginx, or a Docker container) serving plain
HTML/JS/JSON is all it needs.

## How it works

- `src/` is the entire deployable site — everything in it is what actually
  gets published to GitHub Pages / served by nginx. Everything outside
  `src/` (docs, tests, dev tooling, Docker/CI config) is project meta, not
  site content.
- `src/links.json` is the single source of truth: a JSON array of
  `{ "alias": "...", "url": "...", "description": "..." }`. Order in the file
  is the display order on the landing page. `description` is optional.
- `src/index.html` is a search + paginated listing page over `links.json`.
- `src/404.html` is the redirect handler. Any request for `/<alias>` doesn't
  match a real file, so the host (GitHub Pages / nginx) falls back to serving
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

- `src/assets/links.js` — pure functions only (`aliasFromPath`, `findByAlias`,
  `filterLinks`, `paginate`), no fetching, no DOM, no globals. This is the
  single source of truth for alias/lookup/pagination logic and the only file
  that has unit tests (see below).
- `src/assets/config.js` — deployment-level settings (currently just
  `PAGE_SIZE`), kept separate from `links.json`'s content data.
- `src/assets/app.js` — `index.html`'s glue: fetches `links.json`, calls into
  `links.js` for filtering/pagination, and only handles DOM rendering itself.
- `src/404.html` inlines its own network-probing bootstrap (has to — it can't
  know the base prefix needed to load an external script until it's detected
  it), then dynamically `import()`s `assets/links.js` for the actual
  alias/lookup logic once the prefix is known, so that logic isn't duplicated.
  The whole `boot()` flow is wrapped in `.catch(() => showConfigError())` —
  this is what actually matters for reliability: earlier, a missing catch
  here meant any failure (including a failed dynamic import) left the page
  stuck on "Redirecting…" forever with no error surfaced. Duplicating the
  functions inline was tried as a fix at one point and reverted — the catch
  handler was the real fix, and it lets `404.html` reuse `links.js` safely.

Everything else is plain ES modules (`export`/`import`) — no `window`
globals, no build step, no dependencies.

## Running tests

`src/assets/links.js` has no DOM/browser dependencies, so it can be imported
directly by Node's built-in test runner — no bundler, no test framework
dependency:

```
npm test
```

(equivalent to `node --test`, which picks up `tests/*.test.js`). This
requires Node.js on your machine — it's a dev-time tool for running the test
suite, separate from the deployed site itself, which still needs zero
runtime dependencies to serve.

`.github/workflows/pages.yml` runs this on every push and pull request via a
`test` job, and the `deploy` job (`needs: test`) only runs on pushes to
`main` after tests pass — a failing test blocks deployment.

## Adding or editing a link

Edit `src/links.json`, commit, push. Aliases are matched case-insensitively, so
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
and a bogus alias to exercise the redirect and not-found paths. (`serve.py`
serves `src/`, not the repo root.)

## GitHub Pages setup

The site lives in `src/`, not the repo root or `docs/`, so GitHub Pages'
"Deploy from branch" mode (which only supports those two locations) can't
publish it directly. `.github/workflows/pages.yml` handles this instead —
it's not a build step (there's nothing to build), just
`actions/upload-pages-artifact` pointed at `src/` followed by
`actions/deploy-pages`.

1. Push to a **public** repo (private-repo Pages needs GitHub Pro/Team/Enterprise).
2. Settings → Pages → Source: **GitHub Actions** (not "Deploy from branch").
3. Push to `main` (or run the workflow manually) — `.github/workflows/pages.yml`
   publishes `src/` as-is.
4. `src/.nojekyll` disables Jekyll processing (needs to live inside `src/`,
   the actual published root, not the repo root).
5. `src/404.html` is picked up automatically by GitHub Pages, no extra config.

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
