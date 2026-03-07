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
    
    # Update the key in .env (Linux/Mac compatible sed)
    sed -i.bak "s/NEXUS_API_KEY=your_secret_key_here/NEXUS_API_KEY=$API_KEY/" .env && rm .env.bak
    
    echo "✅ Configuration created."
else
    echo "✅ .env file found."
fi

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker Desktop first."
    exit 1
fi

echo ""
echo "🚀 Launching Neural Nexus..."
echo "   - API & Dashboard: http://localhost:3000"
echo "   - OpenAI Proxy:    http://localhost:3001/v1"
echo ""

docker-compose up --build -d

echo ""
echo "🎉 System is running!"
echo "   Type 'docker-compose logs -f' to see output."
