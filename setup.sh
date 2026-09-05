#!/bin/bash

# Codex Setup Script
# This script sets up the Codex project for local development

set -e

echo "🚀 Codex Setup Script"
echo "===================="
echo ""

# Check Node.js version
echo "✓ Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "✗ Node.js is not installed. Please install Node.js 18 or later."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "✗ Node.js 18 or later is required. You have version $(node -v)"
    exit 1
fi
echo "  Node.js $(node -v) ✓"
echo ""

# Check npm
echo "✓ Checking npm..."
if ! command -v npm &> /dev/null; then
    echo "✗ npm is not installed."
    exit 1
fi
echo "  npm $(npm -v) ✓"
echo ""

# Create .env file
echo "✓ Setting up environment..."
if [ ! -f .env ]; then
    echo "  Creating .env from .env.example..."
    cp .env.example .env
    echo "  .env created. Please review and update with your settings."
else
    echo "  .env already exists"
fi
echo ""

# Create .codex directory
echo "✓ Creating .codex metadata directory..."
mkdir -p .codex
echo "  .codex/ created"
echo ""

# Install dependencies
echo "✓ Installing dependencies..."
npm install --workspaces
echo "  Dependencies installed"
echo ""

# Build shared types
echo "✓ Building shared types..."
npm run build --workspace=@codex/shared
echo "  Shared types built"
echo ""

# Create sample applicationModel.json
echo "✓ Creating sample application model..."
cat > .codex/applicationModel.json << 'EOF'
{
  "metadata": {
    "name": "my-application",
    "description": "My AI-native application",
    "version": "0.1.0",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  },
  "stack": {
    "frontend": null,
    "backends": [],
    "databases": [],
    "ai": []
  },
  "modules": [],
  "architecture": {
    "services": [],
    "relationships": [],
    "dataFlow": []
  },
  "files": {
    "projectRoot": ".",
    "importantPaths": [],
    "moduleRoots": [],
    "configFiles": []
  },
  "discoveryMetadata": {
    "lastDiscoveredAt": "",
    "discoveryVersion": "1.0.0",
    "parserVersion": "1.0.0"
  }
}
EOF
echo "  Application model created"
echo ""

# Display setup complete message
echo "✅ Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Review and update .env with your configuration"
echo "2. Start services: docker-compose up (optional)"
echo "3. Run the project:"
echo "   npm run dev              # Start both backend and frontend"
echo "   npm run dev:backend      # Start backend only"
echo "   npm run dev:frontend     # Start frontend only"
echo ""
echo "4. Open http://localhost:3000 in your browser"
echo ""
echo "For more information, see README.md"
