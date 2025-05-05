FROM node:20-slim

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

RUN npm ci
RUN npm run build

EXPOSE 6543

CMD ["npm", "run", "start:prod"]