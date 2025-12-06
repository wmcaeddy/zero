FROM node:18-slim

# Install fwknop client and basic tools
RUN apt-get update && apt-get install -y \
    fwknop-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Create directory for persistent data
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

CMD ["node", "index.js"]
