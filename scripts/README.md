# Scripts for Testing & Data Generation

## Overview

These scripts help you set up, populate, and test your API with data and realistic traffic.

## Prerequisites

- Node.js installed (v18+)
- Wrangler CLI installed
- RSA keys (`private-key.pem`, `public-key.pem`) in project root

## Scripts

### 0. Setup Scripts (New!)

#### `setup-local.sh` - One-command local setup
Automates the entire local development setup process.

**What it does:**
- Creates `.dev.vars` with your RSA keys
- Installs dependencies
- Applies migrations to local database
- Verifies database tables

**Usage:**
```bash
./scripts/setup-local.sh
```

After running, just do:
```bash
npm run dev
```

---

#### `setup-remote.sh` - One-command remote deployment
Automates the entire remote deployment process.

**What it does:**
- Applies migrations to remote database
- Uploads secrets (PRIVATE_KEY, PUBLIC_KEY)
- Deploys Worker to Cloudflare
- Verifies deployment

**Usage:**
```bash
./scripts/setup-remote.sh
```

---

### 1. Seed Data (`seed-data.js`)

Populates your database with initial test data.

**What it creates:**
- 8 test users (mix of free, premium, enterprise tiers)
- 20-30 posts with various visibility settings
- Likes, comments, follows, and shares
- Realistic social graph

**Usage:**
```bash
# Basic usage
node scripts/seed-data.js https://your-worker.workers.dev

# Local development
node scripts/seed-data.js http://localhost:8787
```

**Output:**
```
🌱 Starting seed data generation...
📍 Target: https://your-worker.workers.dev

✅ API is reachable

📝 Creating users...
✅ Created user: alicejohnson (free)
✅ Created user: bobsmith (premium)
...

📄 Creating posts...
✅ alicejohnson created post 1
✅ bobsmith created post 2
...

❤️  Creating likes...
✅ alicejohnson liked 5 posts
...

💬 Creating comments...
✅ bobsmith commented on 3 posts
...

👥 Creating follows...
✅ charliebrown followed 4 users
...

🔄 Creating shares (premium users only)...
✅ bobsmith shared 2 posts
...

✅ Seed data generation complete!

📊 Summary:
   - Users: 8
   - Posts: 24
   - Likes, comments, follows, and shares created

🎉 Your API is now populated with sample data!
```

**Test Users Created:**

| Email | Password | Username | Tier |
|-------|----------|----------|------|
| alice@example.com | SecurePass123! | alicejohnson | free |
| bob@example.com | SecurePass123! | bobsmith | premium |
| charlie@example.com | SecurePass123! | charliebrown | enterprise |
| diana@example.com | SecurePass123! | dianaprince | premium |
| eve@example.com | SecurePass123! | evewilson | free |
| frank@example.com | SecurePass123! | frankmiller | enterprise |
| grace@example.com | SecurePass123! | gracelee | premium |
| henry@example.com | SecurePass123! | henrydavis | free |

### 2. Traffic Simulation (`simulate-traffic.js`)

Simulates realistic user activity to generate metrics for Cloudflare dashboard.

**What it does:**
- Logs in test users
- Randomly performs actions:
  - 30% Create posts
  - 25% Like posts
  - 20% Comment on posts
  - 10% Follow users
  - 10% Share posts (premium only)
  - 5% Browse posts
- Runs continuously or for specified duration

**Usage:**
```bash
# Run indefinitely (Ctrl+C to stop)
node scripts/simulate-traffic.js https://your-worker.workers.dev

# Activity every 30 seconds
node scripts/simulate-traffic.js https://your-worker.workers.dev 30

# Run for 60 minutes, activity every 30 seconds
node scripts/simulate-traffic.js https://your-worker.workers.dev 30 60

# Local development
node scripts/simulate-traffic.js http://localhost:8787 10
```

**Parameters:**
1. `worker-url` - Your Worker URL (required)
2. `interval-seconds` - Seconds between activities (default: 60)
3. `duration-minutes` - How long to run (default: indefinite)

**Output:**
```
🎬 Traffic Simulation Starting...
📍 Target: https://your-worker.workers.dev
⏱️  Interval: 30 seconds
⏰ Duration: 60 minutes

🔐 Logging in test users...
✅ Logged in: alice@example.com (free)
✅ Logged in: bob@example.com (premium)
✅ Logged in: charlie@example.com (enterprise)

📊 Found 24 existing posts

⏰ 12:30:15 PM - Simulating activity...
📝 alice@example.com created a post

⏰ 12:30:45 PM - Simulating activity...
❤️  bob@example.com liked post 5

⏰ 12:31:15 PM - Simulating activity...
💬 charlie@example.com commented on post 12

⏰ 12:31:45 PM - Simulating activity...
👥 alice@example.com followed bob@example.com

⏰ 12:32:15 PM - Simulating activity...
🔄 bob@example.com shared post 8
```

**Stop Simulation:**
Press `Ctrl+C` to stop gracefully.

## Workflow

### Initial Setup
```bash
# 1. Deploy your API
npm run deploy

# 2. Run migrations
wrangler d1 migrations apply acme-rest-db --remote

# 3. Seed initial data
node scripts/seed-data.js https://your-worker.workers.dev
```

### Generate Dashboard Metrics
```bash
# Run traffic simulation for 2 hours (activity every 30 seconds)
node scripts/simulate-traffic.js https://your-worker.workers.dev 30 120
```

### Testing Rate Limiting
```bash
# High-frequency traffic (every 5 seconds) to test rate limits
node scripts/simulate-traffic.js https://your-worker.workers.dev 5 10
```

## Use Cases

### 1. Demo Preparation
```bash
# Populate with realistic data
node scripts/seed-data.js https://your-worker.workers.dev

# Let it run for 30 minutes before demo
node scripts/simulate-traffic.js https://your-worker.workers.dev 60 30
```

### 2. Load Testing
```bash
# Aggressive traffic to test rate limiting
node scripts/simulate-traffic.js https://your-worker.workers.dev 2 5
```

### 3. Dashboard Metrics
```bash
# Run overnight to generate rich analytics
node scripts/simulate-traffic.js https://your-worker.workers.dev 45 480
```

### 4. Continuous Background Activity
```bash
# Run indefinitely in background (Linux/Mac)
nohup node scripts/simulate-traffic.js https://your-worker.workers.dev 120 > traffic.log 2>&1 &

# Check logs
tail -f traffic.log

# Stop
pkill -f simulate-traffic
```

## Advanced: Scheduled Traffic with Cron

### Linux/Mac Cron
```bash
# Edit crontab
crontab -e

# Add entry to run every hour
0 * * * * cd /path/to/api-shield && node scripts/simulate-traffic.js https://your-worker.workers.dev 30 5

# Or every 30 minutes
*/30 * * * * cd /path/to/api-shield && node scripts/simulate-traffic.js https://your-worker.workers.dev 20 3
```

### GitHub Actions (Scheduled Workflow)
```yaml
# .github/workflows/simulate-traffic.yml
name: Simulate API Traffic

on:
  schedule:
    - cron: '0 * * * *'  # Every hour
  workflow_dispatch:  # Manual trigger

jobs:
  simulate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: node scripts/simulate-traffic.js ${{ secrets.WORKER_URL }} 30 5
```

## Monitoring Dashboard Metrics

After running traffic simulation, check:

### Cloudflare Dashboard
1. **Workers & Pages** → Your Worker → **Metrics**
   - Requests per second
   - Success rate
   - CPU time
   - Duration

2. **Security** → **API Shield** → **Analytics**
   - JWT validation success/failure
   - Rate limit hits
   - Schema validation errors

3. **Analytics** → **Traffic**
   - Geographic distribution
   - Status codes
   - Top endpoints

## Troubleshooting

### "API is not reachable"
- Check Worker URL is correct
- Ensure Worker is deployed: `wrangler deploy`
- Test manually: `curl https://your-worker.workers.dev/health`

### "No users logged in"
- Run seed script first: `node scripts/seed-data.js <url>`
- Check database has users: `wrangler d1 execute acme-rest-db --remote --command "SELECT * FROM users;"`

### Rate Limiting Errors
- Expected behavior! Shows rate limiting is working
- Adjust interval: use higher seconds between activities
- Check tier limits in code

### Script Stops Unexpectedly
- Check Worker logs: `wrangler tail`
- Look for errors in console output
- Verify database isn't full (D1 limits)

## Tips

1. **Start Small**: Run seed script once, then short traffic bursts
2. **Monitor Costs**: Check Cloudflare usage to stay within free tier
3. **Vary Intervals**: Mix fast (5s) and slow (120s) traffic for realistic patterns
4. **Use Logs**: `wrangler tail` to see real-time Worker logs
5. **Clean Data**: Delete and re-seed if data gets messy

## Clean Up

### Reset Database
```bash
# Drop all data
wrangler d1 execute acme-rest-db --remote --command "
  DELETE FROM shares;
  DELETE FROM follows;
  DELETE FROM likes;
  DELETE FROM comments;
  DELETE FROM posts;
  DELETE FROM users;
"

# Re-seed
node scripts/seed-data.js https://your-worker.workers.dev
```

## Next Steps

1. Run seed script to populate data
2. Test endpoints manually with Postman
3. Start traffic simulation
4. Monitor Cloudflare dashboard
5. Configure API Shield features
6. Test rate limiting with high-frequency traffic
