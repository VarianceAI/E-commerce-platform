FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# Build React app
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY package.json server.js ./
RUN npm install --production

COPY --from=builder /app/build ./build

EXPOSE 3000

CMD ["node", "server.js"]