#!/bin/bash

# Setup script for local development
# Usage: ./scripts/setup-local.sh

set -e

echo "🚀 Setting up local development environment..."
echo ""

# Check if .dev.vars exists
if [ ! -f .dev.vars ]; then
    echo "📝 Creating .dev.vars file..."
    
    if [ -f private-key.pem ] && [ -f public-key.pem ]; then
        echo "PRIVATE_KEY=\"$(cat private-key.pem)\"" > .dev.vars
        echo "" >> .dev.vars
        echo "PUBLIC_KEY=\"$(cat public-key.pem)\"" >> .dev.vars
        echo "✅ .dev.vars created with keys"
    else
        echo "❌ Error: private-key.pem or public-key.pem not found"
        echo "   Please ensure your RSA keys are in the project root"
        exit 1
    fi
else
    echo "✅ .dev.vars already exists"
fi

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🗄️  Applying migrations to local database..."
npx wrangler d1 migrations apply acme-rest-db --local

echo ""
echo "✅ Verifying database tables..."
npx wrangler d1 execute acme-rest-db --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

echo ""
echo "✅ Local setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start dev server:  npm run dev"
echo "  2. Test health:       curl http://localhost:8787/health"
echo "  3. Seed data:         node scripts/seed-data.js http://localhost:8787"
echo ""
