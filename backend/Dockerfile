# ---------------------------------------------------------------------------
# Scriptory API container.
#
# A plain OCI image with no vendor-specific instructions: it runs unchanged on
# Cloud Run, ECS/Fargate, Container Apps, Fly, Kubernetes, or a bare Docker
# host. Everything platform-specific is supplied as environment variables at
# deploy time and normalised by src/config/platform.js.
# ---------------------------------------------------------------------------

# --- build stage -----------------------------------------------------------
# Alpine keeps the image small, which directly shortens cold starts on a
# scale-to-zero platform.
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first so the dependency layer is cached and only reinstalled
# when the lockfile actually changes.
COPY package*.json ./
COPY prisma ./prisma

# `npm ci` installs exactly what the lockfile pins — a build must never resolve
# a different dependency tree than the one that was reviewed and tested.
# `--ignore-scripts` blocks arbitrary install hooks from running at build time;
# the one script actually needed (prisma generate) is invoked explicitly below.
RUN npm ci --ignore-scripts

# The Prisma client is generated code and must exist before the app can run.
# This needs the `prisma` CLI, which is a devDependency — hence generating here,
# while dev dependencies are still installed.
RUN npx prisma generate

COPY src ./src

# `npm prune`, not a second `npm ci --omit=dev`: prune removes dev dependencies
# in place, whereas re-running ci wipes node_modules and takes the generated
# Prisma client with it — leaving an image that fails at first query.
RUN npm prune --omit=dev \
    && npm cache clean --force

# --- runtime stage ---------------------------------------------------------
FROM node:22-alpine AS runtime

# dumb-init reaps zombies and, more importantly, forwards SIGTERM to the Node
# process. Without a real init, a container's stop signal is delivered to PID 1
# and the graceful-shutdown handler in server.js never runs — every deploy then
# severs in-flight requests.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
# Caps V8's heap below the container's memory limit so an allocation spike
# surfaces as a JavaScript error rather than an opaque OOM kill.
ENV NODE_OPTIONS="--max-old-space-size=384"

WORKDIR /app

# The node image ships an unprivileged `node` user. Running as root would mean a
# process compromise is immediately a container-root compromise.
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/package.json ./package.json
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node --from=build /app/src ./src

USER node

# Documentation only; the platform injects the real port via PORT and the app
# reads it rather than assuming 8080.
EXPOSE 8080

# Exec form, so the signal reaches the process directly rather than through a
# shell that would swallow it.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
