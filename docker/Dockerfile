FROM python:3.12-alpine AS fingerprint
WORKDIR /work
COPY scripts/fingerprint.py scripts/fingerprint.py
# Copy the whole site. links.example.json (the template/demo data) is always
# present; links.json is only present when the build context has one (i.e. a
# downstream fork that committed its own link database).
COPY src/ src/
# Provision links.json once, at build time: use the real file if it was baked
# in, otherwise fall back to the example. Fingerprinting reads whatever ends
# up at src/links.json, so this has to happen before it runs.
RUN [ -f src/links.json ] || cp src/links.example.json src/links.json
RUN python3 scripts/fingerprint.py --src src --out dist

FROM nginx:alpine
COPY --from=fingerprint /work/dist/ /usr/share/nginx/html/
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
