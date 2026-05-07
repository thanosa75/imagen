FROM node:25-alpine

# Create directories and set ownership for the existing node user (uid 1000)
RUN mkdir -p /usr/src/app/uploads /usr/src/app/results && \
    chown -R node:node /usr/src/app

WORKDIR /usr/src/app

# Install dependencies as root for layer caching, then fix ownership
COPY package*.json ./
RUN npm install --omit=dev && chown -R node:node /usr/src/app

# Copy app source
COPY --chown=node:node . .

# Switch to node user (uid 1000, matches host pn:pn)
USER node

# Default command (overridden in docker-compose for worker)
CMD ["npm", "start"]