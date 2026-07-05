# golink-static

A self-hosted go-link / URL-shortener service. Visiting `/<alias>` redirects
to a URL you configure — no backend, no database, no build step. Just a
static file host.

## Getting started (using this for your own links)

**The first thing to do is create your own `src/links.json` and commit it — this
is your link database.** Copy the template that ships with this repo and edit it:

```
cp src/links.example.json src/links.json
# edit src/links.json to add your links
git add src/links.json && git commit -m "Add my links"
```

This repo intentionally does **not** track `src/links.json` — it ships
`src/links.example.json` as a template and demo data instead. That's what lets
you fork this project, keep your own committed `links.json`, and still
`git pull` upstream updates with **no merge conflicts** on your links (upstream
never touches that file). The site always loads `links.json` at runtime; when
it's absent (this repo's own demo, or before you've created one) the deploy
falls back to `links.example.json`.

## Adding a link

Edit `src/links.json` (the file you created above) and add an entry:

```json
{ "alias": "docs", "url": "https://example.com/docs", "description": "Team documentation home" }
```

Commit and push — that's it. Aliases are matched case-insensitively and can
contain slashes (`team/eng` is one alias). Avoid aliases that collide with
real top-level file/folder names in this repo (`assets`, `index`, `404`,
`links`, `favicon.ico`, ...) since those are served directly and never reach
the redirect logic.

## Local development

```
uv run dev/serve.py --prefix golink-static
```

(or `python3 dev/serve.py --prefix golink-static` if you don't have `uv`).
This simulates today's GitHub Pages URL shape locally. Open the printed URL,
try the search box, and visit `/docs` or a made-up alias to see the redirect
and not-found behavior.

Run the test suite (requires Node.js):

```
npm test
```

## Hosting

**Now — GitHub Pages:**
1. Push to a public repo.
2. Settings → Pages → Source: **GitHub Actions**.
3. Done — `.github/workflows/pages.yml` publishes `src/` on every push to `main`.

**Later — custom domain or an internal `go/` shortcut:** no code changes
needed. The site auto-detects its own base path at runtime (see
[AGENTS.md](./AGENTS.md) for how). Just add a `CNAME` file / point DNS at
wherever it's hosted.

**Later still — Docker:**

```
docker build -f docker/Dockerfile -t golink-static .
docker run -p 8080:80 golink-static
```

## Known limitations

- No popularity-based ranking (would need click tracking — out of scope for
  now).
- No admin UI; edit `links.json` directly.

See [AGENTS.md](./AGENTS.md) for architecture details.
