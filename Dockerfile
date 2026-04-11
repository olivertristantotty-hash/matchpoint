FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/
COPY drizzle.config.ts ./

CMD ["npx", "tsx", "src/index.ts"]
