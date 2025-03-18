FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (for better caching)
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy prisma schema
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p logs temp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5002

# Expose the port the app will run on
EXPOSE 5002

# Start the application
CMD ["node", "src/index.js"]
