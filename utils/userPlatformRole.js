const User = require('../models/User')
const Membership = require('../models/Membership')

const STAFF_DB_ROLES = ['staff', 'manager', 'waiter', 'chef', 'cashier', 'custom']
const ROLE_PRIORITY = { superadmin: 4, admin: 3, staff: 2, customer: 1 }

function platformRoleForMembership(membership) {
  if (!membership?.isActive) return null
  if (membership.role === 'restaurant_admin') return 'admin'
  if (membership.role === 'customer') return 'customer'
  if (STAFF_DB_ROLES.includes(membership.role)) return 'staff'
  return 'customer'
}

function resolvePlatformRoleFromMemberships(memberships = []) {
  let best = 'customer'
  for (const membership of memberships) {
    const role = platformRoleForMembership(membership)
    if (!role) continue
    if ((ROLE_PRIORITY[role] || 0) > (ROLE_PRIORITY[best] || 0)) {
      best = role
    }
  }
  return best
}

async function setUserPlatformRole(user, role) {
  if (!user || user.platformRole === 'superadmin') return user
  if (!role || user.platformRole === role) return user
  user.platformRole = role
  await user.save({ validateBeforeSave: false })
  return user
}

async function syncUserPlatformRoleFromMemberships(userId) {
  const user = await User.findById(userId)
  if (!user || user.platformRole === 'superadmin') return user

  const memberships = await Membership.find({ user: userId, isActive: true })
  const nextRole = resolvePlatformRoleFromMemberships(memberships)
  return setUserPlatformRole(user, nextRole)
}

async function syncAllUserPlatformRoles() {
  const users = await User.find({ platformRole: { $ne: 'superadmin' } })
  let updated = 0
  for (const user of users) {
    const memberships = await Membership.find({ user: user._id, isActive: true })
    const nextRole = resolvePlatformRoleFromMemberships(memberships)
    if (user.platformRole !== nextRole) {
      user.platformRole = nextRole
      await user.save({ validateBeforeSave: false })
      updated += 1
    }
  }
  return updated
}

module.exports = {
  STAFF_DB_ROLES,
  platformRoleForMembership,
  resolvePlatformRoleFromMemberships,
  setUserPlatformRole,
  syncUserPlatformRoleFromMemberships,
  syncAllUserPlatformRoles,
}
