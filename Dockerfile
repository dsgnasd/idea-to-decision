# Static site, no build step: nginx serves the folder as is
FROM nginx:1.27-alpine
COPY index.html app.js content.js icon.svg /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
