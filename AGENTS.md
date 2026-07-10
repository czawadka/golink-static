# golink-static

A static go-link / URL-shortener service. No backend — a static file host
(GitHub Pages, nginx, or a Docker container) serving plain HTML/JS/JSON is
all it needs. The one exception is a small, deliberate build step,
`scripts/fingerprint.py`, that content-hashes the asset/data folder names at
deploy time for cache-busting (see "Asset fingerprinting" below) — nothing
else here needs a bundler or transpiler.

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
- `src/index.html` is a search + paginated listing page over `links.json`. Its
  current search query round-trips through the `?s=` URL param (e.g.
  `/?s=git`), so a filtered view can be copied and shared as a link.
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

Runtime *source* is deliberately untouched: `app.js` and `404.html` still
fetch a plain `links.json`, so the base-prefix detection below needs no extra
probes. (In production this literal is rewritten to a hashed path by
`scripts/fingerprint.py` — see "Asset fingerprinting" below — but that's a
build-time concern; the source files themselves never hardcode a deployment's
folder hash.) Each serving context instead produces `/links.json` (dev server)
or a fingerprinted `links.json` (Pages/Docker), falling back to
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

## Asset fingerprinting (cache-busting)

`scripts/fingerprint.py` copies `src/` to a build output directory (`dist/`
by default) and mutates only the copy — `src/` itself is never touched, so
`tests/*.test.js` (which import `../src/assets/*.js` directly) and
`dev/serve.py` (which serves `src/` as-is) are both unaffected.

It hashes two groups **separately**, into two differently-named folders:

- `assets/` (all of `app.js`, `config.js`, `links.js`, `loader.js`,
  `pager.js`, `style.css`, `url.js`) is hashed as one unit and the whole
  directory is renamed to `assets-<hash>/`. Sibling `import`s between these
  files need no rewriting at all — a relative specifier like `./links.js`
  resolves correctly regardless of what the parent folder is called, since
  they all move together.
- `links.json` is hashed on its own and moved into a sibling `data-<hash>/`
  directory.

These are kept separate, not combined into one folder, because they change at
very different rates: the JS/CSS is expected to stabilize over time, while
`links.json` is expected to be edited constantly (every alias addition from
every downstream fork). Sharing one hash would mean a pure data edit forces
browsers to needlessly refetch the untouched JS/CSS bundle too.

Only `index.html` and `404.html` reference these by a fixed path, so the
script rewrites exactly those: `index.html`'s `<script src>`/`<link href>`,
`404.html`'s dynamic `import()` of `links.js` and its two `links.json`
probes, and `app.js`'s own `links.json` fetch call (which lives inside
`assets-<hash>/` after the rename, but still needs to be told where
`data-<hash>/links.json` ended up). `index.html`/`404.html` themselves are
**never** renamed — GitHub Pages/nginx find them by their fixed names
(default document, custom 404 page).

Because `app.js` embeds the current `data-<hash>` path, a `links.json`-only
change also changes `app.js`'s folder hash (so `assets-<hash>/` gets a new
name too) even though none of the actual JS logic changed — a deliberately
accepted, cheap side effect (a few KB) in exchange for not needing a runtime
manifest lookup.

This runs in the GitHub Pages workflow and the Docker build stage — see
"GitHub Pages setup" and "Docker" below — but deliberately **not** in
`dev/serve.py` (see "Local development").

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
  `resolveAlias`, `filterLinks`, `paginate`), no fetching, no DOM, no globals.
  This is the single source of truth for alias/lookup/pagination logic over
  link data. `resolveAlias(links, alias, origin, basePrefix)` handles an
  entry whose `url` is itself another alias on the same site (a relative
  path, or a same-origin absolute URL): it walks the chain against the
  already-fetched `links` array — no extra fetches — and returns the final
  destination entry, so `404.html` only ever issues a single redirect even
  for a multi-hop chain. A cycle (including a single self-referencing entry)
  or a chain that points at a nonexistent alias resolves to `null`, treated
  the same as an unknown alias. Link authors don't need to hardcode the
  deployment's base prefix into a chained `url` — `aliasFromPath` only
  strips `basePrefix` when the path actually starts with it. A chained `url`
  should be written as a bare relative alias name (e.g. `gh`, see
  `links.example.json`'s `g`/`gh`/`github` chain) — **not** `/gh`. A leading
  `/` is root-relative per URL semantics, so it ignores the deployment's base
  prefix entirely; `resolveAlias` itself tolerates this (it falls through to
  the alias's last path segment either way), but `app.js` renders `entry.url`
  verbatim as the landing page's destination `<a href>`, and there a leading
  `/` under a non-root base prefix (e.g. GitHub Pages' `/reponame/`) points
  at the origin root instead of `/reponame/gh`.
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
- `src/assets/url.js` — pure `getParam(href, key)` / `setParam(href, key,
  value)` for reading and rewriting a single query-string parameter on an
  absolute URL string, no DOM. Exists so the shareable-search-link feature
  (below) is unit testable without `jsdom`.
- `src/assets/app.js` — `index.html`'s glue: calls `loadLinks`/`pagerState`/
  `links.js` for the actual logic and handles DOM rendering and event
  wiring itself. Its top-level code only calls `init(document, fetch)`;
  `init(doc, fetchFn)` itself is exported and takes the document/fetch as
  parameters precisely so tests can inject a fake DOM (via `jsdom`) and a
  fake `fetchFn` instead of touching the real browser globals. This also
  guards against `index.html`'s element IDs (`#search`, `#link-list`,
  `#pager`, `#count`) drifting out of sync with `app.js`, since the test
  loads the real `src/index.html` markup rather than a hand-rolled fixture.
  On load it seeds the search box and `query` state from the `?s=` URL
  param (via `url.js`'s `getParam`, read from `doc.location.href` before
  the async `loadLinks` resolves, so it's correct on first paint regardless
  of fetch timing); on every `input` event it calls
  `doc.defaultView.history.replaceState` (not `pushState`, so typing
  doesn't spam back-button history with one entry per keystroke) via
  `url.js`'s `setParam`, keeping the current search shareable from the
  address bar. Only the search text round-trips this way — page number is
  deliberately excluded.
- `src/404.html` inlines its own network-probing bootstrap (has to — it can't
  know the base prefix needed to load an external script until it's detected
  it), then dynamically `import()`s `assets/links.js` for the actual
  alias/lookup logic once the prefix is known, so that logic isn't duplicated.
  It calls `resolveAlias` (not `findByAlias` directly) so a chained alias
  resolves in one page load instead of `location.replace`-ing to another
  alias, 404ing again, and re-fetching `links.json` a second time.
  The whole `boot()` flow is wrapped in `.catch(() => showConfigError())` —
  this is what actually matters for reliability: earlier, a missing catch
  here meant any failure (including a failed dynamic import) left the page
  stuck on "Redirecting…" forever with no error surfaced. Duplicating the
  functions inline was tried as a fix at one point and reverted — the catch
  handler was the real fix, and it lets `404.html` reuse `links.js` safely.

Everything else is plain ES modules (`export`/`import`) — no `window`
globals, no bundler or transpiler, no runtime dependencies. ("No build step"
above refers to this: nothing here needs compiling. `scripts/fingerprint.py`
is a rename-and-rewrite pass over already-valid files, not compilation, and
it ships nothing into the deployed site itself, which still needs zero
dependencies to serve.)

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
suite, separate from the deployed site itself. `.node-version` pins the
version CI uses; [fnm](https://github.com/Schniz/fnm) picks it up
automatically (`eval "$(fnm env)"` once per shell, then `fnm use` in the repo
root) if that's not already wired into your shell's `cd` hook.

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
falling back to `404.html`, so a colliding alias is unreachable. In
production this also includes `assets-*` and `data-*` prefixes (see "Asset
fingerprinting"), though colliding with one of those by chance is
astronomically unlikely given the hash.

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

`serve.py` deliberately never runs `scripts/fingerprint.py` — it serves
`src/`'s plain, unhashed filenames directly (including `links.json`) with a
`no-cache` header, so local edits show up on the next refresh with no rebuild
step. It does not simulate production's immutable-folder caching; that's only
exercised via a Docker build or the Pages workflow.

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
   runs `scripts/fingerprint.py` (see "Asset fingerprinting") and publishes
   the resulting `dist/`, not `src/` directly.
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

The image is a multi-stage build: a `python:3.12-alpine` stage copies in
`src/`, provisions `links.json` from the example when it's absent (same
fallback as the Pages workflow — so a plain `docker build` of this repo
produces a working demo image, and a downstream fork's committed `links.json`
is used as-is, see "Example vs. real link data"), then runs
`scripts/fingerprint.py`. Only its `dist/` output is copied into the final
`nginx:alpine` stage — the image never ships Python.

`docker/nginx.conf` gives fingerprinted `assets-<hash>/`/`data-<hash>/` paths
`Cache-Control: public, max-age=31536000, immutable`, and everything else
(including `index.html`/`404.html`, which reference the current hash)
`no-cache, must-revalidate`.

## Known limitations / future ideas

- No popularity/most-used ranking on the landing page — would need click
  tracking, which is out of scope for a stateless static site for now.
- No admin UI; `links.json` is edited directly via git.
- Reserved-name collisions (see above) aren't validated automatically.
