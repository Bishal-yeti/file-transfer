#!/usr/bin/env bash

# ==============================================================================
# File Transfer — 1-Click Instant Public Mode
# ==============================================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# Auto build if not built
if [ ! -d "server/dist" ] || [ ! -d "client/dist" ]; then
    echo -e "${CYAN}[*] First-time setup detected. Building project...${NC}"
    npm run setup
fi

# Locate or download cloudflared
CLOUDFLARED_BIN=""
if command -v cloudflared &> /dev/null; then
    CLOUDFLARED_BIN="cloudflared"
elif [ -x "./bin/cloudflared" ]; then
    CLOUDFLARED_BIN="./bin/cloudflared"
else
    echo -e "${YELLOW}[*] Downloading portable tunnel client...${NC}"
    mkdir -p ./bin
    ARCH=$(uname -m)
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    if [ "$OS" == "linux" ]; then
        if [ "$ARCH" == "x86_64" ]; then
            curl -L -s --output ./bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
        elif [ "$ARCH" == "aarch64" ] || [ "$ARCH" == "arm64" ]; then
            curl -L -s --output ./bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
        fi
    elif [ "$OS" == "darwin" ]; then
        curl -L -s --output ./bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64
    fi

    if [ -f "./bin/cloudflared" ]; then
        chmod +x ./bin/cloudflared
        CLOUDFLARED_BIN="./bin/cloudflared"
    else
        echo -e "${RED}[!] Could not download cloudflared. Running in local mode on http://localhost:3001${NC}"
        cd server && node dist/index.js
        exit 0
    fi
fi

# Start Backend Server
echo -e "${CYAN}[1/2] Starting backend server...${NC}"
(cd server && node dist/index.js) &
SERVER_PID=$!

# Cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}[*] Shutting down...${NC}"
    kill $SERVER_PID 2>/dev/null || true
    kill $TUNNEL_PID 2>/dev/null || true
    rm -f /tmp/ft_tunnel.log
    echo -e "${GREEN}[✓] Done!${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

sleep 1

# Start Cloudflare Tunnel
echo -e "${CYAN}[2/2] Opening worldwide secure HTTPS tunnel...${NC}"
rm -f /tmp/ft_tunnel.log
$CLOUDFLARED_BIN tunnel --protocol http2 --url http://localhost:3001 > /tmp/ft_tunnel.log 2>&1 &
TUNNEL_PID=$!

# Capture public URL
PUBLIC_URL=""
for i in {1..30}; do
    if grep -q "trycloudflare.com" /tmp/ft_tunnel.log 2>/dev/null; then
        PUBLIC_URL=$(grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' /tmp/ft_tunnel.log | head -n 1)
        break
    fi
    sleep 1
done

echo ""
if [ -n "$PUBLIC_URL" ]; then
    echo -e "${GREEN}${BOLD}========================================================================${NC}"
    echo -e "${GREEN}${BOLD}  FILE TRANSFER IS LIVE WORLDWIDE!${NC}"
    echo -e "  Open this link on any phone, tablet, or computer:"
    echo -e "  👉  ${CYAN}${BOLD}${PUBLIC_URL}${NC}"
    echo -e "${GREEN}${BOLD}========================================================================${NC}"
    echo -e "  (Press ${BOLD}Ctrl+C${NC} anytime to stop)"
    echo ""
else
    echo -e "${YELLOW}[!] Tunnel taking longer than usual. Check http://localhost:3001${NC}"
fi

wait $SERVER_PID
