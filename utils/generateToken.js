const jwt = require('jsonwebtoken')

/**
 * Generate a signed JWT token
 * @param {string} id   - User ID
 * @param {string} role - User role
 * @returns {string} JWT token
 */
const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d',
  })

/**
 * Verify a JWT token and return the decoded payload
 * @param {string} token
 * @returns {object} decoded payload
 */
const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET)

module.exports = { generateToken, verifyToken }
