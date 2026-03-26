FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /app

# Copy Maven files
COPY pom.xml .
COPY mvnw .

# Download dependencies
RUN mvn dependency:resolve

# Copy source code
COPY src ./src

# Build JAR
RUN mvn clean package -DskipTests

# Runtime stage
FROM openjdk:17-slim

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy JAR from builder
COPY --from=builder /app/target/ucis-cep-*.jar app.jar

# Copy config
COPY config/ ./config/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8081/health || exit 1

# Run application
ENTRYPOINT ["java", "-jar", "app.jar"]
