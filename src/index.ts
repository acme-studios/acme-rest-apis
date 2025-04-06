import { Hono } from 'hono'
import { Context } from 'hono'
import { jwt } from 'hono/jwt'
import bcrypt from 'bcryptjs'
import jwtLib from 'jsonwebtoken'
import { authMiddleware } from './middleware/authMiddleware'


const app = new Hono<{ Bindings: { DB: D1Database; JWT_SECRET: string } }>()

// POST /api/register
app.post('/api/register', async (c: Context) => {
  try {
    const body = await c.req.json()
    const { name, email, password } = body

    // Basic input validation
    if (!name || !email || !password) {
      return c.json({ error: 'Name, email, and password are required.' }, 400)
    }

    if (password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters long.' }, 400)
    }

    // Check if user already exists
    const { results } = await c.env.DB.prepare(
      `SELECT id FROM users WHERE email = ?`
    ).bind(email).all()

    if (results.length > 0) {
      return c.json({ error: 'User with this email already exists.' }, 409)
    }

    // Hash the password
    const salt = await bcrypt.genSalt(12)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Insert user
    const result = await c.env.DB.prepare(`
      INSERT INTO users (name, email, password) VALUES (?, ?, ?)
    `).bind(name, email, hashedPassword).run()

    const userId = result.meta.last_row_id

    // Generate JWT (valid for 1 hour)
    const token = jwtLib.sign(
      { userId, email },
      c.env.JWT_SECRET,
      { expiresIn: '1h' }
    )

    return c.json({ token, message: 'User registered successfully.' }, 201)
  } catch (err: any) {
    console.error('Registration error:', err)
    return c.json({ error: 'Something went wrong during registration.', details: err.message }, 500)
  }
})

// POST /api/login
app.post('/api/login', async (c: Context) => {
  try {
    const body = await c.req.json()
    const { email, password } = body

    if (!email || !password) {
      return c.json({ error: 'Email and password are required.' }, 400)
    }

    // Fetch user from DB
    const { results } = await c.env.DB.prepare(
      `SELECT id, password FROM users WHERE email = ?`
    ).bind(email).all()

    if (results.length === 0) {
      return c.json({ error: 'Invalid email or password.' }, 401)
    }

    const user = results[0] as { id: number; password: string }

    // Compare password hash
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return c.json({ error: 'Invalid email or password.' }, 401)
    }

    // Generate JWT
    const token = jwtLib.sign(
      { userId: user.id, email },
      c.env.JWT_SECRET,
      { expiresIn: '1h' }
    )

    return c.json({ token, message: 'Login successful.' })
  } catch (err: any) {
    console.error('Login error:', err)
    return c.json({ error: 'Something went wrong during login.', details: err.message }, 500)
  }
})

// POST /api/posts (protected)
app.post('/api/posts', authMiddleware, async (c: Context) => {
  try {
    const body = await c.req.json()
    const { title, content } = body

    if (!title || typeof title !== 'string') {
      return c.json({ error: 'Post title is required and must be a string.' }, 400)
    }

    const user = c.get('user') as { userId: number }

    const result = await c.env.DB.prepare(`
      INSERT INTO posts (title, content, user_id)
      VALUES (?, ?, ?)
    `).bind(title, content || '', user.userId).run()

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
    const { title, content } = body
    const user = c.get('user') as { userId: number }

    if (!title && !content) {
      return c.json({ error: 'At least one of title or content must be provided.' }, 400)
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

    if (title) {
      updateFields.push(`title = ?`)
      bindValues.push(title)
    }

    if (content) {
      updateFields.push(`content = ?`)
      bindValues.push(content)
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
      SELECT id, title, content, user_id, created_at
      FROM posts
      WHERE id = ?
    `).bind(postId).all()

    if (results.length === 0) {
      return c.json({ error: 'Post not found.' }, 404)
    }

    return c.json({ post: results[0] })
  } catch (err: any) {
    console.error('Fetch single post error:', err)
    return c.json({ error: 'Failed to fetch post.', details: err.message }, 500)
  }
})

export default app
