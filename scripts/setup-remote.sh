#!/bin/bash

# Setup script for remote deployment
# Usage: ./scripts/setup-remote.sh

set -e

echo "☁️  Setting up remote deployment..."
echo ""

echo "🗄️  Applying migrations to remote database..."
npx wrangler d1 migrations apply acme-rest-db --remote

echo ""
echo "✅ Verifying remote database tables..."
npx wrangler d1 execute acme-rest-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

echo ""
echo "🔐 Uploading secrets..."

if [ -f private-key.pem ] && [ -f public-key.pem ]; then
    echo "   Uploading PRIVATE_KEY..."
    cat private-key.pem | npx wrangler secret put PRIVATE_KEY
    
    echo "   Uploading PUBLIC_KEY..."
    cat public-key.pem | npx wrangler secret put PUBLIC_KEY
    
    echo "✅ Secrets uploaded"
else
    echo "❌ Error: private-key.pem or public-key.pem not found"
    exit 1
fi

echo ""
echo "🚀 Deploying to Cloudflare Workers..."
npm run deploy

echo ""
echo "✅ Remote setup complete!"
echo ""
echo "Next steps:"
echo "  1. Note your Worker URL from the output above"
echo "  2. Test health:  curl https://acme-rest-api.YOUR-SUBDOMAIN.workers.dev/health"
echo "  3. Monitor logs: wrangler tail"
echo "  4. Seed data:    node scripts/seed-data.js https://YOUR-WORKER-URL"
echo ""
