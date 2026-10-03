# ---- build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- serve ----
# nginx serves the static app and proxies /api/airtable/* to Airtable, injecting the API key
# from the container environment at runtime. No key is ever baked into the image or the bundle.
FROM nginx:1-alpine
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/40-oreas-config.sh /docker-entrypoint.d/40-oreas-config.sh
RUN chmod +x /docker-entrypoint.d/40-oreas-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
# Only substitute our own variables in the template (keeps nginx's $vars intact).
ENV NGINX_ENVSUBST_FILTER="^AIRTABLE_"
EXPOSE 80
