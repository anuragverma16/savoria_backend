function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`
  if (digits.length === 13 && digits.startsWith('91')) return `+${digits}`
  return null
}

function maskPhone(phone) {
  const n = normalizePhone(phone)
  if (!n) return phone
  return `${n.slice(0, 3)} •••• ••${n.slice(-2)}`
}

function smsDestination(phone) {
  const n = normalizePhone(phone)
  if (!n) return null
  return n.replace('+', '')
}

function phoneLookupVariants(phoneInput) {
  const normalized = normalizePhone(phoneInput)
  if (!normalized) return []
  const digits = normalized.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  const variants = new Set([
    normalized,
    `+${digits}`,
    last10,
    `91${last10}`,
    `+91${last10}`,
  ])
  return [...variants].filter(Boolean)
}

async function findUserByPhone(phoneInput, User) {
  const variants = phoneLookupVariants(phoneInput)
  if (!variants.length) return null
  return User.findOne({ phone: { $in: variants } })
}

module.exports = { normalizePhone, maskPhone, smsDestination, phoneLookupVariants, findUserByPhone }
