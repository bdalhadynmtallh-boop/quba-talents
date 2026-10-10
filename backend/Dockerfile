FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
COPY backend/shared/package.json ./backend/shared/package.json
RUN npm ci
COPY backend ./backend
RUN npm run db:generate && npm run build -w @quba/shared && npm run build -w @quba/api

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/package.json /app/backend/prisma.config.ts ./backend/
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/shared/package.json ./backend/shared/package.json
COPY --from=build /app/backend/shared/dist ./backend/shared/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/assets ./backend/assets
RUN ./node_modules/.bin/playwright install --with-deps chromium && mkdir -p /var/data/uploads && chown -R node:node /var/data /ms-playwright
USER node
WORKDIR /app/backend
EXPOSE 10000
CMD ["sh", "-c", "npm run db:deploy && exec node dist/server.js"]
