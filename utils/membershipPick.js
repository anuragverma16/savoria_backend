const { STAFF_ROLES, isPlatformProvisioned, canAccessAsAdmin, canAccessAsStaff } = require('./provisionAccess')

function restaurantIdOf(membership) {
  const r = membership?.restaurant
  return r?._id ? String(r._id) : r ? String(r) : null
}

function pickMembership(user, memberships = [], rawRole) {
  const active = (memberships || []).filter((m) => m.isActive !== false && restaurantIdOf(m))

  if (!active.length) return null

  const notSuspended = active.filter((m) => m.restaurant?.status !== 'suspended')
  const pool = notSuspended.length ? notSuspended : active

  if (rawRole === 'superadmin' || user?.platformRole === 'superadmin') {
    return null
  }

  if (rawRole === 'admin') {
    const admins = pool.filter((m) => m.role === 'restaurant_admin' && canAccessAsAdmin(m))
    if (!admins.length) return null
    const owned = admins.filter((m) => {
      const createdBy = m.restaurant?.createdBy
      return createdBy && String(createdBy) === String(user._id || user.id)
    })
    const adminPool = owned.length ? owned : admins
    return adminPool.sort((a, b) => new Date(b.restaurant?.createdAt || 0) - new Date(a.restaurant?.createdAt || 0))[0]
  }

  if (rawRole === 'staff') {
    return pool.find((m) => canAccessAsStaff(m)) || null
  }

  if (rawRole === 'user') {
    return pool.find((m) => m.role === 'customer') || null
  }

  return pool[0]
}

function hasRestaurantAccess(user, memberships, restaurantId) {
  if (!restaurantId) return false
  if (user?.platformRole === 'superadmin' || user?.role === 'superadmin') return true
  return (memberships || []).some(
    (m) => m.isActive !== false && restaurantIdOf(m) === String(restaurantId)
  )
}

module.exports = {
  STAFF_ROLES,
  restaurantIdOf,
  pickMembership,
  hasRestaurantAccess,
}
