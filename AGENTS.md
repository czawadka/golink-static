# golink-static

A static go-link / URL-shortener service. No backend, no build step — a
static file host (GitHub Pages, nginx, or a Docker container) serving plain
HTML/JS/JSON is all it needs.

## How it works

- `src/` is the entire deployable site — everything in it is what actually
  gets published to GitHub Pages / served by nginx. Everything outside
  `src/` (docs, tests, dev tooling, Docker/CI config) is project meta, not
  site content.
- `src/links.json` is the single source of truth at runtime: a JSON array of
  `{ "alias": "...", "url": "...", "description": "..." }`. Order in the file
  is the display order on the landing page. `description` is optional.
- **This repo does not track `src/links.json`.** It ships
  `src/links.example.json` (a committed template + the demo/test data) instead,
  and each deploy path provisions `links.json` from it when a real one is absent
  (see "Example vs. real link data" below). A downstream fork creates and
  commits its own `src/links.json` as its link database; because upstream never
  tracks that path, the fork's `links.json` never conflicts on `git pull`.
- `src/index.html` is a search + paginated listing page over `links.json`.
- `src/404.html` is the redirect handler. Any request for `/<alias>` doesn't
  match a real file, so the host (GitHub Pages / nginx) falls back to serving
  `404.html`. Its inline script reads the requested path, looks up the alias
  in `links.json`, and does `location.replace(url)`.
- Aliases can contain slashes (`team/eng` is a single alias, not nested
  paths) — the alias is everything after the site's base prefix.

## Example vs. real link data

`src/links.json` is the file the site loads at runtime, but this repo tracks
only `src/links.example.json`. This split is what lets the project be forked:
upstream keeps shipping demo data (so its own GitHub Pages/Docker/dev server
work standalone), while a downstream fork commits its own `src/links.json` and
pulls upstream updates without ever conflicting on it — upstream doesn't track
that path. It is **not** gitignored; downstream is expected to `git add` it.

Runtime is deliberately untouched: `app.js` and `404.html` still fetch a single
`/links.json`, so the base-prefix detection below needs no extra probes. Each
serving context instead produces `/links.json`, falling back to
`links.example.json` only when the real file is absent — and always **decides
once at build/deploy time**, since the served file is a static fact for a given
deploy:

- **GitHub Pages** (`.github/workflows/pages.yml`): a `deploy`-job step copies
  the example to `links.json` if the checkout doesn't already have one. The CI
  checkout is ephemeral, so no committed tree is touched.
- **Docker** (`docker/Dockerfile`): `COPY src/` brings in whatever exists
  (`links.example.json` always; `links.json` only for a downstream build), then
  a build-time `RUN` copies the example to `links.json` if it's missing.
  `docker/nginx.conf` stays a plain `try_files` — nginx does no per-request
  fallback.
- **Dev server** (`dev/serve.py`): picks the source once at startup (real
  `links.json` if present, else `links.example.json`) and serves it at the
  `/links.json` URL. The working tree isn't ephemeral, so it deliberately does
  not create an untracked file.

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
  single source of truth for alias/lookup/pagination logic over link data.
- `src/assets/pager.js` — pure `pagerState(page, totalPages)`, no DOM. Derives
  prev/next disabled flags, the "Page X of Y" label, and the target page
  numbers for prev/next clicks, so that button-state/off-by-one logic is
  unit tested instead of only eyeballed.
- `src/assets/loader.js` — `loadLinks(fetchFn, url)`, no DOM, no global
  `fetch` reference (it's passed in, so tests can inject a fake). Always
  *resolves* a discriminated `{ ok: true, links }` / `{ ok: false, message }`
  result rather than rejecting, which is what makes the fetch/HTTP-status/
  JSON-parse error handling unit testable.
- `src/assets/config.js` — deployment-level settings (currently just
  `PAGE_SIZE`), kept separate from `links.json`'s content data.
- `src/assets/app.js` — `index.html`'s glue: calls `loadLinks`/`pagerState`/
  `links.js` for the actual logic and handles DOM rendering and event
  wiring itself. Its top-level code only calls `init(document, fetch)`;
  `init(doc, fetchFn)` itself is exported and takes the document/fetch as
  parameters precisely so tests can inject a fake DOM (via `jsdom`) and a
  fake `fetchFn` instead of touching the real browser globals. This also
  guards against `index.html`'s element IDs (`#search`, `#link-list`,
  `#pager`, `#count`) drifting out of sync with `app.js`, since the test
  loads the real `src/index.html` markup rather than a hand-rolled fixture.
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
globals, no build step, no runtime dependencies. The deployed site itself
(everything under `src/`) still needs zero dependencies to serve.

## Running tests

`src/assets/links.js`, `src/assets/pager.js`, and `src/assets/loader.js` have
no DOM/browser dependencies, so they're imported directly by Node's built-in
test runner. `src/assets/app.js`'s exported `init()` takes a DOM `document`
as a parameter, so `tests/app.test.js` supplies one via `jsdom` (the one
devDependency in `package.json`, dev-time only — it's not part of the
deployed site and doesn't affect `src/`'s zero-runtime-dependency bundle):

```
npm test
```

(equivalent to `node --test`, which picks up `tests/*.test.js`). This
requires Node.js on your machine — it's a dev-time tool for running the test
suite, separate from the deployed site itself.

`.github/workflows/pages.yml` runs this on every push and pull request via a
`test` job, and the `deploy` job (`needs: test`) only runs on pushes to
`main` after tests pass — a failing test blocks deployment.

## Adding or editing a link

Edit your `src/links.json`, commit, push. (If you've just forked and don't have
one yet, `cp src/links.example.json src/links.json` first — see "Example vs.
real link data".) Aliases are matched case-insensitively, so
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

`COPY src/` bakes in `links.example.json` (and `links.json` too, if the build
context has one), and a build-time `RUN` provisions `links.json` from the
example when it's absent — so a plain `docker build` of this repo produces a
working demo image, and a downstream fork's committed `links.json` is used as-is
(see "Example vs. real link data").

## Known limitations / future ideas

- No popularity/most-used ranking on the landing page — would need click
  tracking, which is out of scope for a stateless static site for now.
- No admin UI; `links.json` is edited directly via git.
- Reserved-name collisions (see above) aren't validated automatically.
