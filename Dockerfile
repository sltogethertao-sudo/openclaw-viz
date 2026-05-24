FROM node:24-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

COPY client/package.json client/
RUN cd client && npm install

COPY . .
RUN cd client && npm run build

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/package.json /app/
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/server /app/server
COPY --from=builder /app/client/dist /app/client/dist

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server/index.js"]
