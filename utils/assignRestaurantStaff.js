const User = require('../models/User')
const Membership = require('../models/Membership')
const { normalizePhone } = require('./phoneUtils')
const { STAFF_ROLES, PROVISION } = require('./provisionAccess')
const { setUserPlatformRole } = require('./userPlatformRole')

async function assignRestaurantStaff({
  restaurantId,
  name,
  email,
  password,
  phone,
  role: staffRole = 'staff',
  customRoleName = '',
}) {
  if (!name?.trim() || !email?.trim()) {
    const err = new Error('Staff name and email are required')
    err.statusCode = 400
    throw err
  }

  if (!STAFF_ROLES.includes(staffRole)) {
    const err = new Error('Invalid staff role')
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
    const err = new Error('Cannot assign a super admin as staff')
    err.statusCode = 400
    throw err
  }

  const existingMembership = user
    ? await Membership.findOne({ user: user._id, restaurant: restaurantId })
    : null

  if (existingMembership?.isActive && existingMembership.role === 'restaurant_admin') {
    const err = new Error('This user is already a restaurant admin')
    err.statusCode = 400
    throw err
  }

  if (existingMembership?.isActive && STAFF_ROLES.includes(existingMembership.role)) {
    const err = new Error('This user is already staff for this restaurant')
    err.statusCode = 400
    throw err
  }

  if (!user) {
    if (!password || String(password).length < 6) {
      const err = new Error('Password or verified email code is required for new staff')
      err.statusCode = 400
      throw err
    }
    user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      phone: normalizedPhone,
      platformRole: 'staff',
    })
  } else {
    if (name?.trim()) user.name = name.trim()
    user.phone = normalizedPhone
    if (password && String(password).length >= 6) user.password = password
    await user.save()
    await setUserPlatformRole(user, 'staff')
  }

  let membership = existingMembership
  if (membership) {
    membership.role = staffRole
    membership.customRoleName = staffRole === 'custom' ? (customRoleName || '') : ''
    membership.provisionedBy = PROVISION.PLATFORM
    membership.isActive = true
    await membership.save()
  } else {
    membership = await Membership.create({
      user: user._id,
      restaurant: restaurantId,
      role: staffRole,
      customRoleName: staffRole === 'custom' ? (customRoleName || '') : '',
      provisionedBy: PROVISION.PLATFORM,
    })
  }

  await membership.populate('user', 'name email phone isActive lastLogin platformRole')

  return { user: await User.findById(user._id), membership }
}

module.exports = { assignRestaurantStaff }
