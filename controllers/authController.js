const asyncHandler = require('express-async-handler')
const User = require('../models/User')
const Restaurant = require('../models/Restaurant')
const Membership = require('../models/Membership')
const {
  generateAccessToken,
  generateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  verifyRefreshToken,
} = require('../utils/tokens')
const { normalizePhone } = require('../utils/phoneUtils')

const slugify = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const findRestaurant = async (input) => {
  if (!input?.trim()) return null
  const q = input.trim()
  const slug = slugify(q)
  return Restaurant.findOne({
    $or: [
      { slug },
      { name: { $regex: new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
      ...(q.match(/^[a-f0-9]{24}$/i) ? [{ _id: q }] : []),
    ],
    status: { $in: ['active', 'pending'] },
  })
}

const STAFF_DB_ROLES = ['staff', 'manager', 'waiter', 'chef', 'cashier', 'custom']
const { pickMembership } = require('../utils/membershipPick')
const { assertRestaurantNotSuspended } = require('../utils/restaurantAccess')
const { canAccessAsAdmin, canAccessAsStaff, PROVISION } = require('../utils/provisionAccess')
const { syncUserPlatformRoleFromMemberships } = require('../utils/userPlatformRole')
const { isSuperAdminPhone } = require('../utils/superAdminPhone')

const mapMembershipToClientRole = (user, membership) => {
  if (user.platformRole === 'superadmin' || isSuperAdminPhone(user.phone)) return 'superadmin'
  if (!membership) return 'user'
  if (membership.role === 'customer') return 'user'
  if (membership.role === 'restaurant_admin') return 'admin'
  if (STAFF_DB_ROLES.includes(membership.role)) return 'staff'
  return 'user'
}

const normalizeRole = (role) => {
  if (role === 'admin') return 'restaurant_admin'
  if (role === 'user') return 'customer'
  return role
}

const buildAuthResponse = async (user, membership = null, res, status = 200, membershipsOverride = null) => {
  let activeUser = user
  if (user.platformRole !== 'superadmin') {
    activeUser = await syncUserPlatformRoleFromMemberships(user._id) || user
  }

  const superAdmin = activeUser.platformRole === 'superadmin' || isSuperAdminPhone(activeUser.phone)

  const payload = {
    id: activeUser._id,
    platformRole: superAdmin ? 'superadmin' : activeUser.platformRole,
    membershipId: membership?._id,
    restaurantId: membership?.restaurant?._id || membership?.restaurant,
    staffRole: membership?.role,
  }

  const accessToken = generateAccessToken(payload)
  const refreshToken = await generateRefreshToken(user._id, {
    userAgent: res.req?.headers['user-agent'],
    ip: res.req?.ip,
  })

  const allMemberships = membershipsOverride || await Membership.find({ user: user._id, isActive: true })
    .populate('restaurant', 'name slug status subscription settings createdBy')

  const memberships = superAdmin
    ? allMemberships
    : membership
      ? [membership]
      : allMemberships

  const { password, ...safeUser } = activeUser.toObject()

  res.status(status).json({
    success: true,
    accessToken,
    refreshToken,
    user: {
      ...safeUser,
      role: superAdmin ? 'superadmin' : mapMembershipToClientRole(activeUser, membership),
      platformRole: superAdmin ? 'superadmin' : activeUser.platformRole,
      avatar: user.initials || safeUser.avatar,
      restaurant: membership?.restaurant,
      permissions: membership?.permissions || [],
    },
    memberships,
  })
}

exports.login = asyncHandler(async (req, res) => {
  res.status(403)
  throw new Error('Password login is disabled. Sign in with WhatsApp OTP using your registered mobile number.')
})

exports.register = asyncHandler(async (req, res) => {
  res.status(403)
  throw new Error('Sign up with WhatsApp OTP using your mobile number.')
})

exports.refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) {
    res.status(400)
    throw new Error('Refresh token required')
  }

  const doc = await verifyRefreshToken(refreshToken)
  if (!doc) {
    res.status(401)
    throw new Error('Invalid refresh token')
  }

  const user = doc.user
  let membership = null
  if (req.body.membershipId) {
    membership = await Membership.findById(req.body.membershipId).populate('restaurant')
  }

  await revokeRefreshToken(refreshToken)
  await buildAuthResponse(user, membership, res)
})

exports.getMe = asyncHandler(async (req, res) => {
  let user = await User.findById(req.user._id)
  if (user?.platformRole !== 'superadmin' && !isSuperAdminPhone(user?.phone)) {
    user = await syncUserPlatformRoleFromMemberships(user._id) || user
  }
  const memberships = await Membership.find({ user: user._id, isActive: true })
    .populate('restaurant', 'name slug status subscription settings')

  const superAdmin = user.platformRole === 'superadmin' || isSuperAdminPhone(user.phone)
  const { password, ...safeUser } = user.toObject()
  res.json({
    success: true,
    user: {
      ...safeUser,
      role: superAdmin ? 'superadmin' : mapMembershipToClientRole(user, req.membership),
      platformRole: superAdmin ? 'superadmin' : user.platformRole,
      permissions: req.membership?.permissions || [],
    },
    memberships,
    activeMembership: req.membership,
  })
})

exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, email } = req.body
  const user = await User.findById(req.user._id)
  if (!user) {
    res.status(404)
    throw new Error('User not found')
  }

  if (name !== undefined) {
    const trimmed = String(name).trim()
    if (!trimmed) {
      res.status(400)
      throw new Error('Name is required')
    }
    user.name = trimmed
  }

  if (email !== undefined) {
    const normalized = String(email).trim().toLowerCase()
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      res.status(400)
      throw new Error('Enter a valid email address')
    }
    const taken = await User.findOne({ email: normalized, _id: { $ne: user._id } })
    if (taken) {
      res.status(400)
      throw new Error('This email is already registered to another account')
    }
    user.email = normalized
  }

  await user.save()

  let activeUser = user
  if (user.platformRole !== 'superadmin' && !isSuperAdminPhone(user.phone)) {
    activeUser = await syncUserPlatformRoleFromMemberships(user._id) || user
  }

  const memberships = await Membership.find({ user: user._id, isActive: true })
    .populate('restaurant', 'name slug status subscription settings createdBy')

  const superAdmin = activeUser.platformRole === 'superadmin' || isSuperAdminPhone(activeUser.phone)
  const membership = req.membership
    || memberships.find((m) => m.isActive !== false)
    || null

  const { password, ...safeUser } = activeUser.toObject()
  res.json({
    success: true,
    user: {
      ...safeUser,
      role: superAdmin ? 'superadmin' : mapMembershipToClientRole(activeUser, membership),
      platformRole: superAdmin ? 'superadmin' : activeUser.platformRole,
      avatar: activeUser.initials || safeUser.avatar,
      permissions: membership?.permissions || [],
    },
    memberships,
  })
})

exports.logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body
  if (refreshToken) await revokeRefreshToken(refreshToken)
  res.json({ success: true, message: 'Logged out' })
})

exports.switchRestaurant = asyncHandler(async (req, res) => {
  const { restaurantId } = req.body
  const membership = await Membership.findOne({
    user: req.user._id,
    restaurant: restaurantId,
    isActive: true,
  }).populate('restaurant')

  if (!membership && req.user.platformRole !== 'superadmin') {
    res.status(403)
    throw new Error('Access denied to this restaurant')
  }

  if (membership) {
    assertRestaurantNotSuspended(membership.restaurant, res)
  }

  await buildAuthResponse(req.user, membership, res)
})

exports.impersonate = asyncHandler(async (req, res) => {
  if (req.user.platformRole !== 'superadmin') {
    res.status(403)
    throw new Error('Super admin only')
  }

  const restaurant = await Restaurant.findById(req.params.restaurantId)
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  const membership = await Membership.findOne({
    restaurant: restaurant._id,
    role: 'restaurant_admin',
    isActive: true,
  }).populate('restaurant')

  res.json({
    success: true,
    restaurant,
    impersonation: true,
    accessPath: `/restaurant/${restaurant._id}/admin`,
    membership,
  })
})
