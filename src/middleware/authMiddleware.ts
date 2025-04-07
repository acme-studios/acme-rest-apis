import { MiddlewareHandler } from 'hono'
import jwt from 'jsonwebtoken'

type UserClaims = {
  userId: number
  email: string
}

export const authMiddleware: MiddlewareHandler<{
  Bindings: {
    PUBLIC_KEY: string
  }
}> = async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or malformed Authorization header' }, 401)
  }

  const token = authHeader.split(' ')[1]

  try {
    const publicKey = c.env.PUBLIC_KEY // ✅ Your Wrangler secret

    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
    }) as UserClaims

    c.set('user', decoded)
    await next()
  } catch (err: any) {
    console.error('JWT validation error:', err)
    return c.json({ error: 'Invalid or expired token', details: err.message }, 401)
  }
}
