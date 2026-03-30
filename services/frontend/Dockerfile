# Build stage
FROM node:18-alpine AS builder

ARG REACT_APP_API_URL=http://localhost:3000/api
ARG REACT_APP_WEBSOCKET_URL=ws://localhost:3000

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Build React app with environment variables
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_WEBSOCKET_URL=$REACT_APP_WEBSOCKET_URL

RUN npm run build

# Runtime stage
FROM nginx:alpine

# Copy built app to nginx
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
