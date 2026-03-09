FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
RUN addgroup -S -g 1001 nodejs && \
    adduser -S -D -H -u 1001 -G nodejs nextjs
EXPOSE 3000
USER nextjs
CMD ["npm", "start"]
