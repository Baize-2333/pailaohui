FROM node:24-alpine
WORKDIR /app
COPY . .
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8080
CMD ["node","standalone/server.mjs"]
