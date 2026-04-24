FROM node:25-alpine

# Create non-root user and directories
RUN addgroup -g 1001 -S imagen && \
    adduser -S imagen -u 1001 -G imagen && \
    mkdir -p /usr/src/app/uploads /usr/src/app/results && \
    chown -R imagen:imagen /usr/src/app

WORKDIR /usr/src/app

# Install dependencies as root for layer caching, then fix ownership
COPY package*.json ./
RUN npm install --omit=dev && chown -R imagen:imagen /usr/src/app

# Copy app source
COPY --chown=imagen:imagen . .

# Switch to non-root user
USER imagen

# Default command (overridden in docker-compose for worker)
CMD ["npm", "start"]
