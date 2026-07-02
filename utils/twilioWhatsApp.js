let config = null

const SANDBOX_FROM = 'whatsapp:+14155238886'
const DEFAULT_CONTENT_SID = 'HX229f5a04fd0510ce1b071852155d3e75'

function setTwilioWhatsAppConfig(next) {
  config = {
    accountSid: String(next?.accountSid || '').trim(),
    authToken: String(next?.authToken || '').trim(),
    from: String(next?.from || '').trim(),
    contentSid: String(next?.contentSid || DEFAULT_CONTENT_SID).trim(),
    otpVariableKey: String(next?.otpVariableKey || '1').trim() || '1',
    brandName: String(next?.brandName || 'Savoria SaaS Team').trim(),
    brandVariableKey: String(next?.brandVariableKey || '').trim(),
    useContentTemplate: next?.useContentTemplate !== false,
    sandboxFrom: String(next?.sandboxFrom || SANDBOX_FROM).trim(),
  }
}

function getTwilioWhatsAppConfig() {
  return config
}

function isTwilioWhatsAppConfigured() {
  return Boolean(config?.accountSid && config?.authToken && config?.from)
}

function isSandboxFrom(from) {
  return String(from || '').includes('14155238886')
}

module.exports = {
  setTwilioWhatsAppConfig,
  getTwilioWhatsAppConfig,
  isTwilioWhatsAppConfigured,
  isSandboxFrom,
}
