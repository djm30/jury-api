FROM node:22-slim

RUN apt-get update && apt-get install -yq chromium

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY .env ./.env
COPY src ./src

RUN npm ci
RUN npm run build

EXPOSE 6543

CMD ["node", "dist/index.js"]
