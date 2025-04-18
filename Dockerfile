FROM node:18.18.2

WORKDIR /app

COPY package.json ./

COPY src ./src

WORKDIR /app/src

CMD ["node", "index.js"]
