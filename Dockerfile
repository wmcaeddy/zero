FROM node:18-slim

# Install fwknop client and basic tools
RUN apt-get update && apt-get install -y \
    fwknop-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files from subdirectory to root of container
COPY server/sas-api/package*.json ./
RUN npm install

# Copy application source code
COPY server/sas-api/ .

# Create directory for persistent data
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 8080

CMD ["node", "index.js"]
