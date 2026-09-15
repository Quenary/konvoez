# Networking and Deployment Guide for Konvoez

This document details how networking, reverse proxies, and WebRTC media streams work in Konvoez, and how to configure them for self-hosted deployments behind NAT routers and reverse proxies.

---

## 1. Network Architecture Overview

Konvoez consists of two distinct communication channels:

1. **Signaling & API (TCP)**: HTTP REST endpoints (`/api/v1/...`) and Socket.IO WebSockets (`/ws/v1/text`, `/ws/v1/voice`).
2. **Media Streams (UDP/TCP)**: WebRTC audio and video RTP/RTCP packets managed by the Mediasoup Selective Forwarding Unit (SFU).

### Traffic Flow Diagram

```
                        ┌────────────────────────────────────────────────────────┐
                        │                   Client (Browser)                     │
                        └───────────────┬────────────────────────┬───────────────┘
                                        │                        │
                1. Signaling (HTTPS / WSS)                       │ 2. WebRTC Media (RTP/RTCP UDP)
                https://konvoez.example.com                      │ Direct UDP connection
                                        │                        │
                                        ▼                        │
                ┌─────────────────────────────────┐              │
                │   External Reverse Proxy / Host  │              │
                │         (example.com)           │              │
                │  - Terminate SSL (443)          │              │
                │  - Proxy HTTP & WebSockets      │              │
                └───────────────┬─────────────────┘              │
                                │                                │
                        HTTP/WS (port 80)                        │
                                │                                │
                                ▼                                ▼
    ┌───────────────────────────────────────────────────────────────────────────┐
    │  Docker Host (e.g. 192.168.0.10)                                          │
    │                                                                           │
    │  Router / Firewall rule:                                                  │
    │    Port forward UDP 40000-40100 ────► 192.168.0.10:40000-40100            │
    │                                                                           │
    │  ┌─────────────────────────────────────────────────────────────────────┐  │
    │  │ Konvoez Docker Container (supervisord)                              │  │
    │  │                                                                     │  │
    │  │  Port 80 (Nginx) ──► Static Angular SPA (/app/frontend)            │  │
    │  │                  ──► Proxy /api + WebSocket ──► NestJS (:3000)     │  │
    │  │                                                                     │  │
    │  │  Ports 40000-40100 (UDP/TCP) ──► Mediasoup Worker (Audio / Video)   │  │
    │  └─────────────────────────────────────────────────────────────────────┘  │
    └───────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Why WebRTC Differs from Standard Web Apps

In a typical web application, all traffic (HTTP and WebSockets) routes through a reverse proxy (like Nginx, Caddy, or Cloudflare).

WebRTC is fundamentally different:

- **Signaling**: The browser exchanges connection metadata (ICE candidates, DTLS keys, SDP parameters) with NestJS over the WebSocket connection (`/ws/v1/voice`).
- **Media Transfer**: Once signaling is complete, the browser establishes a **direct peer-to-server UDP socket** with Mediasoup on dynamically negotiated ports in the range `40000-40100`.
- **Reverse Proxy Limitation**: Standard Layer 7 HTTP reverse proxies cannot reverse-proxy dynamic UDP RTP packets. Therefore, media packets **bypass** your external reverse proxy and must reach the Docker host directly.

---

## 3. Required Network Configuration

If you host Konvoez on a local IP (e.g., `192.168.0.10`) while your domain (`konvoez.example.com`) points to a public IP:

### Step 1: Forward WebRTC Ports on Your Router

In your internet router's administration panel:

- **Service Name**: `Konvoez WebRTC`
- **Protocol**: `UDP` (and optionally `TCP` for fallback)
- **Port Range**: `40000 - 40100`
- **Destination IP**: Your Docker host's private IP (e.g., `192.168.0.10`)

> [!NOTE]
> Each voice participant consumes 2 ports (1 for sending audio, 1 for receiving). A range of 100 ports (`40000-40100`) comfortably supports up to 50 concurrent active voice transports.

### Step 2: Configure `MEDIASOUP_ANNOUNCED_IP`

In your `.env` file (or `docker-compose.yml` environment):

```env
MEDIASOUP_ANNOUNCED_IP=203.0.113.5
```

Set this to your **external public IPv4 address** (the public IP of `example.com`).

**Why this is mandatory**:
When creating WebRTC transports, Mediasoup sends this IP to browsers as an ICE candidate (`typ host`). If `MEDIASOUP_ANNOUNCED_IP` is left unset or set to `192.168.0.10`, external internet users will receive an unreachable private LAN IP and will not hear or transmit any audio.

### Step 3: Configure External Reverse Proxy (Nginx Example)

Your external reverse proxy terminating HTTPS on `example.com` only needs to forward HTTP and WebSocket traffic to port 80 of your Docker host:

```nginx
server {
    listen 443 ssl http2;
    server_name konvoez.example.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        client_max_body_size 50m;
        proxy_pass http://192.168.0.10:80;
        proxy_http_version 1.1;

        # WebSocket support (critical for Socket.IO signaling)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 4. Docker Network Modes: Bridge vs Host

In `docker-compose.yml`, two network modes are available:

### Option A: Bridge Network (Default)

```yaml
ports:
  - '80:80'
  - '40000-40100:40000-40100/udp'
  - '40000-40100:40000-40100/tcp'
```

- **Cross-Platform**: Works everywhere — Linux, Windows (WSL2 / Docker Desktop), and macOS.
- **Port Isolation**: Bounding the range to 100 ports eliminates the high CPU/memory overhead usually caused by Docker's `docker-proxy` when mapping thousands of ports.

### Option B: Host Network (`network_mode: "host"`)

```yaml
services:
  app:
    network_mode: host
    # ports section is omitted
```

- **Linux Only**: Does not work properly on Windows or macOS Docker Desktop (it binds to the virtual machine interface instead of the host).
- **Highest Performance**: Removes all Docker bridge NAT and `iptables` translation overhead, optimal for high-capacity dedicated Linux VPS or bare-metal servers.

---

## 5. Troubleshooting & FAQ

### Symptom: Voice status shows "Connected", but no audio is heard

- **Cause**: Signaling over WebSockets succeeded, but UDP media packets are blocked or misrouted.
- **Fix**:
  1. Verify UDP port forwarding (`40000-40100/udp`) on your router points to `192.168.0.10`.
  2. Verify `MEDIASOUP_ANNOUNCED_IP` matches your current public IP address.
  3. Ensure your host OS firewall (e.g. `ufw`, `firewalld`, Windows Firewall) allows incoming UDP traffic on ports `40000-40100`.

### Symptom: External users can talk, but users on the same local Wi-Fi / LAN cannot

- **Cause**: Your router does not support **NAT Loopback** (Hairpin NAT), preventing LAN clients from sending packets to their own external public IP.
- **Fix**: Enable "NAT Loopback" / "Hairpin NAT" in your router settings.
