# ─── Imagen de producción: recallcollosusdh.cl ───────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY package.json tsconfig.json next.config.ts drizzle.config.ts ./
RUN mkdir -p /app/.data/uploads && chown -R app:app /app
USER app
EXPOSE 3000
# Aplica migraciones y arranca. DATABASE_URL es obligatoria en producción.
CMD ["sh", "-c", "npm run -s db:migrate && npm run -s start"]
