FROM node:20-alpine
WORKDIR /app
COPY tools/test-gate/server.mjs ./server.mjs
USER node
EXPOSE 4200
CMD ["node", "server.mjs"]
