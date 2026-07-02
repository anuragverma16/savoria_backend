const STAFF_ROLES = ['manager', 'waiter', 'chef', 'cashier', 'staff', 'custom']

const PROVISION = {
  PLATFORM: 'platform',
  RESTAURANT: 'restaurant',
  SELF: 'self',
}

function isPlatformProvisioned(membership) {
  if (!membership) return false
  if (membership.provisionedBy === PROVISION.PLATFORM) return true
  // Legacy restaurant admins were only created by Super Admin
  if (!membership.provisionedBy && membership.role === 'restaurant_admin') return true
  return false
}

function canAccessAsAdmin(membership) {
  return membership?.role === 'restaurant_admin' && isPlatformProvisioned(membership)
}

function canAccessAsStaff(membership) {
  return STAFF_ROLES.includes(membership?.role) && isPlatformProvisioned(membership)
}

module.exports = {
  STAFF_ROLES,
  PROVISION,
  isPlatformProvisioned,
  canAccessAsAdmin,
  canAccessAsStaff,
}
