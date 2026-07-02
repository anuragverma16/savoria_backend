const crypto = require('crypto')
const OtpVerification = require('../models/OtpVerification')
const { normalizePhone, maskPhone } = require('./phoneUtils')
const { sendOtpSms, sendViaTwilio, OTP_MESSAGE } = require('./smsProvider')
const { sendOtpWhatsApp } = require('./whatsappProvider')

const OTP_TTL_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_VERIFY_ATTEMPTS = 5

async function sendWhatsAppOtp(phone, code) {
  try {
    return await sendOtpWhatsApp(phone, code)
  } catch (err) {
    const canSmsFallback = process.env.TWILIO_PHONE_NUMBER
      && /channel|63007|whatsapp|could not deliver|delivery failed|sandbox/i.test(String(err.message))
    if (!canSmsFallback) throw err

    const smsResult = await sendViaTwilio(phone, OTP_MESSAGE(code))
    if (!smsResult) throw err

    if (process.env.NODE_ENV === 'development') {
      console.warn('[WhatsApp OTP] WhatsApp unavailable — sent via Twilio SMS instead')
    }
    return { ...smsResult, fallback: 'sms' }
  }
}

const SENDERS = {
  sms: sendOtpSms,
  whatsapp: sendWhatsAppOtp,
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000))
}

async function sendOtp(phoneInput, options = {}) {
  const channel = options.channel === 'whatsapp' ? 'whatsapp' : 'sms'
  const phone = normalizePhone(phoneInput)
  if (!phone) {
    const err = new Error('Enter a valid 10-digit Indian mobile number')
    err.statusCode = 400
    throw err
  }

  const existing = await OtpVerification.findOne({ phone, channel }).select('+code lastSentAt expiresAt verifiedAt')
  if (existing?.verifiedAt) {
    const err = new Error('OTP already used. Request a new code.')
    err.statusCode = 400
    throw err
  }

  if (existing?.lastSentAt) {
    const elapsed = Date.now() - new Date(existing.lastSentAt).getTime()
    if (elapsed < RESEND_COOLDOWN_MS) {
      const resendIn = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)
      const err = new Error(`Please wait ${resendIn}s before requesting another OTP`)
      err.statusCode = 429
      err.resendIn = resendIn
      throw err
    }
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)
  const lastSentAt = new Date()

  const send = SENDERS[channel]
  if (!send) {
    const err = new Error('Unsupported OTP channel')
    err.statusCode = 400
    throw err
  }

  const sendResult = await send(phone, code)

  await OtpVerification.findOneAndUpdate(
    { phone, channel },
    {
      phone,
      channel,
      code,
      expiresAt,
      lastSentAt,
      attempts: 0,
      verifiedAt: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  return {
    success: true,
    channel,
    maskedPhone: maskPhone(phone),
    resendIn: Math.ceil(RESEND_COOLDOWN_MS / 1000),
    expiresIn: Math.ceil(OTP_TTL_MS / 1000),
    ...(sendResult?.fallback === 'sms' && { deliveredVia: 'sms' }),
    ...(sendResult?.to && { deliveredTo: maskPhone(phone) }),
  }
}

async function verifyOtp(phoneInput, code, profile = {}, options = {}) {
  const channel = options.channel === 'whatsapp' ? 'whatsapp' : 'sms'
  const phone = normalizePhone(phoneInput)
  if (!phone) {
    const err = new Error('Invalid phone number')
    err.statusCode = 400
    throw err
  }

  const record = await OtpVerification.findOne({ phone, channel }).select('+code expiresAt attempts verifiedAt')
  if (!record) {
    const err = new Error('OTP expired or not found. Request a new code.')
    err.statusCode = 400
    throw err
  }

  if (record.verifiedAt) {
    const err = new Error('OTP already used. Request a new code.')
    err.statusCode = 400
    throw err
  }

  if (new Date(record.expiresAt).getTime() < Date.now()) {
    await OtpVerification.deleteOne({ phone, channel })
    const err = new Error('OTP has expired. Request a new code.')
    err.statusCode = 400
    throw err
  }

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    await OtpVerification.deleteOne({ phone, channel })
    const err = new Error('Too many wrong attempts. Request a new OTP.')
    err.statusCode = 429
    throw err
  }

  if (String(code).trim() !== String(record.code)) {
    record.attempts += 1
    await record.save()
    const err = new Error('Invalid OTP. Please check the code and try again.')
    err.statusCode = 400
    throw err
  }

  record.verifiedAt = new Date()
  await record.save()
  await OtpVerification.deleteOne({ phone, channel })

  const name = String(profile.name || '').trim() || `Guest ${phone.slice(-4)}`
  const restaurantName = String(profile.restaurantName || '').trim()

  return {
    phone,
    name,
    restaurantName: restaurantName || undefined,
    verified: true,
    verifiedAt: Date.now(),
    channel,
  }
}

module.exports = { sendOtp, verifyOtp, RESEND_COOLDOWN_MS, OTP_TTL_MS }
