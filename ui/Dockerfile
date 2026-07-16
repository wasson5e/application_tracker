FROM nginx:alpine

# Copy nginx config as a template (envsubst will substitute ${API_PORT} at runtime)
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Copy static assets
COPY *.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/

# At runtime, substitute ${API_PORT} in the nginx template and start nginx
CMD ["/bin/sh", "-c", "envsubst '${API_PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
