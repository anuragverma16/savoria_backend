const crypto = require('crypto')
const User = require('../models/User')
const Membership = require('../models/Membership')
const Restaurant = require('../models/Restaurant')
const { normalizePhone, phoneLookupVariants } = require('./phoneUtils')
const { PROVISION } = require('./provisionAccess')
const { setUserPlatformRole, syncUserPlatformRoleFromMemberships } = require('./userPlatformRole')

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
    await syncUserPlatformRoleFromMemberships(user._id)
    user = await User.findById(user._id)
  }

  let membership = null

  if (restaurantName) {
    const restaurant = await findRestaurant(restaurantName)
    if (!restaurant) {
      const err = new Error('Restaurant not found. Enter the restaurant name you dine at.')
      err.statusCode = 404
      throw err
    }

    membership = await Membership.findOne({
      user: user._id,
      restaurant: restaurant._id,
      isActive: true,
    }).populate('restaurant')

    if (!membership) {
      membership = await Membership.create({
        user: user._id,
        restaurant: restaurant._id,
        role: 'customer',
        provisionedBy: PROVISION.SELF,
      })
      await membership.populate('restaurant')
    }
    await syncUserPlatformRoleFromMemberships(user._id)
    user = await User.findById(user._id)
  } else {
    membership = await Membership.findOne({ user: user._id, isActive: true })
      .populate('restaurant', 'name slug status subscription settings createdBy')
  }

  return { user, membership }
}

async function findPhoneCustomerForLogin(phoneInput) {
  const phone = normalizePhone(phoneInput)
  if (!phone) {
    const err = new Error('Invalid phone number')
    err.statusCode = 400
    throw err
  }

  const user = await User.findOne({ phone: { $in: phoneLookupVariants(phoneInput) } })
  if (!user) {
    const err = new Error('This number is not registered. Please sign up first.')
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

  const membership = await Membership.findOne({ user: user._id, isActive: true })
    .populate('restaurant', 'name slug status subscription settings createdBy')

  return { user, membership }
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
    const err = new Error('This number is not registered. Ask your super admin to add you.')
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
      const err = new Error('No admin access for this number. Contact your super admin.')
      err.statusCode = 403
      throw err
    }
  } else if (loginRole === 'staff') {
    membership = memberships.find((m) => canAccessAsStaff(m))
    if (!membership) {
      const err = new Error('No staff access for this number. Contact your super admin.')
      err.statusCode = 403
      throw err
    }
  }

  user.lastLogin = new Date()
  await user.save({ validateBeforeSave: false })
  await setUserPlatformRole(user, loginRole === 'admin' ? 'admin' : 'staff')

  return { user, membership }
}

module.exports = { findOrCreatePhoneCustomer, findPhoneCustomerForLogin, findPhonePanelUserForLogin }
