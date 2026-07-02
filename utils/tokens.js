const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const RefreshToken = require('../models/RefreshToken')

const generateAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m',
    issuer: 'dineflow',
  })

const generateRefreshToken = async (userId, meta = {}) => {
  const token = uuidv4()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await RefreshToken.create({
    user: userId,
    token,
    expiresAt,
    userAgent: meta.userAgent,
    ip: meta.ip,
  })
  return token
}

const revokeRefreshToken = async (token) => {
  await RefreshToken.deleteOne({ token })
}

const revokeAllUserTokens = async (userId) => {
  await RefreshToken.deleteMany({ user: userId })
}

const verifyRefreshToken = async (token) => {
  const doc = await RefreshToken.findOne({ token }).populate('user')
  if (!doc || doc.expiresAt < new Date()) return null
  return doc
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  verifyRefreshToken,
}
