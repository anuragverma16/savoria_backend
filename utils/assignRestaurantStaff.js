const Membership = require('../models/Membership')
const { STAFF_ROLES, PROVISION } = require('./provisionAccess')
const { syncUserPlatformRoleFromMemberships } = require('./userPlatformRole')
const { resolveProvisionUser } = require('./provisionUserValidation')

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

  const user = await resolveProvisionUser({
    email,
    phone,
    name,
    password,
    platformRole: 'staff',
  })

  const existingMembership = await Membership.findOne({ user: user._id, restaurant: restaurantId })

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

  await membership.populate('user', 'name email phone isActive lastLogin')

  const syncedUser = await syncUserPlatformRoleFromMemberships(user._id)

  return { user: syncedUser || user, membership }
}

module.exports = { assignRestaurantStaff }
