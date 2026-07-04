FROM nginx:alpine

COPY index.html 404.html links.json /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
