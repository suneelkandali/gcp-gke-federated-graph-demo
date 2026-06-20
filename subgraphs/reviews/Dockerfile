FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN rm -f package-lock.json && npm install --omit=dev && npm install graphql-tag --save
COPY index.js .
EXPOSE 4002
CMD ["npm", "start"]