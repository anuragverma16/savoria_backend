let config = null

function setEmailOtpConfig(next) {
  config = {
    user: String(next?.user || '').trim(),
    pass: String(next?.pass || '').replace(/\s/g, ''),
  }
  if (config.user) process.env.EMAIL_USER = config.user
  if (config.pass) process.env.EMAIL_PASS = config.pass
  try {
    const { resetTransporter } = require('../config/mail')
    resetTransporter()
  } catch {
    /* mail module not loaded yet */
  }
}

function getEmailOtpConfig() {
  return {
    user: config?.user || process.env.EMAIL_USER || '',
    pass: config?.pass || process.env.EMAIL_PASS || '',
  }
}

function isEmailOtpConfigured() {
  const { user, pass } = getEmailOtpConfig()
  return Boolean(user && pass)
}

module.exports = {
  setEmailOtpConfig,
  getEmailOtpConfig,
  isEmailOtpConfigured,
}
