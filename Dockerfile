FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data && chown -R node:node /app
EXPOSE 3000
ENV PORT=3000 DB_PATH=./data/tableflow.db
USER node
CMD ["node", "server.js"]
