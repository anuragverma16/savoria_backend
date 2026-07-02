const asyncHandler = require('express-async-handler')
const mongoose = require('mongoose')
const User = require('../models/User')
const Restaurant = require('../models/Restaurant')
const Membership = require('../models/Membership')
const Order = require('../models/Order')
const Table = require('../models/Table')
const MenuItem = require('../models/MenuItem')
const { myRestaurantQuery } = require('../utils/platformOwnership')
const { assignRestaurantAdmin } = require('../utils/assignRestaurantAdmin')
const { assignRestaurantStaff } = require('../utils/assignRestaurantStaff')
const { PROVISION } = require('../utils/provisionAccess')
const { sendEmailOtp, normalizeEmail } = require('../utils/emailOtpService')
const { resolvePlatformProvision } = require('../utils/provisionCredentials')
const { sendOtp, verifyOtp } = require('../utils/otpService')
const { assertProvisionPhone } = require('../utils/provisionUserValidation')
const { read: readIdempotent, write: writeIdempotent, idempotencyKey } = require('../utils/idempotency')
const { aggregateRestaurantUserCounts, deactivateOrphanMemberships, EMPTY_COUNTS } = require('../utils/restaurantUserCounts')
const LoginHistory = require('../models/LoginHistory')

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function assertProvisionPhoneVerified(phone, otpCode) {
  const code = String(otpCode || '').trim()
  if (!/^\d{6}$/.test(code)) {
    const err = new Error('Enter the 6-digit WhatsApp verification code')
    err.statusCode = 400
    throw err
  }
  await verifyOtp(phone, code, {}, { channel: 'whatsapp' })
}

const slugify = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

async function uniqueSlug(base) {
  const root = slugify(base) || 'restaurant'
  let slug = root
  let n = 0
  while (await Restaurant.findOne({ slug })) {
    n += 1
    slug = `${root}-${n}`
  }
  return slug
}

const getMyRestaurantIds = async (userId) => Restaurant.find(myRestaurantQuery(userId)).distinct('_id')

const toObjectIds = (ids) => ids.map((id) => new mongoose.Types.ObjectId(String(id)))

exports.getOverview = asyncHandler(async (req, res) => {
  const myIds = await getMyRestaurantIds(req.user._id)
  const restaurantFilter = myIds.length ? { _id: { $in: myIds } } : { _id: null }
  const orderFilter = myIds.length ? { restaurant: { $in: toObjectIds(myIds) } } : { restaurant: null }
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalRestaurants,
    activeRestaurants,
    suspendedRestaurants,
    totalOrders,
    revenueAgg,
    planBreakdown,
    recentRestaurants,
    statusBreakdown,
    dailyRevenue,
    topItems,
    menuItems,
    tables,
  ] = await Promise.all([
    Restaurant.countDocuments(restaurantFilter),
    Restaurant.countDocuments({ ...restaurantFilter, status: 'active' }),
    Restaurant.countDocuments({ ...restaurantFilter, status: 'suspended' }),
    Order.countDocuments(orderFilter),
    Order.aggregate([
      { $match: orderFilter },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),
    Restaurant.aggregate([
      { $match: restaurantFilter },
      { $group: { _id: '$subscription.plan', count: { $sum: 1 } } },
    ]),
    Restaurant.find(restaurantFilter).sort({ createdAt: -1 }).limit(5).select('name slug status subscription stats createdAt'),
    Order.aggregate([
      { $match: orderFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { ...orderFilter, createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$total' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: orderFilter },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', qty: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
      { $sort: { qty: -1 } },
      { $limit: 8 },
    ]),
    myIds.length ? MenuItem.countDocuments({ restaurant: { $in: myIds } }) : 0,
    myIds.length ? Table.countDocuments({ restaurant: { $in: myIds }, isActive: true }) : 0,
  ])

  const staffCount = myIds.length
    ? await Membership.countDocuments({
        restaurant: { $in: myIds },
        role: { $nin: ['restaurant_admin', 'customer'] },
        provisionedBy: PROVISION.PLATFORM,
        isActive: true,
      })
    : 0
  const customerCount = myIds.length
    ? await Membership.countDocuments({ restaurant: { $in: myIds }, role: 'customer', isActive: true })
    : 0

  res.json({
    success: true,
    overview: {
      totalRestaurants,
      activeRestaurants,
      suspendedRestaurants,
      activeSubscriptions: activeRestaurants,
      totalCustomers: customerCount,
      totalStaff: staffCount,
      totalOrders,
      totalRevenue: revenueAgg[0]?.total || 0,
      avgOrderValue: totalOrders ? Math.round((revenueAgg[0]?.total || 0) / totalOrders) : 0,
      planBreakdown: planBreakdown.reduce((a, p) => ({ ...a, [p._id || 'free']: p.count }), {}),
      statusBreakdown: statusBreakdown.reduce((a, s) => ({ ...a, [s._id]: s.count }), {}),
      dailyRevenue,
      topItems,
      menuItems,
      tables,
      recentRestaurants,
    },
  })
})

exports.getRestaurants = asyncHandler(async (req, res) => {
  const { status, plan, search, page = 1, limit = 20 } = req.query
  const filter = { ...myRestaurantQuery(req.user._id) }

  if (status) filter.status = status
  if (plan) filter['subscription.plan'] = plan
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ]
  }

  const skip = (Number(page) - 1) * Number(limit)
  const total = await Restaurant.countDocuments(filter)
  const restaurants = await Restaurant.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))

  const restaurantIds = restaurants.map((r) => r._id)
  await deactivateOrphanMemberships(restaurantIds)
  const userCountsByRestaurant = await aggregateRestaurantUserCounts(restaurantIds)

  const restaurantsWithUsers = restaurants.map((r) => {
    const counts = userCountsByRestaurant[String(r._id)] || { ...EMPTY_COUNTS }
    const hasAdmin = counts.admins > 0
    const hasStaff = counts.staff > 0
    const hasCustomer = counts.customers > 0

    return {
      ...r.toObject(),
      userCounts: counts,
      provisionHints: {
        needsAdmin: !hasAdmin,
        needsStaff: !hasStaff,
        hasCustomer,
      },
    }
  })

  res.json({ success: true, total, page: Number(page), restaurants: restaurantsWithUsers })
})

exports.sendProvisionEmailOtp = asyncHandler(async (req, res) => {
  const { email } = req.body
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    res.status(400)
    throw new Error('Enter a valid email address')
  }

  try {
    const result = await sendEmailOtp(normalizedEmail)
    res.json({ success: true, ...result })
  } catch (err) {
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
})

exports.sendProvisionWhatsAppOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body
  assertProvisionPhone(phone)

  try {
    const result = await sendOtp(phone, { channel: 'whatsapp' })
    res.json({ success: true, ...result })
  } catch (err) {
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
})

exports.createRestaurant = asyncHandler(async (req, res) => {
  const idem = idempotencyKey(req, 'create-restaurant')
  const cached = readIdempotent(idem)
  if (cached) {
    return res.status(cached.status).json(cached.body)
  }

  const {
    name,
    slug,
    city,
    email,
    phone,
    adminName,
    adminEmail,
    adminPhone,
    otpCode,
    status = 'active',
  } = req.body

  if (!name?.trim()) {
    res.status(400)
    throw new Error('Restaurant name is required')
  }
  if (!adminName?.trim() || !adminEmail?.trim()) {
    res.status(400)
    throw new Error('Admin name and email are required')
  }

  const trimmedName = name.trim()
  const duplicate = await Restaurant.findOne({
    createdBy: req.user._id,
    name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') },
  })
  if (duplicate) {
    res.status(409)
    throw new Error(`Restaurant "${trimmedName}" already exists on your account`)
  }

  const provision = resolvePlatformProvision({
    email: adminEmail,
    phone: adminPhone,
  })

  await assertProvisionPhoneVerified(provision.phone, otpCode)

  const restaurant = await Restaurant.create({
    name: trimmedName,
    slug: slug?.trim() ? slugify(slug) : await uniqueSlug(trimmedName),
    email: email || provision.email,
    phone: phone || provision.phone || '',
    ownerName: adminName.trim(),
    status,
    address: city ? { city: city.trim() } : undefined,
    createdBy: req.user._id,
  })

  const { user: adminUser, membership } = await assignRestaurantAdmin({
    restaurantId: restaurant._id,
    name: adminName,
    email: provision.email,
    password: provision.password,
    phone: provision.phone,
  })

  const body = {
    success: true,
    restaurant,
    admin: {
      _id: adminUser._id,
      name: adminUser.name,
      email: adminUser.email,
      membershipId: membership._id,
    },
  }

  writeIdempotent(idem, 201, body)
  res.status(201).json(body)
})

exports.createRestaurantAdmin = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ _id: req.params.id, createdBy: req.user._id })
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  const { name, email, phone, otpCode } = req.body
  const provision = resolvePlatformProvision({ email, phone })

  await assertProvisionPhoneVerified(provision.phone, otpCode)

  const { user: adminUser, membership } = await assignRestaurantAdmin({
    restaurantId: restaurant._id,
    name,
    email: provision.email,
    password: provision.password,
    phone: provision.phone,
  })

  res.status(201).json({
    success: true,
    restaurant,
    admin: {
      _id: adminUser._id,
      name: adminUser.name,
      email: adminUser.email,
      membershipId: membership._id,
    },
  })
})

exports.getRestaurantAdmins = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ _id: req.params.id, createdBy: req.user._id })
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  const admins = await Membership.find({
    restaurant: restaurant._id,
    role: 'restaurant_admin',
    isActive: true,
  })
    .populate('user', 'name email phone isActive lastLogin')
    .sort({ createdAt: -1 })

  res.json({ success: true, admins: admins.filter((m) => m.user) })
})

exports.getRestaurantStaff = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ _id: req.params.id, createdBy: req.user._id })
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  const staff = await Membership.find({
    restaurant: restaurant._id,
    role: { $nin: ['restaurant_admin', 'customer'] },
    provisionedBy: PROVISION.PLATFORM,
    isActive: true,
  })
    .populate('user', 'name email phone isActive lastLogin')
    .sort({ createdAt: -1 })

  res.json({ success: true, staff: staff.filter((m) => m.user) })
})

exports.createRestaurantStaff = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ _id: req.params.id, createdBy: req.user._id })
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  const { name, email, phone, otpCode, role, customRoleName } = req.body
  const provision = resolvePlatformProvision({ email, phone })

  await assertProvisionPhoneVerified(provision.phone, otpCode)

  const { user: staffUser, membership } = await assignRestaurantStaff({
    restaurantId: restaurant._id,
    name,
    email: provision.email,
    password: provision.password,
    phone: provision.phone,
    role: role || 'staff',
    customRoleName,
  })

  res.status(201).json({
    success: true,
    staff: membership,
    user: {
      _id: staffUser._id,
      name: staffUser.name,
      email: staffUser.email,
      membershipId: membership._id,
    },
  })
})

exports.updateRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOneAndUpdate(
    { _id: req.params.id, createdBy: req.user._id },
    req.body,
    { new: true, runValidators: true }
  )
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }
  res.json({ success: true, restaurant })
})

exports.suspendRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOneAndUpdate(
    { _id: req.params.id, createdBy: req.user._id },
    { status: 'suspended' },
    { new: true }
  )
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }
  res.json({ success: true, restaurant })
})

exports.activateRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOneAndUpdate(
    { _id: req.params.id, createdBy: req.user._id },
    { status: 'active' },
    { new: true }
  )
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }
  res.json({ success: true, restaurant })
})

exports.deleteRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id })
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }
  res.json({ success: true, message: 'Restaurant deleted' })
})

exports.getRestaurantAnalytics = asyncHandler(async (req, res) => {
  const restaurantId = new mongoose.Types.ObjectId(String(req.params.id))
  const owned = await Restaurant.findOne({ _id: restaurantId, createdBy: req.user._id })
  if (!owned) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    orders,
    revenue,
    tables,
    menuCount,
    staffCount,
    customers,
    statusBreakdown,
    dailyRevenue,
    topItems,
    recentOrders,
  ] = await Promise.all([
    Order.countDocuments({ restaurant: restaurantId }),
    Order.aggregate([
      { $match: { restaurant: restaurantId } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Table.find({ restaurant: restaurantId }),
    MenuItem.countDocuments({ restaurant: restaurantId }),
    Membership.countDocuments({ restaurant: restaurantId, role: { $ne: 'restaurant_admin' }, isActive: true }),
    Membership.countDocuments({ restaurant: restaurantId, role: 'customer', isActive: true }),
    Order.aggregate([
      { $match: { restaurant: restaurantId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { restaurant: restaurantId, createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$total' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: { restaurant: restaurantId } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', qty: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
      { $sort: { qty: -1 } },
      { $limit: 8 },
    ]),
    Order.find({ restaurant: restaurantId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('orderId guest total status createdAt items'),
  ])

  const tableStats = tables.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {})

  res.json({
    success: true,
    analytics: {
      totalOrders: orders,
      totalRevenue: revenue[0]?.total || 0,
      avgOrderValue: orders ? Math.round((revenue[0]?.total || 0) / orders) : 0,
      menuItems: menuCount,
      staff: staffCount,
      customers,
      tables: tables.length,
      tableStats,
      statusBreakdown: statusBreakdown.reduce((a, s) => ({ ...a, [s._id]: s.count }), {}),
      dailyRevenue,
      topItems,
      recentOrders,
    },
  })
})

exports.getPlatformOrders = asyncHandler(async (req, res) => {
  const myIds = await getMyRestaurantIds(req.user._id)
  const { status, page = 1, limit = 100 } = req.query
  const filter = myIds.length ? { restaurant: { $in: toObjectIds(myIds) } } : { restaurant: null }
  if (status) filter.status = status

  const skip = (Number(page) - 1) * Number(limit)
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('user', 'name phone email')
      .populate('restaurant', 'name slug address')
      .populate('table', 'tableNumber label location'),
    Order.countDocuments(filter),
  ])

  res.json({ success: true, total, page: Number(page), orders })
})

function mapMembershipRoleLabel(role) {
  if (role === 'restaurant_admin') return 'admin'
  if (role === 'customer') return 'customer'
  return 'staff'
}

exports.getPlatformUsers = asyncHandler(async (req, res) => {
  const myIds = await getMyRestaurantIds(req.user._id)
  const { role, restaurantId, search, page = 1, limit = 50 } = req.query

  if (!myIds.length) {
    return res.json({ success: true, total: 0, page: Number(page), users: [] })
  }

  const restaurantFilter = restaurantId
    ? [new mongoose.Types.ObjectId(String(restaurantId))]
    : toObjectIds(myIds)

  const membershipMatch = {
    restaurant: { $in: restaurantFilter },
    isActive: true,
  }
  if (role === 'customer') membershipMatch.role = 'customer'
  else if (role === 'admin') membershipMatch.role = 'restaurant_admin'
  else if (role === 'staff') membershipMatch.role = { $nin: ['restaurant_admin', 'customer'] }

  const memberships = await Membership.find(membershipMatch)
    .populate('user', 'name email phone isActive lastLogin createdAt platformRole')
    .populate('restaurant', 'name slug')
    .sort({ updatedAt: -1 })

  let rows = memberships.filter((m) => m.user)
  if (search?.trim()) {
    const q = search.trim().toLowerCase()
    rows = rows.filter((m) =>
      m.user.name?.toLowerCase().includes(q)
      || m.user.email?.toLowerCase().includes(q)
      || String(m.user.phone || '').includes(q),
    )
  }

  const userIds = [...new Set(rows.map((m) => String(m.user._id)))]
  const orderAgg = userIds.length
    ? await Order.aggregate([
        {
          $match: {
            restaurant: { $in: restaurantFilter },
            user: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
          },
        },
        {
          $group: {
            _id: { user: '$user', restaurant: '$restaurant' },
            orderCount: { $sum: 1 },
            orderTotal: { $sum: '$total' },
            lastOrderAt: { $max: '$createdAt' },
          },
        },
      ])
    : []

  const orderStats = new Map()
  for (const row of orderAgg) {
    orderStats.set(`${row._id.user}:${row._id.restaurant}`, row)
  }

  const users = rows.map((m) => {
    const key = `${m.user._id}:${m.restaurant._id}`
    const stats = orderStats.get(key) || {}
    return {
      membershipId: m._id,
      role: mapMembershipRoleLabel(m.role),
      dbRole: m.role,
      joinedAt: m.createdAt,
      restaurant: m.restaurant,
      user: {
        _id: m.user._id,
        name: m.user.name,
        email: m.user.email,
        phone: m.user.phone,
        isActive: m.user.isActive,
        lastLogin: m.user.lastLogin,
        createdAt: m.user.createdAt,
        platformRole: m.user.platformRole,
      },
      orderCount: stats.orderCount || 0,
      orderTotal: stats.orderTotal || 0,
      lastOrderAt: stats.lastOrderAt || null,
    }
  })

  const total = users.length
  const skip = (Number(page) - 1) * Number(limit)
  const paged = users.slice(skip, skip + Number(limit))

  res.json({ success: true, total, page: Number(page), users: paged })
})

exports.getPlatformLoginHistory = asyncHandler(async (req, res) => {
  const myIds = await getMyRestaurantIds(req.user._id)
  const { userId, restaurantId, page = 1, limit = 100 } = req.query

  if (!myIds.length) {
    return res.json({ success: true, total: 0, page: Number(page), history: [] })
  }

  const restaurantFilter = restaurantId
    ? [new mongoose.Types.ObjectId(String(restaurantId))]
    : toObjectIds(myIds)

  const memberUserIds = await Membership.distinct('user', {
    restaurant: { $in: restaurantFilter },
    isActive: true,
  })

  const filter = { user: { $in: memberUserIds } }
  if (userId) filter.user = userId

  const skip = (Number(page) - 1) * Number(limit)
  const [history, total] = await Promise.all([
    LoginHistory.find(filter)
      .populate('user', 'name email phone')
      .populate('restaurant', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    LoginHistory.countDocuments(filter),
  ])

  res.json({ success: true, total, page: Number(page), history })
})

exports.getRestaurantCustomerDashboard = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ _id: req.params.id, createdBy: req.user._id })
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  const restaurantId = restaurant._id
  const { userId } = req.query
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const activeStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served']

  const customerUserIds = await Membership.distinct('user', {
    restaurant: restaurantId,
    role: 'customer',
    isActive: true,
  })

  const orderFilter = { restaurant: restaurantId }
  if (userId) orderFilter.user = userId

  const loginFilter = { user: { $in: customerUserIds } }
  if (userId) loginFilter.user = userId

  const [
    memberships,
    orders,
    loginHistory,
    totalCustomers,
    orderStats,
    activeOrderCount,
    loginsLast7Days,
    guestOrderCount,
  ] = await Promise.all([
    Membership.find({ restaurant: restaurantId, role: 'customer', isActive: true })
      .populate('user', 'name email phone isActive lastLogin createdAt')
      .sort({ updatedAt: -1 }),
    Order.find(orderFilter)
      .sort({ createdAt: -1 })
      .limit(150)
      .populate('user', 'name phone email')
      .populate('table', 'tableNumber label location _id'),
    LoginHistory.find(loginFilter)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(80),
    Membership.countDocuments({ restaurant: restaurantId, role: 'customer', isActive: true }),
    Order.aggregate([
      { $match: { restaurant: restaurantId, ...(userId ? { user: new mongoose.Types.ObjectId(String(userId)) } : {}) } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          avgOrder: { $avg: '$total' },
        },
      },
    ]),
    Order.countDocuments({ restaurant: restaurantId, status: { $in: activeStatuses } }),
    LoginHistory.countDocuments({ ...loginFilter, createdAt: { $gte: sevenDaysAgo } }),
    Order.countDocuments({ restaurant: restaurantId, $or: [{ user: null }, { user: { $exists: false } }] }),
  ])

  const orderAgg = customerUserIds.length
    ? await Order.aggregate([
        {
          $match: {
            restaurant: restaurantId,
            user: { $in: customerUserIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
          },
        },
        {
          $group: {
            _id: '$user',
            orderCount: { $sum: 1 },
            orderTotal: { $sum: '$total' },
            lastOrderAt: { $max: '$createdAt' },
          },
        },
      ])
    : []

  const orderStatsByUser = new Map(orderAgg.map((row) => [String(row._id), row]))

  const customers = memberships
    .filter((m) => m.user)
    .map((m) => {
      const stats = orderStatsByUser.get(String(m.user._id)) || {}
      return {
        userId: m.user._id,
        name: m.user.name,
        email: m.user.email,
        phone: m.user.phone,
        isActive: m.user.isActive,
        lastLogin: m.user.lastLogin,
        joinedAt: m.createdAt,
        memberSince: m.user.createdAt,
        orderCount: stats.orderCount || 0,
        orderTotal: stats.orderTotal || 0,
        lastOrderAt: stats.lastOrderAt || null,
      }
    })

  const stats = orderStats[0] || {}

  res.json({
    success: true,
    restaurant: {
      _id: restaurant._id,
      name: restaurant.name,
      slug: restaurant.slug,
      address: restaurant.address,
    },
    stats: {
      totalCustomers,
      totalOrders: stats.totalOrders || 0,
      totalRevenue: Math.round(stats.totalRevenue || 0),
      avgOrderValue: Math.round(stats.avgOrder || 0),
      activeOrders: activeOrderCount,
      loginsLast7Days,
      guestOrders: guestOrderCount,
    },
    customers,
    orders,
    loginHistory,
  })
})
