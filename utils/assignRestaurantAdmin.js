const User = require('../models/User')
const Membership = require('../models/Membership')
const { PROVISION } = require('./provisionAccess')
const { syncUserPlatformRoleFromMemberships } = require('./userPlatformRole')
const { resolveProvisionUser } = require('./provisionUserValidation')

async function assignRestaurantAdmin({ restaurantId, name, email, password, phone }) {
  if (!name?.trim() || !email?.trim()) {
    const err = new Error('Admin name and email are required')
    err.statusCode = 400
    throw err
  }

  const user = await resolveProvisionUser({
    email,
    phone,
    name,
    password,
    platformRole: 'admin',
  })

  const existingMembership = await Membership.findOne({ user: user._id, restaurant: restaurantId })

  if (existingMembership?.isActive && existingMembership.role === 'restaurant_admin') {
    const err = new Error('This user is already an admin for this restaurant')
    err.statusCode = 400
    throw err
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

  await membership.populate('user', 'name email phone isActive')

  const syncedUser = await syncUserPlatformRoleFromMemberships(user._id)

  return { user: syncedUser || user, membership }
}

module.exports = { assignRestaurantAdmin }
