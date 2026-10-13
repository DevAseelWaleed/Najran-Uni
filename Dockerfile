FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps ./apps
COPY scripts ./scripts
RUN npm run db:generate && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 SERVE_WEB=true \
    STORAGE_PROVIDER=supabase MAIL_PROVIDER=brevo PDF_BROWSER_CHANNEL=chromium \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/assets ./apps/api/assets
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/package.json /app/package-lock.json ./
COPY scripts/cloud-start.mjs ./scripts/cloud-start.mjs
RUN npx playwright install --with-deps chromium \
    && chmod -R a+rX /opt/playwright \
    && chown -R node:node /app
USER node
EXPOSE 10000
CMD ["node", "scripts/cloud-start.mjs"]
