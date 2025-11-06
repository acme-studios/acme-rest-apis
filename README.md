# Social Media API - Cloudflare API Shield Demo

Enterprise-grade social media REST API demonstrating comprehensive Cloudflare API Shield security features.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Database Migration
```bash
wrangler d1 migrations apply acme-rest-db --remote
```

### 3. Deploy to Cloudflare
```bash
npm run deploy
```

### 4. Test with Postman
1. Import `postman_collection.json` into Postman
2. Update `base_url` variable to your Worker URL
3. Run tests

### 5. Seed Data (Optional)
```bash
node scripts/seed-data.js https://your-worker.workers.dev
```

### 6. Simulate Traffic (Optional)
```bash
node scripts/simulate-traffic.js https://your-worker.workers.dev 30 60
```

## Features

- 15 REST endpoints (4 GET, 5 POST, 4 PUT/PATCH, 2 DELETE)
- JWT authentication with RS256 (custom claims: tier, role)
- 3-tier system (free, premium, enterprise)
- Query string filtering and sorting
- Social media features (posts, likes, comments, follows, shares)
- Tier-based access control


## Testing

- **Postman Collection**: `postman_collection.json`
- **Seed Script**: `scripts/seed-data.js`
- **Traffic Simulator**: `scripts/simulate-traffic.js`

## Local Development

```bash
npm run dev
```

Access at `http://localhost:8787`


## Tech Stack

- **Framework**: Hono
- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Auth**: JWT with RS256
- **Security**: Cloudflare API Shield
