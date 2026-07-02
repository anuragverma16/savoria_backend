const jwt = require('jsonwebtoken')
const { normalizePhone } = require('./phoneUtils')

const PURPOSE = 'platform_provision'

function issueProvisionToken(phoneInput) {
  const phone = normalizePhone(phoneInput)
  if (!phone) {
    const err = new Error('Invalid phone number')
    err.statusCode = 400
    throw err
  }
  return jwt.sign({ purpose: PURPOSE, phone }, process.env.JWT_SECRET, { expiresIn: '5m' })
}

function assertProvisionToken(phoneInput, token) {
  const phone = normalizePhone(phoneInput)
  if (!phone || !token) {
    const err = new Error('Mobile verification expired. Request a new OTP.')
    err.statusCode = 400
    throw err
  }
  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    const err = new Error('Mobile verification expired. Request a new OTP.')
    err.statusCode = 400
    throw err
  }
  if (decoded.purpose !== PURPOSE || normalizePhone(decoded.phone) !== phone) {
    const err = new Error('Mobile verification does not match this number. Request a new OTP.')
    err.statusCode = 400
    throw err
  }
}

module.exports = { issueProvisionToken, assertProvisionToken }
