const nodemailer = require('nodemailer')
const { getEmailOtpConfig } = require('../utils/emailConfig')

function createTransporter() {
  const { user, pass } = getEmailOtpConfig()
  if (!user || !pass) return null

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user,
      pass,
    },
    tls: { rejectUnauthorized: true },
  })
}

let cached = null

function getTransporter() {
  if (!cached) cached = createTransporter()
  return cached
}

function resetTransporter() {
  cached = null
}

async function verifyMailConnection() {
  const transporter = getTransporter()
  if (!transporter) return { ok: false, reason: 'EMAIL_USER and EMAIL_PASS not set' }
  try {
    await transporter.verify()
    return { ok: true }
  } catch (err) {
    resetTransporter()
    return { ok: false, reason: err.message }
  }
}

module.exports = {
  getTransporter,
  resetTransporter,
  verifyMailConnection,
}
