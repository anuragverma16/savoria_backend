const User = require('../models/User')
const { normalizePhone, phoneLookupVariants } = require('./phoneUtils')
const { SUPERADMIN_PHONE_DIGITS } = require('./superAdminConstants')

const DEFAULT_SUPERADMIN = {
  name: 'DineFlow Super Admin',
  email: 'superadmin@dineflow.com',
  password: 'super123',
  platformRole: 'superadmin',
  phone: `+91${SUPERADMIN_PHONE_DIGITS}`,
}

async function ensureSuperAdmin() {
  const email = DEFAULT_SUPERADMIN.email.toLowerCase()
  const existing = await User.findOne({ email })

  if (existing) {
    let changed = false
    if (existing.platformRole !== 'superadmin') {
      existing.platformRole = 'superadmin'
      changed = true
    }
    const superPhone = normalizePhone(DEFAULT_SUPERADMIN.phone)
    if (superPhone) {
      const variants = phoneLookupVariants(superPhone)
      await User.updateMany(
        { phone: { $in: variants }, _id: { $ne: existing._id } },
        { $unset: { phone: 1 } },
      )
      if (existing.phone !== superPhone) {
        existing.phone = superPhone
        changed = true
      }
    }
    if (changed) {
      await existing.save()
      console.log('✅ Updated existing user to Super Admin:', email)
    }
    return existing
  }

  const superPhone = normalizePhone(DEFAULT_SUPERADMIN.phone)
  if (superPhone) {
    const variants = phoneLookupVariants(superPhone)
    await User.updateMany({ phone: { $in: variants } }, { $unset: { phone: 1 } })
  }

  const user = await User.create(DEFAULT_SUPERADMIN)
  console.log('✅ Super Admin created:', email, '(password: super123)')
  return user
}

module.exports = { ensureSuperAdmin, DEFAULT_SUPERADMIN }
