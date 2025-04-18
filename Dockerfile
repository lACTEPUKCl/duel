FROM node:18.18.2

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY src ./src

WORKDIR /app/src

CMD ["node", "index.js"]
