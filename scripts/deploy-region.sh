#!/bin/bash

# Multi-Region Deployment Script
# Usage: ./scripts/deploy-region.sh [region]
# Example: ./scripts/deploy-region.sh namer01

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if region is provided
if [ -z "$1" ]; then
  echo -e "${RED}Error: Region is required${NC}"
  echo "Usage: ./scripts/deploy-region.sh [region]"
  echo "Available regions: namer01, emea01, latam01, apjc01"
  exit 1
fi

REGION=$1

# Validate region
if [[ ! "$REGION" =~ ^(namer01|emea01|latam01|apjc01)$ ]]; then
  echo -e "${RED}Error: Invalid region${NC}"
  echo "Available regions: namer01, emea01, latam01, apjc01"
  exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deploying to region: $REGION${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Set base URL based on region
BASE_URL="https://api-shield.${REGION}.cfpartnerskyflash.com"

echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

# Check if RSA keys exist
if [ ! -f "private-key.pem" ] || [ ! -f "public-key.pem" ]; then
  echo -e "${RED}Error: RSA keys not found!${NC}"
  echo "Please ensure private-key.pem and public-key.pem exist in the project root"
  exit 1
fi

echo -e "${GREEN}✓ RSA keys found${NC}"
echo ""

echo -e "${YELLOW}Step 2: Applying database migrations...${NC}"
wrangler d1 migrations apply acme-rest-db --remote
echo -e "${GREEN}✓ Migrations applied${NC}"
echo ""

echo -e "${YELLOW}Step 3: Uploading secrets...${NC}"

# Read keys and upload as secrets
PRIVATE_KEY=$(cat private-key.pem)
PUBLIC_KEY=$(cat public-key.pem)

echo "$PRIVATE_KEY" | wrangler secret put PRIVATE_KEY
echo "$PUBLIC_KEY" | wrangler secret put PUBLIC_KEY

echo -e "${GREEN}✓ Secrets uploaded${NC}"
echo ""

echo -e "${YELLOW}Step 4: Deploying Worker...${NC}"
wrangler deploy
echo -e "${GREEN}✓ Worker deployed${NC}"
echo ""

echo -e "${YELLOW}Step 5: Verifying deployment...${NC}"
sleep 3

# Test health endpoint
if curl -s -f "$BASE_URL/health" > /dev/null; then
  echo -e "${GREEN}✓ API is reachable at $BASE_URL${NC}"
else
  echo -e "${RED}✗ API health check failed${NC}"
  echo "Please check your deployment manually"
  exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Region: ${YELLOW}$REGION${NC}"
echo -e "API URL: ${YELLOW}$BASE_URL${NC}"
echo -e "Docs URL: ${YELLOW}$BASE_URL${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Seed data:"
echo "   ${GREEN}node scripts/seed-data.js $BASE_URL${NC}"
echo ""
echo "2. Test endpoints:"
echo "   ${GREEN}curl $BASE_URL/health${NC}"
echo ""
echo "3. View docs:"
echo "   ${GREEN}open $BASE_URL${NC}"
echo ""
