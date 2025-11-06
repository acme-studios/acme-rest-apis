/**
 * Seed Data Script for Social Media API
 * 
 * Usage:
 *   node scripts/seed-data.js <worker-url>
 * 
 * Example:
 *   node scripts/seed-data.js https://acme-rest-api.your-subdomain.workers.dev
 */

const BASE_URL = process.argv[2] || 'http://localhost:8787';

// Sample data
const USERS = [
  { name: 'Alice Johnson', email: 'alice@example.com', password: 'SecurePass123!', username: 'alicejohnson', tier: 'free' },
  { name: 'Bob Smith', email: 'bob@example.com', password: 'SecurePass123!', username: 'bobsmith', tier: 'premium' },
  { name: 'Charlie Brown', email: 'charlie@example.com', password: 'SecurePass123!', username: 'charliebrown', tier: 'enterprise' },
  { name: 'Diana Prince', email: 'diana@example.com', password: 'SecurePass123!', username: 'dianaprince', tier: 'premium' },
  { name: 'Eve Wilson', email: 'eve@example.com', password: 'SecurePass123!', username: 'evewilson', tier: 'free' },
  { name: 'Frank Miller', email: 'frank@example.com', password: 'SecurePass123!', username: 'frankmiller', tier: 'enterprise' },
  { name: 'Grace Lee', email: 'grace@example.com', password: 'SecurePass123!', username: 'gracelee', tier: 'premium' },
  { name: 'Henry Davis', email: 'henry@example.com', password: 'SecurePass123!', username: 'henrydavis', tier: 'free' },
];

const POST_TEMPLATES = [
  { content: 'Just launched my new project! Check it out 🚀', visibility: 'public' },
  { content: 'Beautiful sunset today 🌅', visibility: 'public', media_type: 'image' },
  { content: 'Thoughts on the latest tech trends? #tech #innovation', visibility: 'public' },
  { content: 'Coffee and code ☕💻', visibility: 'public' },
  { content: 'Weekend vibes! What are you up to?', visibility: 'public' },
  { content: 'Just finished reading an amazing book 📚', visibility: 'public' },
  { content: 'Workout complete! Feeling great 💪', visibility: 'public' },
  { content: 'Trying out a new recipe tonight 🍝', visibility: 'public' },
  { content: 'Travel plans for next month ✈️', visibility: 'followers_only' },
  { content: 'Personal note to self...', visibility: 'private' },
];

const COMMENTS = [
  'Great post!',
  'Love this! 😍',
  'Thanks for sharing!',
  'Interesting perspective',
  'I totally agree!',
  'This is amazing!',
  'Well said 👏',
  'Can you share more details?',
  'Inspiring!',
  'Keep it up!',
];

// Helper function to make API calls
async function apiCall(endpoint, method = 'GET', body = null, token = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();
    
    if (!response.ok) {
      console.error(`❌ Error: ${response.status}`, data);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`❌ Request failed:`, error.message);
    return null;
  }
}

// Seed functions
async function seedUsers() {
  console.log('\n📝 Creating users...');
  const tokens = [];

  for (const user of USERS) {
    const result = await apiCall('/api/auth/register', 'POST', user);
    if (result && result.token) {
      tokens.push({
        userId: result.user.id,
        username: result.user.username,
        tier: result.user.tier,
        token: result.token,
      });
      console.log(`✅ Created user: ${user.username} (${user.tier})`);
    }
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return tokens;
}

async function seedPosts(tokens) {
  console.log('\n📄 Creating posts...');
  const postIds = [];

  for (const userToken of tokens) {
    // Each user creates 2-4 posts
    const numPosts = Math.floor(Math.random() * 3) + 2;
    
    for (let i = 0; i < numPosts; i++) {
      const template = POST_TEMPLATES[Math.floor(Math.random() * POST_TEMPLATES.length)];
      const result = await apiCall('/api/posts', 'POST', template, userToken.token);
      
      if (result && result.post) {
        postIds.push(result.post.id);
        console.log(`✅ ${userToken.username} created post ${result.post.id}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return postIds;
}

async function seedLikes(tokens, postIds) {
  console.log('\n❤️  Creating likes...');
  
  for (const userToken of tokens) {
    // Each user likes 3-7 random posts
    const numLikes = Math.floor(Math.random() * 5) + 3;
    const postsToLike = [...postIds].sort(() => 0.5 - Math.random()).slice(0, numLikes);
    
    for (const postId of postsToLike) {
      await apiCall(`/api/posts/${postId}/like`, 'POST', null, userToken.token);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ ${userToken.username} liked ${numLikes} posts`);
  }
}

async function seedComments(tokens, postIds) {
  console.log('\n💬 Creating comments...');
  
  for (const userToken of tokens) {
    // Each user comments on 2-4 random posts
    const numComments = Math.floor(Math.random() * 3) + 2;
    const postsToComment = [...postIds].sort(() => 0.5 - Math.random()).slice(0, numComments);
    
    for (const postId of postsToComment) {
      const comment = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];
      await apiCall(`/api/posts/${postId}/comment`, 'POST', { content: comment }, userToken.token);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ ${userToken.username} commented on ${numComments} posts`);
  }
}

async function seedFollows(tokens) {
  console.log('\n👥 Creating follows...');
  
  for (const userToken of tokens) {
    // Each user follows 2-5 other users
    const numFollows = Math.floor(Math.random() * 4) + 2;
    const usersToFollow = tokens
      .filter(t => t.userId !== userToken.userId)
      .sort(() => 0.5 - Math.random())
      .slice(0, numFollows);
    
    for (const targetUser of usersToFollow) {
      await apiCall(`/api/users/${targetUser.userId}/follow`, 'PATCH', null, userToken.token);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ ${userToken.username} followed ${numFollows} users`);
  }
}

async function seedShares(tokens, postIds) {
  console.log('\n🔄 Creating shares (premium users only)...');
  
  const premiumUsers = tokens.filter(t => t.tier === 'premium' || t.tier === 'enterprise');
  
  for (const userToken of premiumUsers) {
    // Each premium user shares 1-3 posts
    const numShares = Math.floor(Math.random() * 3) + 1;
    const postsToShare = [...postIds].sort(() => 0.5 - Math.random()).slice(0, numShares);
    
    for (const postId of postsToShare) {
      await apiCall(`/api/posts/${postId}/share`, 'PATCH', null, userToken.token);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ ${userToken.username} shared ${numShares} posts`);
  }
}

// Main execution
async function main() {
  console.log('🌱 Starting seed data generation...');
  console.log(`📍 Target: ${BASE_URL}\n`);

  try {
    // Check if API is reachable
    const health = await apiCall('/health');
    if (!health) {
      console.error('❌ API is not reachable. Please check the URL and try again.');
      process.exit(1);
    }
    console.log('✅ API is reachable\n');

    // Seed data in order
    const tokens = await seedUsers();
    if (tokens.length === 0) {
      console.error('❌ Failed to create users. Exiting.');
      process.exit(1);
    }

    const postIds = await seedPosts(tokens);
    await seedLikes(tokens, postIds);
    await seedComments(tokens, postIds);
    await seedFollows(tokens);
    await seedShares(tokens, postIds);

    console.log('\n✅ Seed data generation complete!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Users: ${tokens.length}`);
    console.log(`   - Posts: ${postIds.length}`);
    console.log(`   - Likes, comments, follows, and shares created`);
    console.log('\n🎉 Your API is now populated with sample data!');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

main();
