# Multi-stage Dockerfile for the 3D Campus Map front end (Vite + React 19 + Three.js).
#
# Uses Debian-based `node:22-slim` (glibc) rather than Alpine (musl) because
# TypeScript 7 (`@typescript/typescript-linux-*`) and Vite 8 / Rolldown
# (`@rolldown/binding-linux-*-gnu`) rely on prebuilt glibc native binaries
# across both x86_64 and ARM64.
#
# Targets:
#   - `dev`  : Vite HTTPS dev server with HMR and same-origin `/api` proxy (used by docker-compose.yml)
#   - `prod` : Static production bundle served by Nginx with same-origin `/api`, `/docs` & `/ws` proxy

FROM node:22-slim AS base

WORKDIR /app

# Install dependencies in an isolated layer before copying sources so edits to
# `src/` do not invalidate the npm cache, and host `node_modules/` is never used.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ------------------------------------------------------------------------- dev

FROM base AS dev

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src

# Run as non-root `node` user; `/app/node_modules/.vite` stays writable inside
# the container for Vite's pre-bundler and `@vitejs/plugin-basic-ssl` cert cache
# while host source files are bind-mounted read-only (`:ro`).
RUN chown -R node:node /app
USER node

EXPOSE 5173

CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

# ----------------------------------------------------------------------- build

FROM base AS build

ARG VITE_USE_BACKEND=true
ARG VITE_API_BASE_URL=
ENV VITE_USE_BACKEND=${VITE_USE_BACKEND} \
    VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src

RUN npm run build

# Placed AFTER `npm run build` so backend-only commits reuse the cached Vite bundle
# in 0.1s while still stamping the newly deployed commit SHA into `/version.json`.
ARG APP_COMMIT=dev
ARG APP_BUILT_AT=unknown
RUN BUILD_ID="$(sha256sum dist/index.html | cut -c1-12)" \
 && printf '{"commit":"%s","buildId":"%s","builtAt":"%s"}\n' \
      "${APP_COMMIT}" "${BUILD_ID}" "${APP_BUILT_AT}" > dist/version.json

# ------------------------------------------------------------------------ prod

FROM nginx:1.27-alpine AS prod

ENV BACKEND_UPSTREAM=http://api:8000 \
    NGINX_ENVSUBST_FILTER=^BACKEND_

RUN mkdir -p /etc/nginx/templates && cat <<'EOF' > /etc/nginx/templates/default.conf.template
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    client_max_body_size 50M;

    location /api/ {
        proxy_pass ${BACKEND_UPSTREAM};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /docs {
        proxy_pass ${BACKEND_UPSTREAM};
        proxy_set_header Host $host;
    }

    location = /redoc {
        proxy_pass ${BACKEND_UPSTREAM};
        proxy_set_header Host $host;
    }

    location = /openapi.json {
        proxy_pass ${BACKEND_UPSTREAM};
        proxy_set_header Host $host;
    }

    location = /healthz {
        proxy_pass ${BACKEND_UPSTREAM};
    }

    location = /readyz {
        proxy_pass ${BACKEND_UPSTREAM};
    }

    location /ws/ {
        proxy_pass ${BACKEND_UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location = /version.json {
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
        try_files $uri =404;
    }

    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }

    location / {
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
        try_files $uri $uri/ /index.html;
    }
}
EOF

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/version.json >/dev/null || exit 1
