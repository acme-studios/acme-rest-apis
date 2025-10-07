import { Hono } from 'hono'
import { Context } from 'hono'
import bcrypt from 'bcryptjs'
import jwtLib from 'jsonwebtoken'
import { authMiddleware } from './middleware/authMiddleware'
import jwks from '../jwks.json'

const app = new Hono<{ Bindings: { DB: D1Database; PRIVATE_KEY: string; PUBLIC_KEY: string } }>()

// JWKS URL for Cloudflare JWT Validation
app.get('/.well-known/jwks.json', (c) => {
  return c.json(jwks)
})

// POST /api/register
app.post('/api/register', async (c: Context) => {
  try {
    const { name, email, password } = await c.req.json()

    if (!name || !email || !password) {
      return c.json({ error: 'Name, email, and password are required.' }, 400)
    }

    if (password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters long.' }, 400)
    }

    const existing = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).all()
    if (existing.results.length > 0) {
      return c.json({ error: 'User already exists.' }, 409)
    }

    const hashed = await bcrypt.hash(password, 12)

    const result = await c.env.DB.prepare(
      `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`
    ).bind(name, email, hashed).run()

    const userId = result.meta.last_row_id

    const token = jwtLib.sign(
      { userId, email },
      c.env.PRIVATE_KEY,
      {
        algorithm: 'RS256',
        keyid: 'acme-namer01-kid',
        expiresIn: '1h'
      }
    )

    return c.json({ token, message: 'User registered successfully.' }, 201)
  } catch (err: any) {
    console.error('Register error:', err)
    return c.json({ error: 'Something went wrong.', details: err.message }, 500)
  }
})

// POST /api/login
app.post('/api/login', async (c: Context) => {
  try {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      return c.json({ error: 'Email and password are required.' }, 400)
    }

    const { results } = await c.env.DB.prepare(
      `SELECT id, password FROM users WHERE email = ?`
    ).bind(email).all()

    if (results.length === 0) {
      return c.json({ error: 'Invalid email or password.' }, 401)
    }

    const user = results[0] as { id: number; password: string }
    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
      return c.json({ error: 'Invalid email or password.' }, 401)
    }

    const token = jwtLib.sign(
      { userId: user.id, email },
      c.env.PRIVATE_KEY,
      {
        algorithm: 'RS256',
        keyid: 'acme-namer01-kid',
        expiresIn: '1h'
      }
    )

    return c.json({ token, message: 'Login successful.' })
  } catch (err: any) {
    console.error('Login error:', err)
    return c.json({ error: 'Something went wrong.', details: err.message }, 500)
  }
})

// POST /api/posts (protected)
app.post('/api/posts', authMiddleware, async (c: Context) => {
  try {
    const body = await c.req.json()
    const { title, content } = body
    const isPrivate = body.is_private === true // Default Post = False

    if (!title || typeof title !== 'string') {
      return c.json({ error: 'Post title is required and must be a string.' }, 400)
    }

    const user = c.get('user') as { userId: number }

    const result = await c.env.DB.prepare(`
      INSERT INTO posts (title, content, user_id, is_private)
      VALUES (?, ?, ?, ?)
    `).bind(title, content || '', user.userId, isPrivate).run()

    return c.json({
      message: 'Post created successfully.',
      postId: result.meta.last_row_id
    }, 201)
  } catch (err: any) {
    console.error('Create post error:', err)
    return c.json({ error: 'Failed to create post.', details: err.message }, 500)
  }
})

// PUT /api/posts/:id (protected)
app.put('/api/posts/:id', authMiddleware, async (c: Context) => {
  try {
    const postId = Number(c.req.param('id'))
    const body = await c.req.json()
    const { title, content, is_private } = body
    const user = c.get('user') as { userId: number }

    if (
      title === undefined &&
      content === undefined &&
      is_private === undefined
    ) {
      return c.json({ error: 'At least one field (title, content, is_private) must be provided.' }, 400)
    }

    // Check if post exists and belongs to the current user
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

    // Build dynamic update query
    const updateFields: string[] = []
    const bindValues: any[] = []

    if (title !== undefined) {
      updateFields.push(`title = ?`)
      bindValues.push(title)
    }

    if (content !== undefined) {
      updateFields.push(`content = ?`)
      bindValues.push(content)
    }

    if (is_private !== undefined) {
      updateFields.push(`is_private = ?`)
      bindValues.push(is_private ? 1 : 0)
    }

    bindValues.push(postId)

    const updateQuery = `
      UPDATE posts
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `

    await c.env.DB.prepare(updateQuery).bind(...bindValues).run()

    return c.json({ message: 'Post updated successfully.' })
  } catch (err: any) {
    console.error('Update post error:', err)
    return c.json({ error: 'Failed to update post.', details: err.message }, 500)
  }
})


// DELETE /api/posts/:id (protected)
app.delete('/api/posts/:id', authMiddleware, async (c: Context) => {
  try {
    const postId = Number(c.req.param('id'))
    const user = c.get('user') as { userId: number }

    // Check if post exists and belongs to the current user
    const { results } = await c.env.DB.prepare(
      `SELECT user_id FROM posts WHERE id = ?`
    ).bind(postId).all()

    if (results.length === 0) {
      return c.json({ error: 'Post not found.' }, 404)
    }

    const post = results[0] as { user_id: number }

    if (post.user_id !== user.userId) {
      return c.json({ error: 'Unauthorized to delete this post.' }, 403)
    }

    await c.env.DB.prepare(`DELETE FROM posts WHERE id = ?`).bind(postId).run()

    return c.json({ message: 'Post deleted successfully.' })
  } catch (err: any) {
    console.error('Delete post error:', err)
    return c.json({ error: 'Failed to delete post.', details: err.message }, 500)
  }
})

// GET /api/posts (protected)
app.get('/api/posts', authMiddleware, async (c: Context) => {
  try {
    const user = c.get('user') as { userId: number }

    const { results } = await c.env.DB.prepare(`
      SELECT id, title, content, created_at
      FROM posts
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).bind(user.userId).all()

    return c.json({ posts: results })
  } catch (err: any) {
    console.error('Fetch posts error:', err)
    return c.json({ error: 'Failed to fetch posts.', details: err.message }, 500)
  }
})

// GET /api/posts/user?email=alice@example.com OR ?id=1
app.get('/api/posts/user', async (c: Context) => {
  const email = c.req.query('email')
  const id = c.req.query('id')

  try {
    let userId: number | null = null

    if (email) {
      const { results } = await c.env.DB.prepare(
        `SELECT id FROM users WHERE email = ?`
      ).bind(email).all()

      if (results.length === 0) {
        return c.json({ error: 'No user found with this email.' }, 404)
      }

      userId = (results[0] as { id: number }).id
    } else if (id) {
      userId = parseInt(id)
      if (isNaN(userId)) return c.json({ error: 'Invalid user ID.' }, 400)
    } else {
      return c.json({ error: 'Provide either email or user ID as query param.' }, 400)
    }

    const { results: posts } = await c.env.DB.prepare(`
      SELECT id, title, content, created_at FROM posts
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).bind(userId).all()

    return c.json({ posts })
  } catch (err: any) {
    console.error('Fetch posts by user error:', err)
    return c.json({ error: 'Failed to fetch posts.', details: err.message }, 500)
  }
})

// GET /api/posts/:id
app.get('/api/posts/:id', async (c: Context) => {
  try {
    const postId = Number(c.req.param('id'))
    if (isNaN(postId)) return c.json({ error: 'Invalid post ID.' }, 400)

    const { results } = await c.env.DB.prepare(`
      SELECT id, title, content, user_id, is_private, created_at
      FROM posts
      WHERE id = ?
    `).bind(postId).all()

    if (results.length === 0) {
      return c.json({ error: 'Post not found.' }, 404)
    }

    const post = results[0] as {
      id: number
      title: string
      content: string
      user_id: number
      is_private: number
      created_at: string
    }

    // If post is public, return it
    if (!post.is_private) {
      return c.json({ post })
    }

    // If post is private, require auth and ownership
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized: private post' }, 401)
    }

    try {
      const token = authHeader.split(' ')[1]
      const decoded = jwtLib.verify(token, c.env.JWT_SECRET) as { userId: number }

      if (decoded.userId !== post.user_id) {
        return c.json({ error: 'Forbidden: not your private post' }, 403)
      }

      return c.json({ post }) // Authorized Owner
    } catch (err: any) {
      return c.json({ error: 'Invalid or expired token.', details: err.message }, 401)
    }
  } catch (err: any) {
    console.error('Fetch single post error:', err)
    return c.json({ error: 'Failed to fetch post.', details: err.message }, 500)
  }
})

// POST /api/unregister (protected)
app.post('/api/unregister', authMiddleware, async (c: Context) => {
  try {
    const { email, password } = await c.req.json()
    const user = c.get('user') as { userId: number; email: string }

    // Step 1: Verify email matches JWT identity
    if (email !== user.email) {
      return c.json({ error: 'Email does not match authenticated user.' }, 403)
    }

    // Step 2: Get stored hashed password from DB
    const { results } = await c.env.DB.prepare(
      `SELECT password FROM users WHERE id = ?`
    ).bind(user.userId).all()

    if (results.length === 0) {
      return c.json({ error: 'User not found.' }, 404)
    }

    const storedHash = (results[0] as { password: string }).password

    // Step 3: Compare password
    const isMatch = await bcrypt.compare(password, storedHash)
    if (!isMatch) {
      return c.json({ error: 'Invalid password.' }, 401)
    }

    // Step 4: Optionally delete all posts
    await c.env.DB.prepare(`DELETE FROM posts WHERE user_id = ?`).bind(user.userId).run()

    // Step 5: Delete user
    await c.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(user.userId).run()

    return c.json({ message: 'Account and posts deleted successfully.' })
  } catch (err: any) {
    console.error('Unregister error:', err)
    return c.json({ error: 'Failed to delete account.', details: err.message }, 500)
  }
})


export default app
