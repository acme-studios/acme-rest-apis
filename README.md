# Social Media API

A REST API for social media interactions with JWT authentication and role-based access control.

## Quick Start

### Local Development

```bash
# One-command setup
./scripts/setup-local.sh

# Start dev server
npm run dev
```

**Access:**
- API Documentation: `http://localhost:8787`
- API Endpoints: `http://localhost:8787/api/*`
- Health Check: `http://localhost:8787/health`

### Production Deployment

```bash
# One-command deployment
./scripts/setup-remote.sh
```

**Access:**
- API Documentation: `https://acme-rest-api.YOUR-SUBDOMAIN.workers.dev`
- API Endpoints: `https://acme-rest-api.YOUR-SUBDOMAIN.workers.dev/api/*`

## API Documentation

Interactive API documentation powered by Stoplight Elements:
- Beautiful light and dark themes
- Try endpoints directly from docs
- Copy-paste code examples
- Real-time request/response testing
- Comprehensive endpoint reference

View locally: `http://localhost:8787` after running `npm run dev`

## Testing

### Postman Collections

Two collections for different testing scenarios:

**`postman_collection.json`** - Manual testing
- Simulates real-world usage
- Shows validation and security features
- Use for demos and manual testing

**`postman_collection_automated.json`** - Automated testing
- Auto-generates unique users each run
- All tests pass without database cleanup
- Use for CI/CD and repeated testing

**Setup:**
1. Import collection into Postman
2. Update `base_url` variable:
   - Local: `http://localhost:8787`
   - Remote: `https://your-worker.workers.dev`
3. Run collection

### Seed Data

Populate database with test users and content:

```bash
# Local
node scripts/seed-data.js http://localhost:8787

# Remote
node scripts/seed-data.js https://your-worker.workers.dev
```

Creates 8 users (free, premium, enterprise tiers) with posts, likes, comments, and follows.

### Traffic Simulation

Generate realistic API traffic for dashboard metrics:

```bash
# Run for 30 minutes, activity every 30 seconds
node scripts/simulate-traffic.js https://your-worker.workers.dev 30 30

# Run indefinitely (Ctrl+C to stop)
node scripts/simulate-traffic.js https://your-worker.workers.dev
```

## Features

- 15 REST endpoints (4 GET, 5 POST, 4 PUT/PATCH, 2 DELETE)
- JWT authentication with RS256 (custom claims: tier, role)
- 3-tier system (free, premium, enterprise)
- Query string filtering and sorting
- Social media features (posts, likes, comments, follows, shares)
- Tier-based access control


## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Register user with tier |
| POST | `/api/auth/login` | No | Login and get JWT |
| GET | `/api/posts` | No | List posts (filtering, sorting) |
| GET | `/api/posts/:id` | No | Get single post |
| GET | `/api/users/:id/profile` | No | Get user profile |
| GET | `/api/users/:id/followers` | No | Get followers/following |
| POST | `/api/posts` | Yes | Create post |
| POST | `/api/posts/:id/like` | Yes | Like post |
| POST | `/api/posts/:id/comment` | Yes | Comment on post |
| PUT | `/api/posts/:id` | Yes | Update post |
| PATCH | `/api/users/profile` | Yes | Update profile |
| PATCH | `/api/users/:id/follow` | Yes | Follow/unfollow user |
| PATCH | `/api/posts/:id/share` | Yes (Premium+) | Share post |
| DELETE | `/api/posts/:id` | Yes | Delete post |
| DELETE | `/api/users/account` | Yes | Delete account |

## Monitoring

```bash
# View real-time logs
wrangler tail

# Query database
wrangler d1 execute acme-rest-db --remote --command "SELECT COUNT(*) FROM users;"
```

## Tech Stack

- Hono web framework on Cloudflare Workers
- Cloudflare D1 (SQLite) database
- JWT authentication with RS256
- bcrypt password hashing
- Cloudflare API Shield integration
