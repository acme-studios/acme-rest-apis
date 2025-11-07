# Scripts for Testing & Data Generation

## Overview

These scripts help you set up, populate, and test your API with data and realistic traffic.

## Prerequisites

- Node.js installed (v18+)
- Wrangler CLI installed
- RSA keys (`private-key.pem`, `public-key.pem`) in project root

## Scripts

### 1. Setup Scripts

#### `setup-local.sh` - Local Development Setup
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

After running:
```bash
npm run dev
```

---

#### `setup-remote.sh` - Remote Deployment
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

### 2. Seed Data (`seed-data.js`)

Populates your database with initial test data.

**What it creates:**
- 8 test users (mix of free, premium, enterprise tiers)
- 20-30 posts with various visibility settings
- Likes, comments, follows, and shares
- Realistic social graph

**Usage:**
```bash
# Remote deployment
node scripts/seed-data.js https://api-shield.namer01.cfpartnerskyflash.com

# Local development
node scripts/seed-data.js http://localhost:8787
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

---

### 3. Traffic Simulation (`simulate-traffic.js`)

Simulates realistic user activity.

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
node scripts/simulate-traffic.js https://api-shield.namer01.cfpartnerskyflash.com

# Activity every 30 seconds
node scripts/simulate-traffic.js https://api-shield.namer01.cfpartnerskyflash.com 30

# Run for 60 minutes, activity every 30 seconds
node scripts/simulate-traffic.js https://api-shield.namer01.cfpartnerskyflash.com 30 60

# Local development
node scripts/simulate-traffic.js http://localhost:8787 10
```

**Parameters:**
1. `worker-url` - Your Worker URL (required)
2. `interval-seconds` - Seconds between activities (default: 60)
3. `duration-minutes` - How long to run (default: indefinite)

**Stop Simulation:**
Press `Ctrl+C` to stop gracefully.

---

## Workflow

### Initial Setup - Local
```bash
# 1. Run setup script
./scripts/setup-local.sh

# 2. Start dev server
npm run dev

# 3. Seed data
node scripts/seed-data.js http://localhost:8787
```

### Initial Setup - Remote
```bash
# 1. Run setup script
./scripts/setup-remote.sh

# 2. Seed data
node scripts/seed-data.js https://api-shield.namer01.cfpartnerskyflash.com
```

### Generate Traffic
```bash
# Run for 2 hours (activity every 30 seconds)
node scripts/simulate-traffic.js https://api-shield.namer01.cfpartnerskyflash.com 30 120
```

---

## Scheduled Traffic with Cloudflare Workers Cron

You can schedule traffic simulation directly in your Worker using Cloudflare's cron triggers.

### Add Cron Trigger to wrangler.jsonc

```jsonc
{
  "name": "api-shield",
  // ... other config ...
  "triggers": {
    "crons": ["0 * * * *"]  // Run every hour
  }
}
```

### Create Cron Handler in src/index.ts

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Your existing API handler
    return app.fetch(request, env);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Simulate traffic on cron schedule
    console.log('Cron trigger fired:', new Date(event.scheduledTime).toISOString());
    
    // Example: Create a post from a random user
    try {
      const users = await env.DB.prepare('SELECT * FROM users LIMIT 5').all();
      if (users.results.length > 0) {
        const randomUser = users.results[Math.floor(Math.random() * users.results.length)];
        await env.DB.prepare(
          'INSERT INTO posts (user_id, content, visibility) VALUES (?, ?, ?)'
        ).bind(randomUser.id, `Automated post at ${new Date().toISOString()}`, 'public').run();
        console.log(`Created post for user ${randomUser.id}`);
      }
    } catch (error) {
      console.error('Cron job error:', error);
    }
  }
};
```

### Cron Schedule Examples

```jsonc
// Every hour
"crons": ["0 * * * *"]

// Every 30 minutes
"crons": ["*/30 * * * *"]

// Every day at midnight UTC
"crons": ["0 0 * * *"]

// Multiple schedules
"crons": ["0 */6 * * *", "0 0 * * *"]
```

### Deploy with Cron
```bash
wrangler deploy
```

### View Cron Logs
```bash
wrangler tail
```

---

## Use Cases

### Demo Preparation
```bash
# Populate with realistic data
node scripts/seed-data.js https://api-shield.namer01.cfpartnerskyflash.com

# Run traffic for 30 minutes
node scripts/simulate-traffic.js https://api-shield.namer01.cfpartnerskyflash.com 60 30
```

### Continuous Background Activity
```bash
# Run indefinitely in background (Linux/Mac)
nohup node scripts/simulate-traffic.js https://api-shield.namer01.cfpartnerskyflash.com 120 > traffic.log 2>&1 &

# Check logs
tail -f traffic.log

# Stop
pkill -f simulate-traffic
```

---

## Troubleshooting

### "API is not reachable"
- Check Worker URL is correct
- Ensure Worker is deployed: `wrangler deploy`
- Test manually: `curl https://api-shield.namer01.cfpartnerskyflash.com/health`

### "No users logged in"
- Run seed script first: `node scripts/seed-data.js <url>`
- Check database has users: `wrangler d1 execute acme-rest-db --remote --command "SELECT * FROM users;"`

### Script Stops Unexpectedly
- Check Worker logs: `wrangler tail`
- Look for errors in console output
- Verify database isn't full (D1 limits)

---

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
node scripts/seed-data.js https://api-shield.namer01.cfpartnerskyflash.com
```

---

## Tips

1. **Start Small**: Run seed script once, then short traffic bursts
2. **Vary Intervals**: Mix fast (5s) and slow (120s) traffic for realistic patterns
3. **Use Logs**: `wrangler tail` to see real-time Worker logs
4. **Clean Data**: Delete and re-seed if data gets messy
5. **Cron Jobs**: Use Cloudflare Workers cron triggers for automated traffic
