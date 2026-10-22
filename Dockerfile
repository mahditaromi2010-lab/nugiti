FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p uploads/covers uploads/private && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm start"]
