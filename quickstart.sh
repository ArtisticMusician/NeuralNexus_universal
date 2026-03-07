#!/bin/bash

# Neural Nexus Quickstart Script

echo "🧠 Neural Nexus: Universal AI Memory"
echo "===================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating one now..."
    cp .env.example .env
    
    echo ""
    echo "🔑 We need to secure your memory."
    read -p "Enter a new API Key (or press Enter for 'nexus-secret'): " API_KEY
    API_KEY=${API_KEY:-nexus-secret}
    
    # Cross-platform sed for Linux and macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/NEXUS_API_KEY=your_secret_key_here/NEXUS_API_KEY=$API_KEY/" .env
    else
        sed -i "s/NEXUS_API_KEY=your_secret_key_here/NEXUS_API_KEY=$API_KEY/" .env
    fi
    
    echo "✅ Configuration created."
else
    echo "✅ .env file found."
fi

echo ""
echo "Select your startup mode:"
echo "1) ⚡ Native Mode (Lighter, no Docker, uses your local Node.js)"
echo "2) 🐳 Docker Mode (Containerized, includes built-in Qdrant)"
read -p "Selection [1-2]: " MODE

if [ "$MODE" == "2" ]; then
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker is not installed. Falling back to Native..."
        MODE="1"
    else
        echo "🚀 Launching via Docker..."
        docker-compose up --build -d
        echo "🎉 Done! API at http://localhost:3000, Proxy at http://localhost:3001/v1"
        exit 0
    fi
fi

if [ "$MODE" == "1" ] || [ "$MODE" == "" ]; then
    echo "🚀 Launching Native Mode..."
    echo "💡 Note: You need a Qdrant instance running (Local or Cloud)."
    echo "   If you don't have one, get a free cluster at: https://cloud.qdrant.io"
    echo ""
    npm install
    npm run build
    npm run dev:all
fi
