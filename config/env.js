const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')

const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
} else {
  dotenv.config()
}

/** Trim accidental spaces in keys/values from .env edits */
function normalizeEnv() {
  const snapshot = { ...process.env }
  for (const [key, value] of Object.entries(snapshot)) {
    const trimmedKey = key.trim()
    if (trimmedKey && trimmedKey !== key && snapshot[trimmedKey] == null) {
      process.env[trimmedKey] = value
      delete process.env[key]
    }
    if (trimmedKey && typeof value === 'string') {
      process.env[trimmedKey] = value.trim()
    }
  }
}

normalizeEnv()

const { isEmailOtpConfigured } = require('../utils/emailConfig')
const { isTwilioWhatsAppConfigured } = require('../utils/twilioWhatsApp')

function getOtpProviders() {
  const list = []
  if (process.env.FAST2SMS_API_KEY) list.push('Fast2SMS')
  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) list.push('MSG91')
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    list.push('Twilio SMS')
  }
  if (isTwilioWhatsAppConfigured()) {
    list.push('Twilio WhatsApp')
  }
  if (isEmailOtpConfigured()) {
    list.push('Email OTP (Gmail)')
  }
  return list
}

function logOtpConfig() {
  const providers = getOtpProviders()
  if (providers.length) {
    console.log(`📱 OTP ready: ${providers.join(', ')}`)
  } else {
    console.warn('⚠️  OTP not configured — set Twilio WhatsApp in server.js or add SMS keys to backend/.env')
  }
}

function logQrConfig() {
  const { qrBaseUrl, qrUsesLocalhost, suggestedLanUrl } = require('../utils/tableQr').getQrConfigMeta()
  if (!qrUsesLocalhost) {
    console.log(`📱 Table QR base URL: ${qrBaseUrl}`)
    return
  }
  console.warn('⚠️  Table QR codes use localhost — phones cannot open them when scanned.')
  if (suggestedLanUrl) {
    console.warn(`   For same-WiFi testing, add to backend/.env:`)
    console.warn(`   PUBLIC_APP_URL=${suggestedLanUrl}`)
    console.warn('   Then restart the backend and click "Regenerate all QR" in Admin → Tables.')
  } else {
    console.warn('   Set PUBLIC_APP_URL in backend/.env to your deployed site or ngrok URL.')
  }
}

module.exports = { logOtpConfig, getOtpProviders, logQrConfig }