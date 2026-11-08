FROM node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/data/budgetpal.db

# Prisma's Linux engine needs OpenSSL. Keep dev dependencies for db push and seed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000
VOLUME ["/data"]
ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
CMD ["npm", "start", "--", "--hostname", "0.0.0.0"]
