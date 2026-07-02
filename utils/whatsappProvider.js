const crypto = require('crypto')
const twilio = require('twilio')
const { smsDestination, maskPhone } = require('./phoneUtils')
const { getTwilioWhatsAppConfig, isSandboxFrom } = require('./twilioWhatsApp')

const SANDBOX_FROM = 'whatsapp:+14155238886'
const OTP_MESSAGE = (code) =>
  `From Savoria SaaS Team: Your verification code is ${code}. Valid for 5 minutes. Do not share this OTP.`

function whatsappDestination(phone) {
  const normalized = smsDestination(phone)
  if (!normalized) return null
  return `whatsapp:+${normalized}`
}

function buildContentVariables(code, config) {
  const vars = { [config?.otpVariableKey || '1']: String(code) }
  if (config?.brandVariableKey && config?.brandName) {
    vars[config.brandVariableKey] = config.brandName
  }
  return JSON.stringify(vars)
}

function isChannelError(err) {
  const msg = String(err?.message || '')
  return err?.code === 63007
    || err?.code === 63015
    || err?.code === 63016
    || /channel|63007|63015|63016|could not find a channel|not in your sandbox/i.test(msg)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function createMessage(client, { from, to, code, config, useTemplate }) {
  if (useTemplate && config.contentSid) {
    return client.messages.create({
      from,
      to,
      contentSid: config.contentSid,
      contentVariables: buildContentVariables(code, config),
    })
  }
  return client.messages.create({ from, to, body: OTP_MESSAGE(code) })
}

async function assertMessageDelivered(client, messageSid, usedFrom) {
  await sleep(1500)
  try {
    const status = await client.messages(messageSid).fetch()
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WhatsApp OTP] status=${status.status} sid=${messageSid}`)
    }
    if (['failed', 'undelivered', 'canceled'].includes(status.status)) {
      const err = new Error(
        isSandboxFrom(usedFrom)
          ? 'WhatsApp could not deliver the code. On that phone, open WhatsApp and send join <code> to +1 415 523 8886, then tap Resend.'
          : `WhatsApp delivery failed (${status.status}). Please try again.`,
      )
      err.statusCode = 502
      err.deliveryStatus = status.status
      throw err
    }
    return status
  } catch (err) {
    if (err.statusCode === 502) throw err
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WhatsApp OTP] Could not confirm delivery status:', err.message)
    }
    return null
  }
}

async function sendFromNumber(client, config, from, to, code) {
  const sandbox = isSandboxFrom(from)
  const useTemplate = !sandbox && config.useContentTemplate !== false && Boolean(config.contentSid)

  try {
    const message = await createMessage(client, { from, to, code, config, useTemplate })
    return { message, provider: useTemplate ? 'twilio-whatsapp-template' : 'twilio-whatsapp-body', from }
  } catch (templateErr) {
    if (!useTemplate || !isChannelError(templateErr)) throw templateErr
    const message = await createMessage(client, { from, to, code, config, useTemplate: false })
    return { message, provider: 'twilio-whatsapp-body-fallback', from }
  }
}

async function sendOtpWhatsApp(phone, code) {
  const twilioConfig = getTwilioWhatsAppConfig()
  if (!twilioConfig?.accountSid || !twilioConfig?.authToken || !twilioConfig?.from) {
    const err = new Error('WhatsApp OTP is not configured in server.js')
    err.statusCode = 503
    throw err
  }

  const to = whatsappDestination(phone)
  if (!to) {
    const err = new Error('Invalid phone number for WhatsApp')
    err.statusCode = 400
    throw err
  }

  const primaryFrom = twilioConfig.from
  const sandboxFrom = twilioConfig.sandboxFrom || SANDBOX_FROM
  const client = twilio(twilioConfig.accountSid, twilioConfig.authToken)

  const fromCandidates = [primaryFrom]
  if (sandboxFrom && sandboxFrom !== primaryFrom) fromCandidates.push(sandboxFrom)

  let lastErr = null

  for (const from of fromCandidates) {
    try {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[WhatsApp OTP] Trying from ${from} → ${to}`)
      }

      const { message, provider, from: usedFrom } = await sendFromNumber(client, twilioConfig, from, to, code)

      await assertMessageDelivered(client, message.sid, usedFrom)

      if (process.env.NODE_ENV === 'development') {
        console.log(`[WhatsApp OTP] DEV code for ${maskPhone(phone)}: ${code}`)
        if (isSandboxFrom(usedFrom)) {
          console.warn('   Sandbox: recipient must join +1 415 523 8886 on WhatsApp if message is missing')
        }
        if (usedFrom !== primaryFrom) {
          console.warn(`   Note: ${primaryFrom} is not WhatsApp-active — used sandbox ${usedFrom}`)
        }
      }

      return { provider, sid: message.sid, to, from: usedFrom }
    } catch (err) {
      lastErr = err
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[WhatsApp OTP] Failed from ${from}:`, err.code, err.message)
      }
      if (err.deliveryStatus || err.statusCode === 502) break
      if (!isChannelError(err)) break
    }
  }

  if (lastErr) {
    if (!lastErr.statusCode) lastErr.statusCode = 502
    throw lastErr
  }

  const usedSandbox = fromCandidates.some(isSandboxFrom)
  const error = new Error(
    usedSandbox || isSandboxFrom(primaryFrom)
      ? `WhatsApp OTP could not be sent. On WhatsApp (same phone), send join <code> to +1 415 523 8886, then try again.`
      : `WhatsApp is not active on ${String(primaryFrom).replace('whatsapp:', '')}. Enable it in Twilio Console or use sandbox number +14155238886 in server.js.`,
  )
  error.statusCode = 502
  error.twilioCode = lastErr?.code
  throw error
}

function maskForLog(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length < 4) return '***'
  return `***${d.slice(-4)}`
}

function generateSecureOtp() {
  return String(crypto.randomInt(100000, 1000000))
}

module.exports = { sendOtpWhatsApp, OTP_MESSAGE, generateSecureOtp }
