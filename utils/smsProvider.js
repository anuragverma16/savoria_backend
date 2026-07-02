const { smsDestination } = require('./phoneUtils')

const OTP_MESSAGE = (code) =>
  `Your Savoria verification code is ${code}. Valid for 5 minutes. Do not share this OTP.`

function tenDigitMobile(phone) {
  const dest = smsDestination(phone) || ''
  return dest.replace(/^91/, '').slice(-10)
}

function msg91Mobile(phone) {
  const digits = tenDigitMobile(phone)
  return digits ? `91${digits}` : ''
}

async function sendViaMsg91(phone, code) {
  const authKey = process.env.MSG91_AUTH_KEY
  const templateId = process.env.MSG91_TEMPLATE_ID
  if (!authKey || !templateId) return null

  const mobile = msg91Mobile(phone)
  if (!mobile) throw new Error('Invalid mobile number for MSG91')

  const res = await fetch('https://control.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: {
      authkey: authKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      template_id: templateId,
      mobile,
      otp: code,
      otp_length: String(code).length,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.type === 'error') {
    throw new Error(data.message || data.error || 'MSG91 could not deliver OTP')
  }
  return { provider: 'msg91' }
}

async function sendViaFast2SMS(phone, code) {
  const apiKey = process.env.FAST2SMS_API_KEY
  if (!apiKey) return null

  const numbers = tenDigitMobile(phone)
  if (!numbers) throw new Error('Invalid mobile number for Fast2SMS')

  const otpPayload = {
    route: 'otp',
    variables_values: code,
    numbers,
  }

  let res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(otpPayload),
  })

  let data = await res.json().catch(() => ({}))
  if (res.ok && data.return !== false) {
    return { provider: 'fast2sms-otp' }
  }

  const quickPayload = {
    route: 'q',
    message: OTP_MESSAGE(code),
    language: 'english',
    numbers,
  }

  res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(quickPayload),
  })

  data = await res.json().catch(() => ({}))
  if (!res.ok || data.return === false) {
    throw new Error(data.message || 'Fast2SMS could not deliver OTP')
  }
  return { provider: 'fast2sms' }
}

async function sendViaTwilio(phone, message) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  let from = String(process.env.TWILIO_PHONE_NUMBER || '').trim()
  if (!sid || !token || !from) return null

  if (!from.startsWith('+')) from = `+${from}`

  const normalized = smsDestination(phone)
  const to = normalized ? `+${normalized}` : phone

  const body = new URLSearchParams({ To: to, From: from, Body: message })

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.message || 'Twilio could not deliver OTP')
  }
  return { provider: 'twilio' }
}

async function sendOtpSms(phone, code) {
  const message = OTP_MESSAGE(code)
  const twilioOnly = process.env.OTP_PROVIDER === 'twilio'
  const providers = twilioOnly
    ? [() => sendViaTwilio(phone, message)]
    : [
      () => sendViaMsg91(phone, code),
      () => sendViaFast2SMS(phone, code),
      () => sendViaTwilio(phone, message),
    ]

  const errors = []

  for (const fn of providers) {
    try {
      const result = await fn()
      if (result) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[OTP] Sent via ${result.provider} to ${maskForLog(phone)}`)
        }
        return result
      }
    } catch (err) {
      errors.push(err.message)
      if (process.env.NODE_ENV === 'development') {
        console.warn('[OTP] Provider failed:', err.message)
      }
    }
  }

  if (errors.length) {
    const err = new Error(errors[0])
    err.statusCode = 502
    throw err
  }

  const err = new Error(
    twilioOnly
      ? 'Twilio SMS not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to backend/.env'
      : 'SMS is not configured. Add Twilio, MSG91, or Fast2SMS keys to backend/.env and restart the server.',
  )
  err.statusCode = 503
  throw err
}

function maskForLog(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length < 4) return '***'
  return `***${d.slice(-4)}`
}

module.exports = { sendOtpSms, sendViaTwilio, OTP_MESSAGE }
