# ExamAssist AI Backend Dockerfile
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY . .

# Run as non-root user
USER node

# Default port
ENV PORT=8787
ENV NODE_ENV=production
EXPOSE 8787

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "server.js"]
