import { MiddlewareHandler } from 'hono'
import jwt from 'jsonwebtoken'

// Validate JWT
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader) {
    return c.json({ error: 'Missing Authorization header' }, 401)
  }

  const token = authHeader.split(' ')[1]
  if (!token) {
    return c.json({ error: 'Missing token in Authorization header' }, 401)
  }

  try {
    const decoded = jwt.verify(token, c.env.JWT_SECRET) as { userId: number; email: string }
    c.set('user', decoded)
    await next()
  } catch (err) {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}
