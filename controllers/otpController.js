const asyncHandler = require('express-async-handler')
const User = require('../models/User')
const { sendOtp, verifyOtp } = require('../utils/otpService')
const { sendEmailOtp, verifyEmailOtp, normalizeEmail } = require('../utils/emailOtpService')
const { findOrCreatePhoneCustomer, findPhoneCustomerForLogin, findPhonePanelUserForLogin } = require('../utils/phoneAuth')
const { canAccessAsAdmin, canAccessAsStaff } = require('../utils/provisionAccess')
const { normalizePhone, findUserByPhone } = require('../utils/phoneUtils')
const { isSuperAdminPhone, ensureSuperAdminPhoneUser } = require('../utils/superAdminPhone')
const {
  generateAccessToken,
  generateRefreshToken,
} = require('../utils/tokens')
const { recordLogin } = require('../utils/loginHistory')
const Membership = require('../models/Membership')
const Restaurant = require('../models/Restaurant')
const { PROVISION } = require('../utils/provisionAccess')
const { syncUserPlatformRoleFromMemberships } = require('../utils/userPlatformRole')
const STAFF_DB_ROLES = ['staff', 'manager', 'waiter', 'chef', 'cashier', 'custom']

function mapMembershipToClientRole(user, membership) {
  if (user.platformRole === 'superadmin') return 'superadmin'
  if (!membership) return 'user'
  if (membership.role === 'customer') return 'user'
  if (membership.role === 'restaurant_admin') return 'admin'
  if (STAFF_DB_ROLES.includes(membership.role)) return 'staff'
  return 'user'
}

async function buildWhatsappAuthResponse(user, membership, res, status = 200, loginMeta = {}) {
  const superAdmin = user.platformRole === 'superadmin' || isSuperAdminPhone(user.phone)
  let activeUser = user
  if (!superAdmin) {
    activeUser = await syncUserPlatformRoleFromMemberships(user._id) || user
  }
  const clientRole = superAdmin
    ? 'superadmin'
    : mapMembershipToClientRole(activeUser, membership)

  await recordLogin({
    userId: activeUser._id,
    method: 'whatsapp_otp',
    loginRole: loginMeta.loginRole || clientRole,
    restaurantId: membership?.restaurant?._id || membership?.restaurant,
    userAgent: res.req?.headers['user-agent'],
    ip: res.req?.ip,
  })

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

  const memberships = await Membership.find({ user: user._id, isActive: true })
    .populate('restaurant', 'name slug status subscription settings createdBy')

  const { password, ...safeUser } = activeUser.toObject()

  res.status(status).json({
    success: true,
    accessToken,
    refreshToken,
    isSuperAdmin: activeUser.platformRole === 'superadmin' || isSuperAdminPhone(activeUser.phone),
    user: {
      ...safeUser,
      role: activeUser.platformRole === 'superadmin' || isSuperAdminPhone(activeUser.phone)
        ? 'superadmin'
        : mapMembershipToClientRole(activeUser, membership),
      platformRole: activeUser.platformRole === 'superadmin' || isSuperAdminPhone(activeUser.phone)
        ? 'superadmin'
        : activeUser.platformRole,
      avatar: user.initials || safeUser.avatar,
      restaurant: membership?.restaurant,
      permissions: membership?.permissions || [],
    },
    memberships,
  })
}

function handleOtpSendError(err, res) {
  if (err.statusCode === 429 && err.resendIn) {
    return res.status(429).json({
      success: false,
      message: err.message,
      resendIn: err.resendIn,
    })
  }
  if (err.statusCode) res.status(err.statusCode)
  throw err
}

exports.sendOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body
  if (!phone) {
    res.status(400)
    throw new Error('Mobile number is required')
  }

  try {
    const result = await sendOtp(phone, { channel: 'sms' })
    res.json({ success: true, ...result })
  } catch (err) {
    handleOtpSendError(err, res)
  }
})

exports.verifyOtp = asyncHandler(async (req, res) => {
  const { phone, code, name, restaurantName } = req.body
  if (!phone || !code) {
    res.status(400)
    throw new Error('Phone number and OTP are required')
  }

  const user = await verifyOtp(phone, code, { name, restaurantName }, { channel: 'sms' })
  res.json({ success: true, user })
})

function authError(message, statusCode) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

exports.sendWhatsappOtp = asyncHandler(async (req, res) => {
  const { phone, purpose = 'login', loginRole } = req.body
  if (!phone) {
    throw authError('Mobile number is required', 400)
  }

  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) {
    throw authError('Enter a valid 10-digit mobile number', 400)
  }

  if (purpose === 'login') {
    if (isSuperAdminPhone(normalizedPhone)) {
      await ensureSuperAdminPhoneUser(normalizedPhone)
    } else if (loginRole === 'admin' || loginRole === 'staff') {
      const user = await findUserByPhone(normalizedPhone, User)
      if (!user) {
        throw authError('This number is not registered. Ask your super admin to add you from the platform panel.', 404)
      }
      if (!user.isActive) {
        throw authError('Account deactivated', 403)
      }
      const memberships = await Membership.find({ user: user._id, isActive: true })
      const hasAccess = loginRole === 'admin'
        ? memberships.some((m) => canAccessAsAdmin(m))
        : memberships.some((m) => canAccessAsStaff(m))
      if (!hasAccess) {
        throw authError(
          loginRole === 'admin'
            ? 'No admin access for this number. Ask your super admin to add you from the platform panel.'
            : 'No staff access for this number. Ask your super admin to add you from the platform panel.',
          403,
        )
      }
    } else {
      const user = await findUserByPhone(normalizedPhone, User)
      if (!user) {
        throw authError('This mobile number is not registered. Please sign up first.', 404)
      }
      if (!user.isActive) {
        throw authError('Account deactivated', 403)
      }
    }
  } else if (purpose === 'signup') {
    if (isSuperAdminPhone(normalizedPhone)) {
      throw authError('This number is reserved for platform admin. Please log in instead.', 400)
    }
    const exists = await findUserByPhone(normalizedPhone, User)
    if (exists) {
      throw authError('This mobile number is already registered. Please log in instead.', 400)
    }
  }

  try {
    const result = await sendOtp(normalizedPhone, { channel: 'whatsapp' })
    res.json({ success: true, ...result })
  } catch (err) {
    handleOtpSendError(err, res)
  }
})

exports.verifyWhatsappOtp = asyncHandler(async (req, res) => {
  const { phone, code, name, restaurantName, email, purpose = 'login', loginRole } = req.body
  if (!phone || !code) {
    res.status(400)
    throw new Error('Phone number and OTP are required')
  }

  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) {
    res.status(400)
    throw new Error('Enter a valid 10-digit mobile number')
  }

  await verifyOtp(normalizedPhone, code, { name, restaurantName, email }, { channel: 'whatsapp' })

  if (purpose === 'signup') {
    if (isSuperAdminPhone(normalizedPhone)) {
      throw authError('This number is reserved for platform admin. Please log in instead.', 400)
    }
    const exists = await findUserByPhone(normalizedPhone, User)
    if (exists) {
      throw authError('This mobile number is already registered. Please log in instead.', 400)
    }
    const { user, membership } = await findOrCreatePhoneCustomer(normalizedPhone, { name, restaurantName, email })
    await buildWhatsappAuthResponse(user, membership, res, 201)
    return
  }

  let user
  let membership
  if (isSuperAdminPhone(normalizedPhone)) {
    user = await ensureSuperAdminPhoneUser(normalizedPhone)
    membership = null
  } else if (loginRole === 'admin' || loginRole === 'staff') {
    ({ user, membership } = await findPhonePanelUserForLogin(normalizedPhone, loginRole))
  } else {
    ({ user, membership } = await findPhoneCustomerForLogin(normalizedPhone))
  }
  const resolvedRole = isSuperAdminPhone(normalizedPhone)
    ? 'superadmin'
    : loginRole === 'admin'
      ? 'admin'
      : loginRole === 'staff'
        ? 'staff'
        : 'user'
  await buildWhatsappAuthResponse(user, membership, res, 200, { loginRole: resolvedRole })
})

const slugify = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

async function findRestaurantByName(input) {
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

exports.sendEmailOtp = asyncHandler(async (req, res) => {
  const { email, purpose, phone } = req.body
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    res.status(400)
    throw new Error('Enter a valid email address')
  }

  if (purpose === 'login') {
    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone) {
      res.status(400)
      throw new Error('Enter a valid 10-digit mobile number')
    }
    const user = await User.findOne({ email: normalizedEmail, phone: normalizedPhone })
    if (!user) {
      res.status(404)
      throw new Error('No account found with this email and phone number')
    }
  } else if (purpose === 'signup') {
    const exists = await User.findOne({ email: normalizedEmail })
    if (exists) {
      res.status(400)
      throw new Error('Email already registered. Please log in.')
    }
  }

  try {
    const result = await sendEmailOtp(normalizedEmail)
    res.json({ success: true, ...result })
  } catch (err) {
    handleOtpSendError(err, res)
  }
})

exports.verifyEmailSignup = asyncHandler(async (req, res) => {
  const { email, phone, code, name, restaurantName, password } = req.body
  const normalizedEmail = normalizeEmail(email)
  const normalizedPhone = normalizePhone(phone)

  if (!normalizedEmail || !normalizedPhone || !code || !name?.trim() || !restaurantName?.trim() || !password) {
    res.status(400)
    throw new Error('Name, email, phone, restaurant, password and verification code are required')
  }

  if (String(password).length < 6) {
    res.status(400)
    throw new Error('Password must be at least 6 characters')
  }

  await verifyEmailOtp(normalizedEmail, code)

  const exists = await User.findOne({ email: normalizedEmail })
  if (exists) {
    res.status(400)
    throw new Error('Email already registered')
  }

  const restaurant = await findRestaurantByName(restaurantName)
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found. Enter the restaurant name you dine at.')
  }

  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    phone: normalizedPhone,
    password,
    platformRole: 'customer',
  })

  const membership = await Membership.create({
    user: user._id,
    restaurant: restaurant._id,
    role: 'customer',
    provisionedBy: PROVISION.SELF,
  })
  await membership.populate('restaurant')

  const syncedUser = await syncUserPlatformRoleFromMemberships(user._id)

  await buildWhatsappAuthResponse(syncedUser || user, membership, res, 201)
})

exports.verifyEmailLogin = asyncHandler(async (req, res) => {
  res.status(403)
  throw new Error('Email login is disabled. Sign in with WhatsApp OTP using your mobile number.')
})
