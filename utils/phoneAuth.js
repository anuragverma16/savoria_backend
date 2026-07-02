const crypto = require('crypto')
const User = require('../models/User')
const Membership = require('../models/Membership')
const Restaurant = require('../models/Restaurant')
const { normalizePhone, phoneLookupVariants } = require('./phoneUtils')
const { PROVISION } = require('./provisionAccess')
const { syncUserPlatformRoleFromMemberships } = require('./userPlatformRole')

const slugify = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

async function findRestaurant(input) {
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

async function ensureCustomerMembership(userId, restaurant) {
  if (!userId || !restaurant?._id) return null
  let membership = await Membership.findOne({
    user: userId,
    restaurant: restaurant._id,
    isActive: true,
  }).populate('restaurant', 'name slug status subscription settings createdBy')

  if (!membership) {
    membership = await Membership.create({
      user: userId,
      restaurant: restaurant._id,
      role: 'customer',
      provisionedBy: PROVISION.SELF,
    })
    await membership.populate('restaurant', 'name slug status subscription settings createdBy')
  }
  return membership
}

async function findOrCreatePhoneCustomer(phoneInput, profile = {}) {
  const phone = normalizePhone(phoneInput)
  if (!phone) {
    const err = new Error('Invalid phone number')
    err.statusCode = 400
    throw err
  }

  const name = String(profile.name || '').trim()
  const email = String(profile.email || '').trim().toLowerCase()
  const restaurantName = String(profile.restaurantName || '').trim()
  const restaurantId = String(profile.restaurantId || '').trim()
  const digits = phone.replace(/\D/g, '')

  let user = await User.findOne({ phone: { $in: phoneLookupVariants(phoneInput) } })
  if (!user) {
    user = await User.create({
      name: name || `Guest ${digits.slice(-4)}`,
      email: email && email.includes('@') ? email : `phone+${digits}@users.savoria.local`,
      password: crypto.randomBytes(24).toString('hex'),
      phone,
      platformRole: 'customer',
    })
  } else {
    if (name && (/^Guest\s/i.test(user.name) || !user.name?.trim())) {
      user.name = name
    }
    if (email && email.includes('@') && !email.endsWith('@users.savoria.local')) {
      const taken = await User.findOne({ email, _id: { $ne: user._id } })
      if (!taken) user.email = email
    }
    if (!user.phone) user.phone = phone
    user.lastLogin = new Date()
    await user.save()
  }

  let membership = null
  let restaurant = null

  if (restaurantId && restaurantId.match(/^[a-f0-9]{24}$/i)) {
    restaurant = await Restaurant.findOne({ _id: restaurantId, status: { $in: ['active', 'pending'] } })
    if (!restaurant) {
      const err = new Error('Restaurant not found for this QR session.')
      err.statusCode = 404
      throw err
    }
    membership = await ensureCustomerMembership(user._id, restaurant)
  } else if (restaurantName) {
    restaurant = await findRestaurant(restaurantName)
    if (!restaurant) {
      const err = new Error('Restaurant not found. Enter the restaurant name you dine at.')
      err.statusCode = 404
      throw err
    }
    membership = await ensureCustomerMembership(user._id, restaurant)
  } else {
    membership = await Membership.findOne({ user: user._id, isActive: true })
      .populate('restaurant', 'name slug status subscription settings createdBy')
  }

  user = await syncUserPlatformRoleFromMemberships(user._id)

  return { user, membership }
}

async function findPhoneCustomerForLogin(phoneInput, profile = {}) {
  const phone = normalizePhone(phoneInput)
  if (!phone) {
    const err = new Error('Invalid phone number')
    err.statusCode = 400
    throw err
  }

  const user = await User.findOne({ phone: { $in: phoneLookupVariants(phoneInput) } })
  if (!user) {
    const err = new Error('This mobile number is not registered. Please sign up first.')
    err.statusCode = 404
    throw err
  }

  if (!user.isActive) {
    const err = new Error('Account deactivated')
    err.statusCode = 403
    throw err
  }

  user.lastLogin = new Date()
  await user.save({ validateBeforeSave: false })

  const restaurantId = String(profile.restaurantId || '').trim()
  let membership = null

  if (restaurantId && restaurantId.match(/^[a-f0-9]{24}$/i)) {
    const restaurant = await Restaurant.findOne({ _id: restaurantId, status: { $in: ['active', 'pending'] } })
    if (restaurant) {
      membership = await ensureCustomerMembership(user._id, restaurant)
    }
  }

  if (!membership) {
    membership = await Membership.findOne({ user: user._id, isActive: true })
      .populate('restaurant', 'name slug status subscription settings createdBy')
  }

  const synced = await syncUserPlatformRoleFromMemberships(user._id)

  return { user: synced || user, membership }
}

const { canAccessAsAdmin, canAccessAsStaff } = require('./provisionAccess')

async function findPhonePanelUserForLogin(phoneInput, loginRole) {
  const phone = normalizePhone(phoneInput)
  if (!phone) {
    const err = new Error('Invalid phone number')
    err.statusCode = 400
    throw err
  }

  const user = await User.findOne({ phone: { $in: phoneLookupVariants(phoneInput) } })
  if (!user) {
    const err = new Error('This mobile number is not registered. Ask your super admin to add you from the platform panel.')
    err.statusCode = 404
    throw err
  }

  if (!user.isActive) {
    const err = new Error('Account deactivated')
    err.statusCode = 403
    throw err
  }

  const memberships = await Membership.find({ user: user._id, isActive: true })
    .populate('restaurant', 'name slug status subscription settings createdBy')

  let membership = null
  if (loginRole === 'admin') {
    membership = memberships.find((m) => canAccessAsAdmin(m))
    if (!membership) {
      const err = new Error('No admin access for this number. Ask your super admin to add you from the platform panel.')
      err.statusCode = 403
      throw err
    }
  } else if (loginRole === 'staff') {
    membership = memberships.find((m) => canAccessAsStaff(m))
    if (!membership) {
      const err = new Error('No staff access for this number. Ask your super admin to add you from the platform panel.')
      err.statusCode = 403
      throw err
    }
  }

  user.lastLogin = new Date()
  await user.save({ validateBeforeSave: false })

  const synced = await syncUserPlatformRoleFromMemberships(user._id)

  return { user: synced || user, membership }
}

module.exports = { findOrCreatePhoneCustomer, findPhoneCustomerForLogin, findPhonePanelUserForLogin }
