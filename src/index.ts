import { Hono } from 'hono'
import { Context } from 'hono'
import bcrypt from 'bcryptjs'
import jwtLib from 'jsonwebtoken'
import { authMiddleware, requireTier, UserClaims } from './middleware/authMiddleware'
import jwks from '../jwks.json'

// Enhanced Hono app with proper type bindings
type Bindings = {
  DB: D1Database
  PRIVATE_KEY: string
  PUBLIC_KEY: string
  ASSETS: Fetcher
}

type Variables = {
  user: UserClaims
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ============================================
// PUBLIC ENDPOINTS
// ============================================

// JWKS endpoint for Cloudflare API Shield JWT Validation
app.get('/.well-known/jwks.json', (c) => {
  return c.json(jwks)
})

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

// POST /api/auth/register - User registration with tier assignment
app.post('/api/auth/register', async (c: Context) => {
  try {
    const { name, email, password, username, tier } = await c.req.json()

    // Validation
    if (!name || !email || !password) {
      return c.json({ error: 'Name, email, and password are required.' }, 400)
    }

    if (password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters long.' }, 400)
    }

    // Check if user already exists
    const existing = await c.env.DB.prepare(
      `SELECT id FROM users WHERE email = ? OR username = ?`
    ).bind(email, username || '').all()
    
    if (existing.results.length > 0) {
      return c.json({ error: 'User with this email or username already exists.' }, 409)
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 12)

    // Determine tier (default to free, allow setting during registration for demo purposes)
    const userTier = tier && ['free', 'premium', 'enterprise'].includes(tier) ? tier : 'free'

    // Insert user
    const result = await c.env.DB.prepare(`
      INSERT INTO users (name, email, password, username, tier, role)
      VALUES (?, ?, ?, ?, ?, 'user')
    `).bind(name, email, hashed, username || null, userTier).run()

    const userId = result.meta.last_row_id as number

    // Generate JWT with enhanced claims
    const token = jwtLib.sign(
      { 
        userId, 
        email,
        tier: userTier,
        role: 'user',
        username: username || null
      },
      c.env.PRIVATE_KEY,
      {
        algorithm: 'RS256',
        keyid: 'acme-namer01-kid',
        expiresIn: '24h'
      }
    )

    return c.json({ 
      token, 
      user: {
        id: userId,
        name,
        email,
        username,
        tier: userTier,
        role: 'user'
      },
      message: 'User registered successfully.' 
    }, 201)
  } catch (err: any) {
    console.error('Register error:', err)
    return c.json({ error: 'Registration failed.', details: err.message }, 500)
  }
})

// POST /api/auth/login - User login with tier info in JWT
app.post('/api/auth/login', async (c: Context) => {
  try {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      return c.json({ error: 'Email and password are required.' }, 400)
    }

    // Fetch user with tier and role
    const { results } = await c.env.DB.prepare(`
      SELECT id, email, password, username, tier, role, name 
      FROM users 
      WHERE email = ?
    `).bind(email).all()

    if (results.length === 0) {
      return c.json({ error: 'Invalid email or password.' }, 401)
    }

    const user = results[0] as { 
      id: number
      email: string
      password: string
      username: string | null
      tier: string
      role: string
      name: string
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return c.json({ error: 'Invalid email or password.' }, 401)
    }

    // Generate JWT with tier and role claims
    const token = jwtLib.sign(
      { 
        userId: user.id, 
        email: user.email,
        tier: user.tier,
        role: user.role,
        username: user.username
      },
      c.env.PRIVATE_KEY,
      {
        algorithm: 'RS256',
        keyid: 'acme-namer01-kid',
        expiresIn: '24h'
      }
    )

    return c.json({ 
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        tier: user.tier,
        role: user.role
      },
      message: 'Login successful.' 
    })
  } catch (err: any) {
    console.error('Login error:', err)
    return c.json({ error: 'Login failed.', details: err.message }, 500)
  }
})

// ============================================
// POST ENDPOINTS (Social Media Content Creation)
// ============================================

// POST /api/posts - Create a new post (tier-limited: free=5/min, premium=15/min, enterprise=100/min)
app.post('/api/posts', authMiddleware, async (c: Context) => {
  try {
    const { content, media_url, media_type, visibility } = await c.req.json()
    const user = c.get('user')

    // Validation
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return c.json({ error: 'Post content is required.' }, 400)
    }

    if (content.length > 5000) {
      return c.json({ error: 'Post content must be less than 5000 characters.' }, 400)
    }

    // Validate visibility
    const validVisibility = ['public', 'private', 'followers_only']
    const postVisibility = visibility && validVisibility.includes(visibility) ? visibility : 'public'

    // Validate media type if provided
    if (media_type && !['image', 'video', 'gif'].includes(media_type)) {
      return c.json({ error: 'Invalid media type. Must be: image, video, or gif.' }, 400)
    }

    // Insert post
    const result = await c.env.DB.prepare(`
      INSERT INTO posts (user_id, content, media_url, media_type, visibility)
      VALUES (?, ?, ?, ?, ?)
    `).bind(user.userId, content, media_url || null, media_type || null, postVisibility).run()

    // Update user's post count
    await c.env.DB.prepare(`
      UPDATE users SET posts_count = posts_count + 1 WHERE id = ?
    `).bind(user.userId).run()

    return c.json({
      message: 'Post created successfully.',
      post: {
        id: result.meta.last_row_id,
        content,
        media_url,
        media_type,
        visibility: postVisibility,
        created_at: new Date().toISOString()
      }
    }, 201)
  } catch (err: any) {
    console.error('Create post error:', err)
    return c.json({ error: 'Failed to create post.', details: err.message }, 500)
  }
})

// POST /api/posts/:id/like - Like a post
app.post('/api/posts/:id/like', authMiddleware, async (c: Context) => {
  try {
    const postId = Number(c.req.param('id'))
    const user = c.get('user')

    if (isNaN(postId)) {
      return c.json({ error: 'Invalid post ID.' }, 400)
    }

    // Check if post exists
    const { results: postResults } = await c.env.DB.prepare(
      `SELECT id FROM posts WHERE id = ?`
    ).bind(postId).all()

    if (postResults.length === 0) {
      return c.json({ error: 'Post not found.' }, 404)
    }

    // Check if already liked
    const { results: likeResults } = await c.env.DB.prepare(
      `SELECT id FROM likes WHERE post_id = ? AND user_id = ?`
    ).bind(postId, user.userId).all()

    if (likeResults.length > 0) {
      return c.json({ error: 'You have already liked this post.' }, 409)
    }

    // Add like
    await c.env.DB.prepare(`
      INSERT INTO likes (post_id, user_id) VALUES (?, ?)
    `).bind(postId, user.userId).run()

    // Update likes count
    await c.env.DB.prepare(`
      UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?
    `).bind(postId).run()

    return c.json({ message: 'Post liked successfully.' }, 201)
  } catch (err: any) {
    console.error('Like post error:', err)
    return c.json({ error: 'Failed to like post.', details: err.message }, 500)
  }
})

// POST /api/posts/:id/comment - Comment on a post
app.post('/api/posts/:id/comment', authMiddleware, async (c: Context) => {
  try {
    const postId = Number(c.req.param('id'))
    const { content, parent_comment_id } = await c.req.json()
    const user = c.get('user')

    if (isNaN(postId)) {
      return c.json({ error: 'Invalid post ID.' }, 400)
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return c.json({ error: 'Comment content is required.' }, 400)
    }

    if (content.length > 1000) {
      return c.json({ error: 'Comment must be less than 1000 characters.' }, 400)
    }

    // Check if post exists
    const { results: postResults } = await c.env.DB.prepare(
      `SELECT id FROM posts WHERE id = ?`
    ).bind(postId).all()

    if (postResults.length === 0) {
      return c.json({ error: 'Post not found.' }, 404)
    }

    // If replying to a comment, verify it exists
    if (parent_comment_id) {
      const { results: parentResults } = await c.env.DB.prepare(
        `SELECT id FROM comments WHERE id = ? AND post_id = ?`
      ).bind(parent_comment_id, postId).all()

      if (parentResults.length === 0) {
        return c.json({ error: 'Parent comment not found.' }, 404)
      }
    }

    // Insert comment
    const result = await c.env.DB.prepare(`
      INSERT INTO comments (post_id, user_id, content, parent_comment_id)
      VALUES (?, ?, ?, ?)
    `).bind(postId, user.userId, content, parent_comment_id || null).run()

    // Update comments count
    await c.env.DB.prepare(`
      UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?
    `).bind(postId).run()

    return c.json({
      message: 'Comment added successfully.',
      comment: {
        id: result.meta.last_row_id,
        content,
        parent_comment_id,
        created_at: new Date().toISOString()
      }
    }, 201)
  } catch (err: any) {
    console.error('Comment post error:', err)
    return c.json({ error: 'Failed to add comment.', details: err.message }, 500)
  }
})

// ============================================
// GET ENDPOINTS (Data Retrieval with Filtering)
// ============================================

// GET /api/posts - List posts with filtering and sorting
app.get('/api/posts', async (c: Context) => {
  try {
    // Query parameters for filtering/sorting
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)
    const offset = parseInt(c.req.query('offset') || '0')
    const sort = c.req.query('sort') || 'recent' // recent, popular, trending
    const visibility = c.req.query('visibility') || 'public'
    const userId = c.req.query('user_id')

    // Build query based on filters
    let query = `
      SELECT 
        p.id, p.content, p.media_url, p.media_type, p.visibility,
        p.likes_count, p.comments_count, p.shares_count, p.created_at,
        u.id as user_id, u.name as user_name, u.username, u.avatar_url
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.visibility = ?
    `
    const bindings: any[] = [visibility]

    // Filter by user if specified
    if (userId) {
      query += ` AND p.user_id = ?`
      bindings.push(parseInt(userId))
    }

    // Sorting
    if (sort === 'popular') {
      query += ` ORDER BY p.likes_count DESC, p.created_at DESC`
    } else if (sort === 'trending') {
      query += ` ORDER BY (p.likes_count + p.comments_count + p.shares_count) DESC, p.created_at DESC`
    } else {
      query += ` ORDER BY p.created_at DESC`
    }

    query += ` LIMIT ? OFFSET ?`
    bindings.push(limit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...bindings).all()

    return c.json({
      posts: results,
      pagination: {
        limit,
        offset,
        count: results.length
      }
    })
  } catch (err: any) {
    console.error('Fetch posts error:', err)
    return c.json({ error: 'Failed to fetch posts.', details: err.message }, 500)
  }
})

// GET /api/posts/:id - Get single post with comments
app.get('/api/posts/:id', async (c: Context) => {
  try {
    const postId = Number(c.req.param('id'))
    if (isNaN(postId)) return c.json({ error: 'Invalid post ID.' }, 400)

    // Fetch post with user info
    const { results: postResults } = await c.env.DB.prepare(`
      SELECT 
        p.id, p.content, p.media_url, p.media_type, p.visibility,
        p.likes_count, p.comments_count, p.shares_count, p.created_at,
        u.id as user_id, u.name as user_name, u.username, u.avatar_url
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `).bind(postId).all()

    if (postResults.length === 0) {
      return c.json({ error: 'Post not found.' }, 404)
    }

    const post = postResults[0]

    // Fetch comments for the post
    const { results: comments } = await c.env.DB.prepare(`
      SELECT 
        c.id, c.content, c.parent_comment_id, c.created_at,
        u.id as user_id, u.name as user_name, u.username, u.avatar_url
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `).bind(postId).all()

    return c.json({ post, comments })
  } catch (err: any) {
    console.error('Fetch single post error:', err)
    return c.json({ error: 'Failed to fetch post.', details: err.message }, 500)
  }
})

// GET /api/users/:id/profile - Get user profile with stats
app.get('/api/users/:id/profile', async (c: Context) => {
  try {
    const userId = Number(c.req.param('id'))
    if (isNaN(userId)) return c.json({ error: 'Invalid user ID.' }, 400)

    // Fetch user profile
    const { results } = await c.env.DB.prepare(`
      SELECT 
        id, name, email, username, bio, avatar_url, location, website,
        tier, role, followers_count, following_count, posts_count, created_at
      FROM users
      WHERE id = ?
    `).bind(userId).all()

    if (results.length === 0) {
      return c.json({ error: 'User not found.' }, 404)
    }

    const user = results[0]

    // Fetch recent posts
    const { results: recentPosts } = await c.env.DB.prepare(`
      SELECT id, content, media_url, likes_count, comments_count, created_at
      FROM posts
      WHERE user_id = ? AND visibility = 'public'
      ORDER BY created_at DESC
      LIMIT 5
    `).bind(userId).all()

    return c.json({
      user,
      recent_posts: recentPosts
    })
  } catch (err: any) {
    console.error('Fetch user profile error:', err)
    return c.json({ error: 'Failed to fetch user profile.', details: err.message }, 500)
  }
})

// GET /api/users/:id/followers - Get user followers/following lists
app.get('/api/users/:id/followers', async (c: Context) => {
  try {
    const userId = Number(c.req.param('id'))
    const type = c.req.query('type') || 'followers' // followers or following

    if (isNaN(userId)) return c.json({ error: 'Invalid user ID.' }, 400)

    let query: string
    if (type === 'following') {
      query = `
        SELECT 
          u.id, u.name, u.username, u.avatar_url, u.bio,
          f.created_at as followed_at
        FROM follows f
        JOIN users u ON f.following_id = u.id
        WHERE f.follower_id = ?
        ORDER BY f.created_at DESC
      `
    } else {
      query = `
        SELECT 
          u.id, u.name, u.username, u.avatar_url, u.bio,
          f.created_at as followed_at
        FROM follows f
        JOIN users u ON f.follower_id = u.id
        WHERE f.following_id = ?
        ORDER BY f.created_at DESC
      `
    }

    const { results } = await c.env.DB.prepare(query).bind(userId).all()

    return c.json({
      type,
      users: results,
      count: results.length
    })
  } catch (err: any) {
    console.error('Fetch followers error:', err)
    return c.json({ error: 'Failed to fetch followers.', details: err.message }, 500)
  }
})

// ============================================
// PUT/PATCH ENDPOINTS (Updates)
// ============================================

// PUT /api/posts/:id - Update post
app.put('/api/posts/:id', authMiddleware, async (c: Context) => {
  try {
    const postId = Number(c.req.param('id'))
    const { content, media_url, media_type, visibility } = await c.req.json()
    const user = c.get('user')

    if (isNaN(postId)) return c.json({ error: 'Invalid post ID.' }, 400)

    // Check if post exists and belongs to user
    const { results } = await c.env.DB.prepare(
      `SELECT user_id FROM posts WHERE id = ?`
    ).bind(postId).all()

    if (results.length === 0) {
      return c.json({ error: 'Post not found.' }, 404)
    }

    const post = results[0] as { user_id: number }

    if (post.user_id !== user.userId) {
      return c.json({ error: 'Unauthorized to edit this post.' }, 403)
    }

    // Build dynamic update
    const updateFields: string[] = []
    const bindValues: any[] = []

    if (content !== undefined) {
      if (content.length > 5000) {
        return c.json({ error: 'Content must be less than 5000 characters.' }, 400)
      }
      updateFields.push(`content = ?`)
      bindValues.push(content)
    }

    if (media_url !== undefined) {
      updateFields.push(`media_url = ?`)
      bindValues.push(media_url)
    }

    if (media_type !== undefined) {
      updateFields.push(`media_type = ?`)
      bindValues.push(media_type)
    }

    if (visibility !== undefined) {
      if (!['public', 'private', 'followers_only'].includes(visibility)) {
        return c.json({ error: 'Invalid visibility value.' }, 400)
      }
      updateFields.push(`visibility = ?`)
      bindValues.push(visibility)
    }

    if (updateFields.length === 0) {
      return c.json({ error: 'No fields to update.' }, 400)
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`)
    bindValues.push(postId)

    await c.env.DB.prepare(`
      UPDATE posts SET ${updateFields.join(', ')} WHERE id = ?
    `).bind(...bindValues).run()

    return c.json({ message: 'Post updated successfully.' })
  } catch (err: any) {
    console.error('Update post error:', err)
    return c.json({ error: 'Failed to update post.', details: err.message }, 500)
  }
})

// PATCH /api/users/profile - Update user profile
app.patch('/api/users/profile', authMiddleware, async (c: Context) => {
  try {
    const { name, username, bio, avatar_url, location, website } = await c.req.json()
    const user = c.get('user')

    const updateFields: string[] = []
    const bindValues: any[] = []

    if (name !== undefined) {
      updateFields.push(`name = ?`)
      bindValues.push(name)
    }

    if (username !== undefined) {
      // Check if username is taken
      const { results } = await c.env.DB.prepare(
        `SELECT id FROM users WHERE username = ? AND id != ?`
      ).bind(username, user.userId).all()

      if (results.length > 0) {
        return c.json({ error: 'Username already taken.' }, 409)
      }

      updateFields.push(`username = ?`)
      bindValues.push(username)
    }

    if (bio !== undefined) {
      updateFields.push(`bio = ?`)
      bindValues.push(bio)
    }

    if (avatar_url !== undefined) {
      updateFields.push(`avatar_url = ?`)
      bindValues.push(avatar_url)
    }

    if (location !== undefined) {
      updateFields.push(`location = ?`)
      bindValues.push(location)
    }

    if (website !== undefined) {
      updateFields.push(`website = ?`)
      bindValues.push(website)
    }

    if (updateFields.length === 0) {
      return c.json({ error: 'No fields to update.' }, 400)
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`)
    bindValues.push(user.userId)

    await c.env.DB.prepare(`
      UPDATE users SET ${updateFields.join(', ')} WHERE id = ?
    `).bind(...bindValues).run()

    return c.json({ message: 'Profile updated successfully.' })
  } catch (err: any) {
    console.error('Update profile error:', err)
    return c.json({ error: 'Failed to update profile.', details: err.message }, 500)
  }
})

// PATCH /api/users/:id/follow - Follow/unfollow a user
app.patch('/api/users/:id/follow', authMiddleware, async (c: Context) => {
  try {
    const targetUserId = Number(c.req.param('id'))
    const user = c.get('user')

    if (isNaN(targetUserId)) return c.json({ error: 'Invalid user ID.' }, 400)

    if (targetUserId === user.userId) {
      return c.json({ error: 'You cannot follow yourself.' }, 400)
    }

    // Check if target user exists
    const { results: targetResults } = await c.env.DB.prepare(
      `SELECT id FROM users WHERE id = ?`
    ).bind(targetUserId).all()

    if (targetResults.length === 0) {
      return c.json({ error: 'User not found.' }, 404)
    }

    // Check if already following
    const { results: followResults } = await c.env.DB.prepare(
      `SELECT id FROM follows WHERE follower_id = ? AND following_id = ?`
    ).bind(user.userId, targetUserId).all()

    if (followResults.length > 0) {
      // Unfollow
      await c.env.DB.prepare(
        `DELETE FROM follows WHERE follower_id = ? AND following_id = ?`
      ).bind(user.userId, targetUserId).run()

      // Update counts
      await c.env.DB.prepare(
        `UPDATE users SET following_count = following_count - 1 WHERE id = ?`
      ).bind(user.userId).run()

      await c.env.DB.prepare(
        `UPDATE users SET followers_count = followers_count - 1 WHERE id = ?`
      ).bind(targetUserId).run()

      return c.json({ message: 'User unfollowed successfully.', action: 'unfollowed' })
    } else {
      // Follow
      await c.env.DB.prepare(
        `INSERT INTO follows (follower_id, following_id) VALUES (?, ?)`
      ).bind(user.userId, targetUserId).run()

      // Update counts
      await c.env.DB.prepare(
        `UPDATE users SET following_count = following_count + 1 WHERE id = ?`
      ).bind(user.userId).run()

      await c.env.DB.prepare(
        `UPDATE users SET followers_count = followers_count + 1 WHERE id = ?`
      ).bind(targetUserId).run()

      return c.json({ message: 'User followed successfully.', action: 'followed' })
    }
  } catch (err: any) {
    console.error('Follow/unfollow error:', err)
    return c.json({ error: 'Failed to follow/unfollow user.', details: err.message }, 500)
  }
})

// PATCH /api/posts/:id/share - Share a post (premium+ feature)
app.patch('/api/posts/:id/share', authMiddleware, requireTier('premium'), async (c: Context) => {
  try {
    const postId = Number(c.req.param('id'))
    const user = c.get('user')

    if (isNaN(postId)) return c.json({ error: 'Invalid post ID.' }, 400)

    // Check if post exists
    const { results: postResults } = await c.env.DB.prepare(
      `SELECT id, user_id FROM posts WHERE id = ?`
    ).bind(postId).all()

    if (postResults.length === 0) {
      return c.json({ error: 'Post not found.' }, 404)
    }

    // Check if already shared
    const { results: shareResults } = await c.env.DB.prepare(
      `SELECT id FROM shares WHERE post_id = ? AND user_id = ?`
    ).bind(postId, user.userId).all()

    if (shareResults.length > 0) {
      return c.json({ error: 'You have already shared this post.' }, 409)
    }

    // Add share
    await c.env.DB.prepare(
      `INSERT INTO shares (post_id, user_id) VALUES (?, ?)`
    ).bind(postId, user.userId).run()

    // Update shares count
    await c.env.DB.prepare(
      `UPDATE posts SET shares_count = shares_count + 1 WHERE id = ?`
    ).bind(postId).run()

    return c.json({ 
      message: 'Post shared successfully.',
      note: 'This is a premium feature.'
    })
  } catch (err: any) {
    console.error('Share post error:', err)
    return c.json({ error: 'Failed to share post.', details: err.message }, 500)
  }
})

// ============================================
// DELETE ENDPOINTS
// ============================================

// DELETE /api/posts/:id - Delete post
app.delete('/api/posts/:id', authMiddleware, async (c: Context) => {
  try {
    const postId = Number(c.req.param('id'))
    const user = c.get('user')

    if (isNaN(postId)) return c.json({ error: 'Invalid post ID.' }, 400)

    // Check if post exists and belongs to user
    const { results } = await c.env.DB.prepare(
      `SELECT user_id FROM posts WHERE id = ?`
    ).bind(postId).all()

    if (results.length === 0) {
      return c.json({ error: 'Post not found.' }, 404)
    }

    const post = results[0] as { user_id: number }

    if (post.user_id !== user.userId && user.role !== 'admin') {
      return c.json({ error: 'Unauthorized to delete this post.' }, 403)
    }

    // Delete post (CASCADE will handle likes, comments, shares)
    await c.env.DB.prepare(`DELETE FROM posts WHERE id = ?`).bind(postId).run()

    // Update user's post count
    await c.env.DB.prepare(`
      UPDATE users SET posts_count = posts_count - 1 WHERE id = ?
    `).bind(post.user_id).run()

    return c.json({ message: 'Post deleted successfully.' })
  } catch (err: any) {
    console.error('Delete post error:', err)
    return c.json({ error: 'Failed to delete post.', details: err.message }, 500)
  }
})

// DELETE /api/users/account - Delete user account and all associated data
app.delete('/api/users/account', authMiddleware, async (c: Context) => {
  try {
    const { password } = await c.req.json()
    const user = c.get('user')

    if (!password) {
      return c.json({ error: 'Password is required to delete account.' }, 400)
    }

    // Get stored hashed password from DB
    const { results } = await c.env.DB.prepare(
      `SELECT password FROM users WHERE id = ?`
    ).bind(user.userId).all()

    if (results.length === 0) {
      return c.json({ error: 'User not found.' }, 404)
    }

    const storedHash = (results[0] as { password: string }).password

    // Verify password
    const isMatch = await bcrypt.compare(password, storedHash)
    if (!isMatch) {
      return c.json({ error: 'Invalid password.' }, 401)
    }

    // Delete user (CASCADE will handle posts, comments, likes, follows, shares)
    await c.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(user.userId).run()

    return c.json({ message: 'Account and all associated data deleted successfully.' })
  } catch (err: any) {
    console.error('Delete account error:', err)
    return c.json({ error: 'Failed to delete account.', details: err.message }, 500)
  }
})

export default app
