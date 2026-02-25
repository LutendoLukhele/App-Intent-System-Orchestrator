# Cloudflare Tunnel Setup for WebSocket

## Step 1: Install cloudflared
```bash
# Download and install cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
```

## Step 2: Authenticate with Cloudflare
```bash
cloudflared tunnel login
```
This will open a browser window to authenticate with Cloudflare and select your domain.

## Step 3: Create a tunnel
```bash
cloudflared tunnel create beat-engine-tunnel
```

## Step 4: Configure the tunnel
Create ~/.cloudflared/config.yml:
```yaml
tunnel: <TUNNEL-ID>
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  # WebSocket endpoint - connects to backend on port 8080
  - hostname: ws.185-220-205-193.cloud-xip.com
    service: http://localhost:8080

  # Optional: Grafana
  - hostname: grafana.185-220-205-193.cloud-xip.com
    service: http://localhost:3000

  # Catch-all - return 404
  - service: http_status:404
```

## Step 5: Route the domain
```bash
# Add CNAME records in Cloudflare DNS:
# ws.185-220-205-193.cloud-xip.com -> <TUNNEL-ID>.cfargotunnel.com
# grafana.185-220-205-193.cloud-xip.com -> <TUNNEL-ID>.cfargotunnel.com

cloudflared tunnel route dns beat-engine-tunnel ws.185-220-205-193.cloud-xip.com
```

## Step 6: Run the tunnel
```bash
# Run in background
cloudflared tunnel --config ~/.cloudflared/config.yml run beat-engine-tunnel

# Or run as a service
sudo cloudflared service install
```

## Step 7: Update Frontend
Change the WebSocket URL in your Flutter app from:
```dart
static final String _apiHost = '185-220-205-193.cloud-xip.com';
// to
static final String _apiHost = 'ws.185-220-205-193.cloud-xip.com';
```

The connection will now go through Cloudflare's secure edge with automatic SSL!
