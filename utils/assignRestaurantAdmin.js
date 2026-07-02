const User = require('../models/User')
const Membership = require('../models/Membership')
const { normalizePhone } = require('./phoneUtils')
const { PROVISION } = require('./provisionAccess')
const { setUserPlatformRole } = require('./userPlatformRole')

async function assignRestaurantAdmin({ restaurantId, name, email, password, phone }) {
  if (!name?.trim() || !email?.trim()) {
    const err = new Error('Admin name and email are required')
    err.statusCode = 400
    throw err
  }

  const normalizedEmail = String(email).toLowerCase().trim()
  const normalizedPhone = phone ? normalizePhone(phone) : null
  if (!normalizedPhone) {
    const err = new Error('Valid phone number is required')
    err.statusCode = 400
    throw err
  }

  let user = await User.findOne({ email: normalizedEmail })

  if (user?.platformRole === 'superadmin') {
    const err = new Error('Cannot assign a super admin as restaurant admin')
    err.statusCode = 400
    throw err
  }

  const existingMembership = user
    ? await Membership.findOne({ user: user._id, restaurant: restaurantId })
    : null

  if (existingMembership?.isActive && existingMembership.role === 'restaurant_admin') {
    const err = new Error('This user is already an admin for this restaurant')
    err.statusCode = 400
    throw err
  }

  if (!user) {
    if (!password || String(password).length < 6) {
      const err = new Error('Password or verified email code is required for new admin')
      err.statusCode = 400
      throw err
    }
    user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      phone: normalizedPhone,
      platformRole: 'admin',
    })
  } else {
    if (name?.trim()) user.name = name.trim()
    user.phone = normalizedPhone
    if (password && String(password).length >= 6) user.password = password
    await user.save()
    await setUserPlatformRole(user, 'admin')
  }

  let membership = existingMembership
  if (membership) {
    membership.role = 'restaurant_admin'
    membership.provisionedBy = PROVISION.PLATFORM
    membership.isActive = true
    await membership.save()
  } else {
    membership = await Membership.create({
      user: user._id,
      restaurant: restaurantId,
      role: 'restaurant_admin',
      provisionedBy: PROVISION.PLATFORM,
    })
  }

  await membership.populate('user', 'name email phone isActive platformRole')

  return { user: await User.findById(user._id), membership }
}

module.exports = { assignRestaurantAdmin }
