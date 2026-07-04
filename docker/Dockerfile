FROM nginx:alpine

COPY src/index.html src/404.html src/links.json /usr/share/nginx/html/
COPY src/assets/ /usr/share/nginx/html/assets/
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
