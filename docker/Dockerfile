FROM nginx:alpine

# Copy the whole site. links.example.json (the template/demo data) is always
# present; links.json is only present when the build context has one (i.e. a
# downstream fork that committed its own link database).
COPY src/ /usr/share/nginx/html/
# Provision links.json once, at build time: use the real file if it was baked
# in, otherwise fall back to the example. The served file is a static fact for
# the image, so nginx.conf stays a plain try_files with no per-request check.
RUN [ -f /usr/share/nginx/html/links.json ] || \
    cp /usr/share/nginx/html/links.example.json /usr/share/nginx/html/links.json
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
