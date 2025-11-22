FROM node:20-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY server.js ./
EXPOSE 8787
CMD ["node","server.js"]
