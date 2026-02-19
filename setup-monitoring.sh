#!/bin/bash

# =============================================================================
# Setup Script for Grafana + Monitoring Stack
# =============================================================================
# Run this script on your remote server via SSH
# Usage: bash setup-monitoring.sh
# =============================================================================

set -e

echo "=========================================="
echo "Setting up Grafana & Monitoring Stack"
echo "=========================================="

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    echo "ERROR: docker-compose.yml not found in current directory"
    exit 1
fi

# -----------------------------------------------------------------------------
# Step 1: Update CORS_ORIGINS in docker-compose.yml
# -----------------------------------------------------------------------------
echo ""
echo "[1/4] Updating CORS_ORIGINS for app.geniusai.live..."

# Use sed to update CORS_ORIGINS - handles both single and double quotes
sed -i 's|CORS_ORIGINS: \${CORS_ORIGINS:-http://localhost:54059/app}|CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:54059/app,https://app.geniusai.live,https://app.geniusai.live/app}|g' docker-compose.yml

echo "✓ CORS_ORIGINS updated"

# -----------------------------------------------------------------------------
# Step 2: Add monitoring services if not already present
# -----------------------------------------------------------------------------
echo ""
echo "[2/4] Checking for monitoring services..."

if ! grep -q "beat-engine-grafana" docker-compose.yml; then
    echo "Adding Grafana, Prometheus, Loki, Promtail services..."
    
    # Remove old volumes/networks section and add new services
    # First, let's find where to insert (before "volumes:")
    LINE_NUM=$(grep -n "^volumes:" docker-compose.yml | head -1 | cut -d: -f1)
    
    if [ -n "$LINE_NUM" ]; then
        # Create backup
        cp docker-compose.yml docker-compose.yml.bak
        
        # Insert monitoring services before volumes section
        head -n $((LINE_NUM - 1)) docker-compose.yml > docker-compose.yml.tmp
        
        cat >> docker-compose.yml.tmp << 'MONITORING_SERVICES'

  # Prometheus for Metrics Collection
  prometheus:
    image: prom/prometheus:latest
    container_name: beat-engine-prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    ports:
      - "9091:9090"
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=7d"
    restart: unless-stopped
    networks:
      - backend-network
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

  # Grafana for Visualization
  grafana:
    image: grafana/grafana:latest
    container_name: beat-engine-grafana
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
      GF_INSTALL_PLUGINS: "redis-datasource"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
    restart: unless-stopped
    networks:
      - backend-network
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
    depends_on:
      - prometheus
      - jaeger

  # Loki for Log Aggregation
  loki:
    image: grafana/loki:latest
    container_name: beat-engine-loki
    ports:
      - "3100:3100"
    volumes:
      - ./monitoring/loki-config.yml:/etc/loki/local-config.yaml:ro
      - loki_data:/loki
    command: -config.file=/etc/loki/local-config.yaml
    restart: unless-stopped
    networks:
      - backend-network
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

  # Promtail for Log Shipping
  promtail:
    image: grafana/promtail:latest
    container_name: beat-engine-promtail
    volumes:
      - ./monitoring/promtail-config.yml:/etc/promtail/config.yaml:ro
      - /var/log:/var/log
    command: -config.file=/etc/promtail/config.yaml
    restart: unless-stopped
    networks:
      - backend-network
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

MONITORING_SERVICES
        
        # Add the rest of the original file (volumes and networks sections)
        tail -n +$LINE_NUM docker-compose.yml >> docker-compose.yml.tmp
        
        # Replace original
        mv docker-compose.yml.tmp docker-compose.yml
        
        echo "✓ Monitoring services added"
    else
        echo "ERROR: Could not find volumes section in docker-compose.yml"
        exit 1
    fi
else
    echo "✓ Monitoring services already present"
fi

# -----------------------------------------------------------------------------
# Step 3: Start/Update Docker containers
# -----------------------------------------------------------------------------
echo ""
echo "[3/4] Starting monitoring services..."

# Pull latest images
docker-compose pull prometheus grafana loki promtail

# Start the services
docker-compose up -d prometheus grafana loki promtail

echo "✓ Docker containers started"

# -----------------------------------------------------------------------------
# Step 4: Restart backend with new CORS settings
# -----------------------------------------------------------------------------
echo ""
echo "[4/4] Restarting backend with new CORS settings..."

docker-compose up -d --force-recreate backend

echo ""
echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "Access Grafana at: http://<your-server-ip>:3000"
echo "  - Username: admin"
echo "  - Password: admin"
echo ""
echo "Other services:"
echo "  - Prometheus: http://<your-server-ip>:9091"
echo "  - Loki:      http://<your-server-ip>:3100"
echo "  - Jaeger:    http://<your-server-ip>:16686"
echo ""
echo "=========================================="

