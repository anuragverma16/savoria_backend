const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Membership = require('../models/Membership')
const Restaurant = require('../models/Restaurant')
const { assertRestaurantNotSuspended } = require('../utils/restaurantAccess')

const STAFF_CLIENT_ROLES = ['staff', 'manager', 'waiter', 'chef', 'cashier', 'custom']

function resolveClientRole(user, membership) {
  if (user?.platformRole === 'superadmin') return 'superadmin'
  if (!membership) return 'user'
  if (membership.role === 'customer') return 'user'
  if (membership.role === 'restaurant_admin') return 'admin'
  if (STAFF_CLIENT_ROLES.includes(membership.role)) return 'staff'
  if (membership.role === 'manager') return 'manager'
  return membership.role
}

const protect = async (req, res, next) => {
  let token
  try {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1]
    }
    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.id).select('-password')
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' })
    }

    req.user = user
    req.tokenPayload = decoded

    if (decoded.membershipId) {
      req.membership = await Membership.findById(decoded.membershipId)
        .populate('restaurant')
    }

    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Token invalid or expired' })
  }
}

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' })
  }
  if (req.user.platformRole === 'superadmin') {
    if (!roles.length || roles.includes('superadmin')) return next()
  }
  const role = resolveClientRole(req.user, req.membership)
  const membershipRole = req.membership?.role
  if (roles.includes(role) || (membershipRole && roles.includes(membershipRole))) {
    return next()
  }
  return res.status(403).json({ success: false, message: 'Access denied' })
}

const authorizePlatform = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' })
  }
  if (!roles.includes(req.user.platformRole)) {
    return res.status(403).json({ success: false, message: 'Platform access denied' })
  }
  next()
}

const authorizeMembership = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' })
  }
  if (req.user.platformRole === 'superadmin') return next()
  if (!req.membership || !req.membership.isActive) {
    return res.status(403).json({ success: false, message: 'No restaurant access' })
  }
  if (roles.length && !roles.includes(req.membership.role)) {
    return res.status(403).json({ success: false, message: 'Role access denied' })
  }
  next()
}

const requirePermission = (...perms) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' })
  }
  if (req.user.platformRole === 'superadmin') return next()
  if (req.membership?.role === 'restaurant_admin') return next()
  if (!req.membership) {
    return res.status(403).json({ success: false, message: 'Permission denied' })
  }
  const hasAll = perms.every((p) => req.membership.permissions.includes(p))
  if (!hasAll) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' })
  }
  next()
}

const resolveTenant = async (req, res, next) => {
  try {
    const restaurantId = req.params.restaurantId || req.headers['x-restaurant-id']

    if (!restaurantId) {
      return next()
    }

    if (req.user?.platformRole === 'superadmin') {
      const owned = await Restaurant.findOne({
        _id: restaurantId,
        createdBy: req.user._id,
      })
      if (!owned) {
        return res.status(403).json({
          success: false,
          message: 'This restaurant is not in your Super Admin account',
        })
      }
      req.restaurant = owned
      return next()
    }

    req.restaurant = await Restaurant.findById(restaurantId)
    if (!req.restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found' })
    }

    if (req.user?.platformRole !== 'superadmin') {
      try {
        assertRestaurantNotSuspended(req.restaurant)
      } catch (err) {
        return res.status(err.statusCode || 403).json({ success: false, message: err.message })
      }
    }

    if (req.user) {
      const membership = await Membership.findOne({
        user: req.user._id,
        restaurant: restaurantId,
        isActive: true,
      }).populate('restaurant', 'name slug status subscription settings createdBy')

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this restaurant',
        })
      }

      req.membership = membership
    }

    next()
  } catch {
    return res.status(500).json({ success: false, message: 'Tenant resolution failed' })
  }
}

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      req.user = await User.findById(decoded.id).select('-password')
    }
  } catch { /* optional */ }
  next()
}

module.exports = {
  protect,
  authorize,
  authorizePlatform,
  authorizeMembership,
  requirePermission,
  resolveTenant,
  optionalAuth,
}
