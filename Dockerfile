FROM node:25-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy app source
COPY . .

# Create directories for persistent data
RUN mkdir -p uploads results

# Default command (will be overridden in docker-compose for the worker)
CMD ["npm", "start"]
