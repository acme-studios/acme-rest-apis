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

export default app
