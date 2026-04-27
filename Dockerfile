FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++ su-exec
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN chmod +x entrypoint.sh
RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app
EXPOSE 3000
ENV PORT=3000 DB_PATH=./data/tableflow.db
# Run as root so entrypoint can fix volume perms, then drops to appuser
ENTRYPOINT ["./entrypoint.sh"]
