const crypto = require('crypto')
const { normalizeEmail } = require('./emailOtpService')
const { normalizePhone } = require('./phoneUtils')

/** Super-admin provisioning: email + phone only; account logs in via phone OTP */
function resolvePlatformProvision({ email, phone }) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    const err = new Error('Enter a valid email address')
    err.statusCode = 400
    throw err
  }

  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) {
    const err = new Error('Enter a valid 10-digit mobile number')
    err.statusCode = 400
    throw err
  }

  return {
    email: normalizedEmail,
    phone: normalizedPhone,
    password: crypto.randomBytes(16).toString('base64url'),
  }
}

module.exports = { resolvePlatformProvision }
