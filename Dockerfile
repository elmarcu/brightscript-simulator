FROM node:18-slim

# install brs CLI globally (this provides the 'brs' executable)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip git \
    && rm -rf /var/lib/apt/lists/*

# install global brs CLI via npm
RUN npm install -g brs

WORKDIR /app

# copy server code
COPY package.json /app/
RUN npm install

COPY server.js /app/server.js
COPY public /app/public

# Expose port
EXPOSE 8080

CMD ["node", "/app/server.js"]
