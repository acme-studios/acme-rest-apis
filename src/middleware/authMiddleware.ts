import { MiddlewareHandler } from 'hono'
import jwt from 'jsonwebtoken'

// Enhanced JWT claims with tier and role
export type UserClaims = {
  userId: number
  email: string
  tier: 'free' | 'premium' | 'enterprise'
  role: 'user' | 'admin'
  username?: string
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
    const publicKey = c.env.PUBLIC_KEY // Your Wrangler secret

    // Verify JWT using RS256 algorithm (same as Cloudflare API Shield will use)
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
    }) as UserClaims

    // Attach decoded user claims to context for downstream handlers
    c.set('user', decoded)
    await next()
  } catch (err: any) {
    console.error('JWT validation error:', err)
    return c.json({ error: 'Invalid or expired token', details: err.message }, 401)
  }
}

// Optional middleware to check specific tier requirements
export const requireTier = (minTier: 'free' | 'premium' | 'enterprise'): MiddlewareHandler => {
  const tierLevels = { free: 1, premium: 2, enterprise: 3 }
  
  return async (c, next) => {
    const user = c.get('user') as UserClaims
    
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401)
    }

    const userLevel = tierLevels[user.tier] || 0
    const requiredLevel = tierLevels[minTier] || 0

    if (userLevel < requiredLevel) {
      return c.json({ 
        error: 'Insufficient tier level', 
        required: minTier,
        current: user.tier 
      }, 403)
    }

    await next()
  }
}

// Middleware to check admin role
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get('user') as UserClaims
  
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403)
  }

  await next()
}
