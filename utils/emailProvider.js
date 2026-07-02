const { getTransporter } = require('../config/mail')
const { getEmailOtpConfig, isEmailOtpConfigured } = require('./emailConfig')

const OTP_SUBJECT = 'Your Savoria verification code'
const OTP_HTML = (code) => `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#059669;margin:0 0 12px">Savoria</h2>
    <p style="color:#334155;font-size:15px">Your verification code is:</p>
    <p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#0f172a;margin:16px 0">${code}</p>
    <p style="color:#64748b;font-size:13px">Valid for 5 minutes. Do not share this code.</p>
  </div>
`

async function sendOtpEmail(email, code) {
  const to = String(email || '').trim().toLowerCase()
  if (!to || !to.includes('@')) {
    const err = new Error('Invalid email address')
    err.statusCode = 400
    throw err
  }

  if (!isEmailOtpConfigured()) {
    const err = new Error(
      'Email sending is not set up on the server. Add your Gmail and App Password in backend/server.js (EMAIL_OTP section), then restart.',
    )
    err.statusCode = 503
    throw err
  }

  const transporter = getTransporter()
  const { user } = getEmailOtpConfig()

  try {
    const info = await transporter.sendMail({
      from: `"Savoria" <${user}>`,
      to,
      subject: OTP_SUBJECT,
      text: `Your Savoria verification code is ${code}. Valid for 5 minutes.`,
      html: OTP_HTML(code),
    })

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Email OTP] Delivered to ${maskEmail(to)} (messageId: ${info.messageId})`)
    }

    return { provider: 'gmail-smtp', messageId: info.messageId }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Email OTP] Send failed:', err.message)
    }
    const isAuth = /invalid login|authentication|credentials|535|534|EAUTH/i.test(String(err.message))
    const error = new Error(
      isAuth
        ? 'Gmail rejected login. Use a 16-character App Password (not your normal Gmail password).'
        : `Could not send email: ${err.message}`,
    )
    error.statusCode = 502
    throw error
  }
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@')
  if (!local || !domain) return '***'
  const visible = local.length <= 2 ? local[0] : `${local[0]}***${local.slice(-1)}`
  return `${visible}@${domain}`
}

module.exports = { sendOtpEmail, maskEmail }
