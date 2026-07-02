const crypto = require('crypto')
const OtpVerification = require('../models/OtpVerification')
const { sendOtpEmail, maskEmail } = require('./emailProvider')

const OTP_TTL_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_VERIFY_ATTEMPTS = 5
const CHANNEL = 'email'

function normalizeEmail(input) {
  const email = String(input || '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000))
}

async function sendEmailOtp(emailInput) {
  const email = normalizeEmail(emailInput)
  if (!email) {
    const err = new Error('Enter a valid email address')
    err.statusCode = 400
    throw err
  }

  const existing = await OtpVerification.findOne({ email, channel: CHANNEL })
    .select('+code lastSentAt expiresAt verifiedAt')

  if (existing?.verifiedAt) {
    const err = new Error('OTP already used. Request a new code.')
    err.statusCode = 400
    throw err
  }

  if (existing?.lastSentAt) {
    const elapsed = Date.now() - new Date(existing.lastSentAt).getTime()
    if (elapsed < RESEND_COOLDOWN_MS) {
      const resendIn = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)
      const err = new Error(`Please wait ${resendIn}s before requesting another code`)
      err.statusCode = 429
      err.resendIn = resendIn
      throw err
    }
  }

  const code = generateCode()
  const sendResult = await sendOtpEmail(email, code)

  await OtpVerification.findOneAndUpdate(
    { email, channel: CHANNEL },
    {
      email,
      phone: '',
      channel: CHANNEL,
      code,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      lastSentAt: new Date(),
      attempts: 0,
      verifiedAt: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  return {
    success: true,
    channel: CHANNEL,
    maskedEmail: maskEmail(email),
    resendIn: Math.ceil(RESEND_COOLDOWN_MS / 1000),
    expiresIn: Math.ceil(OTP_TTL_MS / 1000),
  }
}

async function verifyEmailOtp(emailInput, code) {
  const email = normalizeEmail(emailInput)
  if (!email) {
    const err = new Error('Invalid email address')
    err.statusCode = 400
    throw err
  }

  const record = await OtpVerification.findOne({ email, channel: CHANNEL })
    .select('+code expiresAt attempts verifiedAt')

  if (!record) {
    const err = new Error('Code expired or not found. Request a new one.')
    err.statusCode = 400
    throw err
  }

  if (record.verifiedAt) {
    const err = new Error('Code already used. Request a new one.')
    err.statusCode = 400
    throw err
  }

  if (new Date(record.expiresAt).getTime() < Date.now()) {
    await OtpVerification.deleteOne({ email, channel: CHANNEL })
    const err = new Error('Code has expired. Request a new one.')
    err.statusCode = 400
    throw err
  }

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    await OtpVerification.deleteOne({ email, channel: CHANNEL })
    const err = new Error('Too many wrong attempts. Request a new code.')
    err.statusCode = 429
    throw err
  }

  if (String(code).trim() !== String(record.code)) {
    record.attempts += 1
    await record.save()
    const err = new Error('Invalid code. Please check and try again.')
    err.statusCode = 400
    throw err
  }

  record.verifiedAt = new Date()
  await record.save()
  await OtpVerification.deleteOne({ email, channel: CHANNEL })

  return { email, verified: true, verifiedAt: Date.now() }
}

module.exports = {
  sendEmailOtp,
  verifyEmailOtp,
  normalizeEmail,
  RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
}
