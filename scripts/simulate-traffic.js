/**
 * Traffic Simulation Script for Social Media API
 * 
 * Simulates realistic user activity to generate metrics for dashboard
 * 
 * Usage:
 *   node scripts/simulate-traffic.js <worker-url> [interval-seconds] [duration-minutes]
 * 
 * Examples:
 *   node scripts/simulate-traffic.js https://acme-rest-api.your-subdomain.workers.dev
 *   node scripts/simulate-traffic.js https://acme-rest-api.your-subdomain.workers.dev 30 60
 *   (runs for 60 minutes, activity every 30 seconds)
 */

const BASE_URL = process.argv[2] || 'http://localhost:8787';
const INTERVAL_SECONDS = parseInt(process.argv[3]) || 60; // Default: every 60 seconds
const DURATION_MINUTES = parseInt(process.argv[4]) || 0; // Default: run indefinitely

// Test users (must exist in database)
const TEST_USERS = [
  { email: 'alice@example.com', password: 'SecurePass123!' },
  { email: 'bob@example.com', password: 'SecurePass123!' },
  { email: 'charlie@example.com', password: 'SecurePass123!' },
];

// Random content generators
const POST_CONTENT = [
  'Just had an amazing coffee ☕',
  'Working on something exciting! 🚀',
  'Beautiful day outside 🌞',
  'Thoughts on the latest tech news?',
  'Weekend plans anyone?',
  'Just finished a great workout 💪',
  'Trying out a new recipe tonight',
  'Reading an interesting book 📚',
  'Travel plans coming together ✈️',
  'Productive day at work!',
  'Learning something new every day',
  'Grateful for good friends 🙏',
  'Music recommendations anyone? 🎵',
  'Movie night! 🍿',
  'Coding session in progress 💻',
];

const COMMENTS = [
  'Great post!',
  'Love this!',
  'Thanks for sharing',
  'Interesting!',
  'I agree!',
  'Amazing!',
  'Well said',
  'Tell me more!',
  'Inspiring',
  'Keep it up!',
];

// Helper function
async function apiCall(endpoint, method = 'GET', body = null, token = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (token) options.headers['Authorization'] = `Bearer ${token}`;
  if (body) options.body = JSON.stringify(body);

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();
    return response.ok ? data : null;
  } catch (error) {
    return null;
  }
}

// Login users and get tokens
async function loginUsers() {
  console.log('🔐 Logging in test users...');
  const tokens = [];

  for (const user of TEST_USERS) {
    const result = await apiCall('/api/auth/login', 'POST', user);
    if (result && result.token) {
      tokens.push({
        email: user.email,
        token: result.token,
        userId: result.user.id,
        tier: result.user.tier,
      });
      console.log(`✅ Logged in: ${user.email} (${result.user.tier})`);
    }
  }

  return tokens;
}

// Get random posts
async function getRandomPosts() {
  const result = await apiCall('/api/posts?limit=20&sort=recent');
  return result && result.posts ? result.posts.map(p => p.id) : [];
}

// Simulate activity
async function simulateActivity(tokens, postIds) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`\n⏰ ${timestamp} - Simulating activity...`);

  // Random user performs random action
  const user = tokens[Math.floor(Math.random() * tokens.length)];
  const action = Math.floor(Math.random() * 100);

  try {
    if (action < 30) {
      // 30% chance: Create a post
      const content = POST_CONTENT[Math.floor(Math.random() * POST_CONTENT.length)];
      const result = await apiCall('/api/posts', 'POST', { content, visibility: 'public' }, user.token);
      if (result) {
        console.log(`📝 ${user.email} created a post`);
        postIds.push(result.post.id);
      }

    } else if (action < 55 && postIds.length > 0) {
      // 25% chance: Like a post
      const postId = postIds[Math.floor(Math.random() * postIds.length)];
      await apiCall(`/api/posts/${postId}/like`, 'POST', null, user.token);
      console.log(`❤️  ${user.email} liked post ${postId}`);

    } else if (action < 75 && postIds.length > 0) {
      // 20% chance: Comment on a post
      const postId = postIds[Math.floor(Math.random() * postIds.length)];
      const comment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];
      await apiCall(`/api/posts/${postId}/comment`, 'POST', { content: comment }, user.token);
      console.log(`💬 ${user.email} commented on post ${postId}`);

    } else if (action < 85) {
      // 10% chance: Follow another user
      const targetUser = tokens.filter(t => t.userId !== user.userId)[Math.floor(Math.random() * (tokens.length - 1))];
      await apiCall(`/api/users/${targetUser.userId}/follow`, 'PATCH', null, user.token);
      console.log(`👥 ${user.email} followed ${targetUser.email}`);

    } else if (action < 95 && (user.tier === 'premium' || user.tier === 'enterprise') && postIds.length > 0) {
      // 10% chance: Share a post (premium only)
      const postId = postIds[Math.floor(Math.random() * postIds.length)];
      await apiCall(`/api/posts/${postId}/share`, 'PATCH', null, user.token);
      console.log(`🔄 ${user.email} shared post ${postId}`);

    } else {
      // 5% chance: View posts (GET request)
      const sort = ['recent', 'popular', 'trending'][Math.floor(Math.random() * 3)];
      await apiCall(`/api/posts?sort=${sort}&limit=10`);
      console.log(`👀 ${user.email} browsed ${sort} posts`);
    }

  } catch (error) {
    console.error(`❌ Error during activity:`, error.message);
  }
}

// Main loop
async function main() {
  console.log('🎬 Traffic Simulation Starting...');
  console.log(`📍 Target: ${BASE_URL}`);
  console.log(`⏱️  Interval: ${INTERVAL_SECONDS} seconds`);
  console.log(`⏰ Duration: ${DURATION_MINUTES > 0 ? DURATION_MINUTES + ' minutes' : 'Indefinite (Ctrl+C to stop)'}\n`);

  // Login users
  const tokens = await loginUsers();
  if (tokens.length === 0) {
    console.error('❌ No users logged in. Make sure test users exist.');
    process.exit(1);
  }

  // Get initial posts
  let postIds = await getRandomPosts();
  console.log(`📊 Found ${postIds.length} existing posts\n`);

  // Calculate end time
  const startTime = Date.now();
  const endTime = DURATION_MINUTES > 0 ? startTime + (DURATION_MINUTES * 60 * 1000) : null;

  let activityCount = 0;

  // Run simulation
  const intervalId = setInterval(async () => {
    // Check if we should stop
    if (endTime && Date.now() >= endTime) {
      clearInterval(intervalId);
      console.log('\n✅ Simulation complete!');
      console.log(`📊 Total activities: ${activityCount}`);
      process.exit(0);
    }

    // Simulate activity
    await simulateActivity(tokens, postIds);
    activityCount++;

    // Refresh post list every 10 activities
    if (activityCount % 10 === 0) {
      postIds = await getRandomPosts();
    }

  }, INTERVAL_SECONDS * 1000);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    console.log('\n\n⏹️  Simulation stopped by user');
    console.log(`📊 Total activities: ${activityCount}`);
    process.exit(0);
  });
}

main();
