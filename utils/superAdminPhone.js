const User = require('../models/User')
const { normalizePhone, phoneLookupVariants } = require('./phoneUtils')
const { SUPERADMIN_PHONE_DIGITS } = require('./superAdminConstants')

function isSuperAdminPhone(phoneInput) {
  const normalized = normalizePhone(phoneInput)
  if (!normalized) return false
  return normalized.replace(/\D/g, '').endsWith(SUPERADMIN_PHONE_DIGITS)
}

async function ensureSuperAdminPhoneUser(phoneInput) {
  const phone = normalizePhone(phoneInput)
  if (!phone || !isSuperAdminPhone(phoneInput)) {
    const err = new Error('Invalid super admin phone')
    err.statusCode = 400
    throw err
  }

  const { ensureSuperAdmin } = require('./ensureSuperAdmin')
  const admin = await ensureSuperAdmin()
  const variants = phoneLookupVariants(phoneInput)

  await User.updateMany(
    { phone: { $in: variants }, _id: { $ne: admin._id } },
    { $unset: { phone: 1 } },
  )

  let changed = false
  if (admin.phone !== phone) {
    admin.phone = phone
    changed = true
  }
  if (admin.platformRole !== 'superadmin') {
    admin.platformRole = 'superadmin'
    changed = true
  }
  if (changed) await admin.save()

  admin.lastLogin = new Date()
  await admin.save({ validateBeforeSave: false })

  return admin
}

module.exports = {
  SUPERADMIN_PHONE_DIGITS,
  isSuperAdminPhone,
  ensureSuperAdminPhoneUser,
}
