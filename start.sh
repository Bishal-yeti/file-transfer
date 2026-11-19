#!/usr/bin/env bash

# ==============================================================================
# File Transfer — Interactive Smart Launcher
# ==============================================================================

set -e

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

clear 2>/dev/null || true

echo -e "${CYAN}${BOLD}"
echo "  ███████╗██╗██╗     ███████╗    ████████╗██████╗  █████╗ ███╗   ██╗███████╗███████╗███████╗██████╗ "
echo "  ██╔════╝██║██║     ██╔════╝    ╚══██╔══╝██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔════╝██╔════╝██╔══██╗"
echo "  █████╗  ██║██║     █████╗         ██║   ██████╔╝███████║██╔██╗ ██║███████╗█████╗  █████╗  ██████╔╝"
echo "  ██╔══╝  ██║██║     ██╔══╝         ██║   ██╔══██╗██╔══██║██║╚██╗██║╚════██║██╔══╝  ██╔══╝  ██╔══██╗"
echo "  ██║     ██║███████╗███████╗       ██║   ██║  ██║██║  ██║██║ ╚████║███████║██║     ███████╗██║  ██║"
echo "  ╚═╝     ╚═╝╚══════╝╚══════╝       ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝     ╚══════╝╚═╝  ╚═╝"
echo -e "${NC}"
echo -e "  ${BOLD}Anonymous, End-to-End Encrypted File Sharing Platform (AES-256-GCM)${NC}"
echo -e "  ------------------------------------------------------------------"
echo ""

# 1. Check Node.js Version
if ! command -v node &> /dev/null; then
    echo -e "${RED}[!] Node.js is not installed.${NC} Please install Node.js 18+ or 20+."
    exit 1
fi

NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo -e "${YELLOW}[!] Warning: Node.js version $(node -v) is older than v18.${NC}"
    echo -e "    Please run: ${CYAN}nvm install 20 && nvm use 20${NC}"
    exit 1
fi

# 2. Check if built, if not auto-build
if [ ! -d "server/dist" ] || [ ! -d "client/dist" ]; then
    echo -e "${CYAN}[*] First-time setup detected. Installing packages & compiling...${NC}"
    npm run setup
    echo -e "${GREEN}[✓] Setup complete!${NC}\n"
fi

# 3. Detect Local Network IP
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo -e "${BOLD}Select how you want to run File Transfer:${NC}"
echo -e "  ${CYAN}1)${NC} ${BOLD}Local / Wi-Fi Mode${NC}  (Share with devices on your local network)"
echo -e "  ${CYAN}2)${NC} ${BOLD}Global Public Mode${NC}  (Share worldwide using instant Cloudflare HTTPS tunnel)"
echo ""
read -p "Enter choice [1 or 2, default: 2]: " CHOICE
CHOICE=${CHOICE:-2}

echo ""

if [ "$CHOICE" == "1" ]; then
    echo -e "${GREEN}[*] Starting File Transfer in Local Mode...${NC}"
    echo -e "    • On this PC:      ${CYAN}http://localhost:3001${NC}"
    echo -e "    • Other Wi-Fi PCs: ${CYAN}http://${LOCAL_IP}:3001${NC}"
    echo -e "    (Press ${BOLD}Ctrl+C${NC} to stop)"
    echo ""
    cd server && node dist/index.js
else
    # Find or install portable cloudflared (no sudo required)
    CLOUDFLARED_BIN=""
    if command -v cloudflared &> /dev/null; then
        CLOUDFLARED_BIN="cloudflared"
    elif [ -x "./bin/cloudflared" ]; then
        CLOUDFLARED_BIN="./bin/cloudflared"
    else
        echo -e "${YELLOW}[*] Cloudflare tunnel helper not found. Downloading portable standalone binary (no root needed)...${NC}"
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
            echo -e "${GREEN}[✓] Portable cloudflared ready!${NC}"
        else
            echo -e "${RED}[!] Could not automatically download cloudflared. Falling back to Local Mode.${NC}"
            cd server && node dist/index.js
            exit 0
        fi
    fi

    # Start Server in background
    echo -e "${CYAN}[1/2] Starting backend server...${NC}"
    (cd server && node dist/index.js) &
    SERVER_PID=$!

    # Trap Ctrl+C to kill both server and tunnel cleanly
    cleanup() {
        echo -e "\n${YELLOW}[*] Shutting down File Transfer...${NC}"
        kill $SERVER_PID 2>/dev/null || true
        kill $TUNNEL_PID 2>/dev/null || true
        rm -f /tmp/ft_tunnel.log
        echo -e "${GREEN}[✓] Cleaned up! Bye.${NC}"
        exit 0
    }
    trap cleanup SIGINT SIGTERM EXIT

    sleep 1

    # Start Cloudflare Tunnel over reliable HTTP/2
    echo -e "${CYAN}[2/2] Opening global secure HTTPS tunnel...${NC}"
    rm -f /tmp/ft_tunnel.log
    $CLOUDFLARED_BIN tunnel --protocol http2 --url http://localhost:3001 > /tmp/ft_tunnel.log 2>&1 &
    TUNNEL_PID=$!

    # Wait for tunnel URL
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
        echo -e "  Open this link on any phone, tablet, or PC anywhere:"
        echo -e "  👉  ${CYAN}${BOLD}${PUBLIC_URL}${NC}"
        echo -e "${GREEN}${BOLD}========================================================================${NC}"
        echo -e "  ${YELLOW}Notice: Keep this terminal open while sharing files.${NC}"
        echo -e "  (Press ${BOLD}Ctrl+C${NC} anytime to stop)"
        echo ""
    else
        echo -e "${YELLOW}[!] Tunnel taking longer than expected to acquire domain.${NC}"
        echo -e "    Check /tmp/ft_tunnel.log or access locally at http://localhost:3001"
    fi

    # Wait for background processes
    wait $SERVER_PID
fi
