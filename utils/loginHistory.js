const LoginHistory = require('../models/LoginHistory')

async function recordLogin({
  userId,
  method = 'whatsapp_otp',
  loginRole = 'user',
  restaurantId,
  userAgent,
  ip,
}) {
  if (!userId) return null
  try {
    return await LoginHistory.create({
      user: userId,
      method,
      loginRole,
      restaurant: restaurantId || undefined,
      userAgent: userAgent || '',
      ip: ip || '',
    })
  } catch {
    return null
  }
}

module.exports = { recordLogin }
