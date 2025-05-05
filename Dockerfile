FROM mcr.microsoft.com/playwright:v1.52.0-noble-arm64

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY .env ./.env
COPY src ./src

RUN npm ci
RUN npm run build

EXPOSE 6543

CMD ["node", "dist/index.js"]
