FROM node:18-slim

# Install brighterscript and brs globally
RUN npm install -g brighterscript brs

# Set working dir
WORKDIR /app

# Copy package.json & install deps
COPY package*.json ./
RUN npm install

# Copy server + public folder
COPY server.js ./server.js
COPY public ./public

# Create projects folder
RUN mkdir -p /app/projects

# Expose port
EXPOSE 8080

# Start the server with nodemon
CMD ["npx", "nodemon", "--watch", "server.js", "server.js"]
