const asyncHandler = require('express-async-handler')
const mongoose = require('mongoose')
const Order = require('../models/Order')
const Table = require('../models/Table')
const TableSession = require('../models/TableSession')
const Restaurant = require('../models/Restaurant')
const MenuItem = require('../models/MenuItem')
const Membership = require('../models/Membership')

const { syncTableOccupancy, getTableSeatInfo, clearUserTableSessions } = require('../utils/tableSeats')
const { validateOrderItems, calculateOrderTotals } = require('../utils/orderHelpers')

const tenantRestaurantId = (req) => {
  const id = req.restaurant?._id || req.params.restaurantId
  return new mongoose.Types.ObjectId(String(id))
}

const emitOrderUpdate = (req, restaurantId, order, event = 'order-updated') => {
  const io = req.app.get('io')
  io?.to(`restaurant_${restaurantId}`).emit(event, order)
  io?.to(`restaurant_${restaurantId}_kitchen`).emit('kitchen-order', order)
  if (order.table) io?.to(`table_${order.table}`).emit('order-status', order)
}

exports.getOrders = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const { status, page = 1, limit = 50 } = req.query
  const filter = { restaurant: restaurantId }
  if (status) filter.status = status

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .populate('table', 'tableNumber label location')
    .populate('user', 'name phone email')
    .populate('assignedStaff', 'name')

  res.json({ success: true, orders })
})

exports.getKitchenOrders = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const orders = await Order.find({
    restaurant: restaurantId,
    status: { $in: ['pending', 'accepted', 'preparing', 'ready'] },
  })
    .sort({ createdAt: 1 })
    .populate('table', 'tableNumber label location')

  res.json({ success: true, orders })
})

exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body
  const restaurantId = req.params.restaurantId

  const order = await Order.findOne({ _id: req.params.orderId, restaurant: restaurantId })
  if (!order) {
    res.status(404)
    throw new Error('Order not found')
  }

  order.status = status
  order.updatedBy = req.user?._id

  if (status === 'preparing') order.preparedBy = req.user?._id
  if (status === 'served') order.servedBy = req.user?._id

  if (note) {
    order.statusHistory[order.statusHistory.length - 1].note = note
  }

  await order.save()

  if (['completed', 'cancelled', 'refunded'].includes(status)) {
    const updatedTable = await syncTableOccupancy(order.table)
    const io = req.app.get('io')
    io?.to(`restaurant_${restaurantId}`).emit('table-updated', updatedTable)
    if (updatedTable) {
      io?.to(`table_${order.table}`).emit('table-seats-updated', {
        tableId: order.table,
        seatedGuests: updatedTable.activeGuestCount,
        seatsAvailable: Math.max(0, updatedTable.capacity - (updatedTable.activeGuestCount || 0)),
        capacity: updatedTable.capacity,
        status: updatedTable.status,
      })
    }
  }

  if (status === 'ready') {
    emitOrderUpdate(req, restaurantId, order, 'food-ready')
  } else {
    emitOrderUpdate(req, restaurantId, order)
  }

  if (status === 'completed' && order.paymentStatus === 'paid') {
    await Restaurant.findByIdAndUpdate(restaurantId, {
      $inc: { 'stats.totalRevenue': order.total },
    })
  }

  res.json({ success: true, order })
})

exports.getAnalytics = asyncHandler(async (req, res) => {
  const restaurantId = tenantRestaurantId(req)
  const staffRoles = ['staff', 'manager', 'waiter', 'chef', 'cashier', 'custom']
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalOrders,
    revenue,
    topItems,
    statusBreakdown,
    menuItems,
    staff,
    customers,
    tables,
    recentOrders,
    dailyRevenue,
    avgOrderValue,
  ] = await Promise.all([
    Order.countDocuments({ restaurant: restaurantId }),
    Order.aggregate([
      { $match: { restaurant: restaurantId, status: { $in: ['completed', 'served'] } } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { restaurant: restaurantId } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', qty: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
      { $sort: { qty: -1 } },
      { $limit: 10 },
    ]),
    Order.aggregate([
      { $match: { restaurant: restaurantId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    MenuItem.countDocuments({ restaurant: restaurantId }),
    Membership.countDocuments({ restaurant: restaurantId, role: { $in: staffRoles }, isActive: true }),
    Membership.countDocuments({ restaurant: restaurantId, role: 'customer', isActive: true }),
    Table.countDocuments({ restaurant: restaurantId, isActive: true }),
    Order.find({ restaurant: restaurantId })
      .sort({ createdAt: -1 })
      .limit(15)
      .select('orderId guest tableNumber total status paymentStatus createdAt items'),
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
      { $group: { _id: null, avg: { $avg: '$total' } } },
    ]),
  ])

  const rev = revenue[0]?.total || 0
  const completed = revenue[0]?.count || 0

  res.json({
    success: true,
    analytics: {
      totalOrders,
      revenue: rev,
      completedOrders: completed,
      avgOrderValue: Math.round(avgOrderValue[0]?.avg || 0),
      menuItems,
      staff,
      customers,
      tables,
      topItems,
      statusBreakdown: statusBreakdown.reduce((a, s) => ({ ...a, [s._id]: s.count }), {}),
      dailyRevenue,
      recentOrders,
    },
  })
})

exports.getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.orderId,
    restaurant: req.params.restaurantId,
  }).populate('table', 'tableNumber').populate('statusHistory.updatedBy', 'name')

  if (!order) {
    res.status(404)
    throw new Error('Order not found')
  }
  res.json({ success: true, order })
})

const { validateCouponForOrder } = require('../utils/couponHelpers')
const { getWelcomeDiscountAmount } = require('../utils/welcomeDiscount')
const { verifyUpiPaymentDetails } = require('../utils/paymentHelpers')

function parseOrderItems(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

async function resolveOrderPricing(restaurantId, restaurant, items, phone, couponCode) {
  const baseTotals = calculateOrderTotals(items, restaurant?.settings)
  let couponDiscount = 0
  let appliedCouponCode = null

  if (couponCode) {
    const couponResult = await validateCouponForOrder(restaurantId, couponCode, baseTotals.subtotal)
    couponDiscount = couponResult.discountAmount
    appliedCouponCode = couponResult.code
  }

  const welcomeDiscount = await getWelcomeDiscountAmount(restaurantId, phone)
  const totals = calculateOrderTotals(items, restaurant?.settings, couponDiscount + welcomeDiscount)

  return {
    ...totals,
    couponDiscount,
    welcomeDiscount,
    appliedCouponCode,
    welcomeEligible: welcomeDiscount > 0,
  }
}

function customerTablePayload(table, seatInfo) {
  return {
    _id: table._id,
    tableNumber: table.tableNumber,
    label: table.label,
    capacity: table.capacity,
    status: table.status,
    displayStatus: seatInfo?.displayStatus || table.status,
    seatedGuests: seatInfo?.seatedGuests ?? 0,
    seatsAvailable: seatInfo?.seatsAvailable ?? table.capacity,
    qrToken: table.qrToken,
  }
}

async function resolveCustomerTable(restaurantId, { tableToken, tableId }) {
  if (!tableToken && !tableId) return null

  if (tableId && tableToken) {
    const table = await Table.findOne({
      _id: tableId,
      restaurant: restaurantId,
      isActive: true,
    })
    if (!table || table.qrToken !== tableToken) return null
    return table
  }

  const query = { restaurant: restaurantId, isActive: true }
  if (tableId) query._id = tableId
  else query.qrToken = tableToken

  return Table.findOne(query)
}

exports.validateTableQr = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const { tableToken, tableId } = req.body

  const table = await resolveCustomerTable(restaurantId, { tableToken, tableId })
  if (!table) {
    return res.json({
      success: true,
      valid: false,
      message: 'Invalid Table QR Code',
    })
  }

  await syncTableOccupancy(table._id)
  const seatInfo = await getTableSeatInfo(table._id)

  res.json({
    success: true,
    valid: true,
    table: customerTablePayload(seatInfo.table, seatInfo),
  })
})

exports.getMyTableSession = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const userId = req.user._id

  const session = await TableSession.findOne({
    restaurant: restaurantId,
    user: userId,
    expiresAt: { $gt: new Date() },
  }).populate('table', 'tableNumber label capacity status qrToken')

  if (!session) {
    return res.json({ success: true, active: false })
  }

  res.json({
    success: true,
    active: true,
    session: {
      tableId: session.table?._id,
      guestCount: session.guestCount,
      expiresAt: session.expiresAt,
      table: session.table ? {
        _id: session.table._id,
        tableNumber: session.table.tableNumber,
        label: session.table.label,
        capacity: session.table.capacity,
        status: session.table.status,
        qrToken: session.table.qrToken,
      } : null,
    },
  })
})

exports.checkInCustomerTable = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const { tableToken, tableId, guestCount = 1, qrLink } = req.body
  const user = req.user
  const fromTableLink = qrLink === true || qrLink === 'true' || qrLink === 1 || qrLink === '1'

  if (!tableToken && !tableId) {
    res.status(400)
    throw new Error('Table selection is required')
  }

  const tableQuery = { restaurant: restaurantId, isActive: true }
  if (tableId) tableQuery._id = tableId
  else tableQuery.qrToken = tableToken

  let table = await Table.findOne(tableQuery)
  if (!table) {
    res.status(404)
    throw new Error('Invalid Table QR Code')
  }

  if (tableId && tableToken && (String(table._id) !== String(tableId) || table.qrToken !== tableToken)) {
    res.status(400)
    throw new Error('Invalid Table QR Code')
  }

  const existingSession = await TableSession.findOne({
    restaurant: restaurantId,
    user: user._id,
    table: table._id,
    expiresAt: { $gt: new Date() },
  })

  if (existingSession) {
    await syncTableOccupancy(table._id)
    const seatInfo = await getTableSeatInfo(table._id)
    return res.json({
      success: true,
      available: true,
      displayStatus: seatInfo.displayStatus,
      message: `Table ${table.tableNumber} linked — add items and place your order`,
      table: customerTablePayload(seatInfo.table, seatInfo),
      sessionExpiresAt: existingSession.expiresAt.toISOString(),
    })
  }

  await syncTableOccupancy(table._id)
  let seatInfo = await getTableSeatInfo(table._id)
  const refreshed = seatInfo.table
  const partySize = Math.max(1, Number(guestCount) || 1)

  if (['reserved', 'cleaning'].includes(refreshed.status)) {
    const messages = {
      reserved: 'This table is reserved. Choose another table or contact staff.',
      cleaning: 'This table is being cleaned. Please choose another table.',
    }
    return res.json({
      success: false,
      available: false,
      displayStatus: refreshed.status,
      message: messages[refreshed.status] || 'Table not available',
      table: customerTablePayload(refreshed, seatInfo),
    })
  }

  // Table QR link — no seat picker; valid link grants ordering at this table
  if (!fromTableLink) {
    if (seatInfo.seatsAvailable <= 0) {
      return res.json({
        success: false,
        available: false,
        displayStatus: 'occupied',
        message: `Table ${refreshed.tableNumber} is occupied (${seatInfo.seatedGuests}/${refreshed.capacity} seats). Try another table.`,
        table: customerTablePayload(refreshed, seatInfo),
      })
    }

    if (partySize > seatInfo.seatsAvailable) {
      return res.json({
        success: false,
        available: false,
        displayStatus: seatInfo.displayStatus,
        message: `Only ${seatInfo.seatsAvailable} seat(s) available at table ${refreshed.tableNumber}.`,
        table: customerTablePayload(refreshed, seatInfo),
      })
    }
  }

  await clearUserTableSessions(restaurantId, user._id)

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000)
  await TableSession.create({
    restaurant: restaurantId,
    table: table._id,
    user: user._id,
    guestCount: partySize,
    expiresAt,
  })

  const syncResult = await syncTableOccupancy(table._id)
  seatInfo = syncResult

  const io = req.app.get('io')
  io?.to(`restaurant_${restaurantId}`).emit('table-updated', syncResult.table)

  res.json({
    success: true,
    available: true,
    displayStatus: syncResult.displayStatus,
    message: `Table ${table.tableNumber} linked — add items and place your order`,
    table: customerTablePayload(syncResult.table, syncResult),
    sessionExpiresAt: expiresAt.toISOString(),
  })
})

exports.previewCustomerCheckout = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const restaurant = req.restaurant
  const { phone, couponCode } = req.body
  const items = parseOrderItems(req.body.items)

  if (!items?.length) {
    res.status(400)
    throw new Error('Order must include at least one item')
  }

  try {
    await validateOrderItems(restaurantId, items)
  } catch (e) {
    res.status(e.statusCode || 400)
    throw e
  }

  const pricing = await resolveOrderPricing(restaurantId, restaurant, items, phone, couponCode)

  res.json({
    success: true,
    preview: {
      subtotal: pricing.subtotal,
      tax: pricing.tax,
      gst: pricing.tax,
      serviceCharge: pricing.serviceCharge,
      couponDiscount: pricing.couponDiscount,
      welcomeDiscount: pricing.welcomeDiscount,
      welcomeEligible: pricing.welcomeEligible,
      appliedCouponCode: pricing.appliedCouponCode,
      discount: pricing.discount,
      total: pricing.total,
    },
  })
})

exports.verifyUpiPayment = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const restaurant = req.restaurant
  const { phone, couponCode, paymentTxnId, amount } = req.body
  const items = parseOrderItems(req.body.items)

  if (!items?.length) {
    res.status(400)
    throw new Error('Order must include at least one item')
  }

  await validateOrderItems(restaurantId, items)
  const pricing = await resolveOrderPricing(restaurantId, restaurant, items, phone, couponCode)
  const paymentProofUrl = req.file?.path || req.body.paymentProofUrl

  verifyUpiPaymentDetails({
    paymentTxnId,
    paymentProofUrl,
    expectedAmount: pricing.total,
    clientAmount: amount,
  })

  res.json({
    success: true,
    verified: true,
    message: 'Payment verified',
    expectedAmount: pricing.total,
    pricing,
  })
})

exports.placeCustomerOrder = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const restaurant = req.restaurant
  const body = req.body
  const items = parseOrderItems(body.items)
  const {
    specialInstructions,
    paymentTxnId,
    phone,
    guestName,
    guestCount,
    tableToken,
    couponCode,
    amount,
  } = body
  const user = req.user

  if (!user?.name && !guestName?.trim()) {
    res.status(400)
    throw new Error('Guest name is required')
  }

  const contactPhone = phone || user.phone
  if (!contactPhone) {
    res.status(400)
    throw new Error('Phone number is required to place an order')
  }

  if (!items?.length) {
    res.status(400)
    throw new Error('Order must include at least one item')
  }

  try {
    await validateOrderItems(restaurantId, items)
  } catch (e) {
    res.status(e.statusCode || 400)
    throw e
  }

  let tableDoc = null
  let orderType = 'takeaway'
  const partySize = Math.max(1, Number(guestCount) || 1)

  if (tableToken) {
    const tableQuery = {
      restaurant: restaurantId,
      qrToken: tableToken,
      isActive: true,
    }
    if (body.tableId) tableQuery._id = body.tableId

    tableDoc = await Table.findOne(tableQuery)
    if (!tableDoc) {
      res.status(404)
      throw new Error('Invalid table. Scan your table QR again.')
    }
    await syncTableOccupancy(tableDoc._id)
    const freshTable = await Table.findById(tableDoc._id)
    if (['reserved', 'cleaning'].includes(freshTable.status)) {
      res.status(400)
      throw new Error('Table is not available for ordering')
    }
    const activeSession = await TableSession.findOne({
      restaurant: restaurantId,
      user: user._id,
      table: tableDoc._id,
      expiresAt: { $gt: new Date() },
    })
    if (!activeSession) {
      res.status(403)
      throw new Error('No active table session. Open your table QR link again.')
    }

    orderType = 'dine-in'
  }

  const pricing = await resolveOrderPricing(restaurantId, restaurant, items, contactPhone, couponCode)
  const { subtotal, tax, serviceCharge: service, total, discount, welcomeDiscount, appliedCouponCode } = pricing
  const paymentProofUrl = req.file?.path || body.paymentProofUrl

  verifyUpiPaymentDetails({
    paymentTxnId,
    paymentProofUrl,
    expectedAmount: total,
    clientAmount: amount,
  })

  const order = await Order.create({
    restaurant: restaurantId,
    user: user._id,
    table: tableDoc?._id,
    tableNumber: tableDoc?.tableNumber,
    guest: {
      name: String(guestName || user.name).trim(),
      phone: contactPhone,
      guestCount: partySize,
    },
    items,
    subtotal,
    tax,
    serviceCharge: service,
    discount,
    welcomeDiscount,
    couponCode: appliedCouponCode || undefined,
    total,
    specialInstructions,
    paymentMethod: 'upi',
    paymentStatus: 'paid',
    paymentProofUrl,
    razorpayPaymentId: String(paymentTxnId).trim(),
    orderType,
    status: 'pending',
  })

  if (appliedCouponCode) {
    const Coupon = require('../models/Coupon')
    await Coupon.findOneAndUpdate(
      { restaurant: restaurantId, code: appliedCouponCode },
      { $inc: { usedCount: 1 } },
    )
  }

  await Restaurant.findByIdAndUpdate(restaurantId, {
    $inc: { 'stats.totalOrders': 1 },
  })

  const io = req.app.get('io')
  const orderPayload = await Order.findById(order._id).populate('table', 'tableNumber label')

  io?.to(`restaurant_${restaurantId}`).emit('new-order', orderPayload)
  io?.to(`restaurant_${restaurantId}_kitchen`).emit('kitchen-order', orderPayload)

  if (tableDoc) {
    await clearUserTableSessions(restaurantId, user._id, tableDoc._id)
    const syncResult = await syncTableOccupancy(tableDoc._id)
    const updatedTable = syncResult?.table || await Table.findById(tableDoc._id)
    io?.to(`restaurant_${restaurantId}`).emit('table-updated', updatedTable)
    io?.to(`table_${tableDoc._id}`).emit('order-placed', orderPayload)
    io?.to(`table_${tableDoc._id}`).emit('table-seats-updated', {
      tableId: tableDoc._id,
      seatedGuests: updatedTable?.activeGuestCount,
      seatsAvailable: Math.max(0, (updatedTable?.capacity || 0) - (updatedTable?.activeGuestCount || 0)),
      capacity: updatedTable?.capacity,
      status: updatedTable?.status,
    })
  }

  res.status(201).json({ success: true, order: orderPayload })
})

exports.getMyCustomerOrders = asyncHandler(async (req, res) => {
  const restaurantId = tenantRestaurantId(req)
  const isSuperAdmin = req.user?.platformRole === 'superadmin'

  const filter = { restaurant: restaurantId }
  if (isSuperAdmin) {
    // Super Admin user-panel preview: show registered customer orders at this restaurant
    filter.user = { $exists: true, $ne: null }
  } else {
    filter.user = req.user._id
  }

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('table', 'tableNumber label location _id')
    .populate('user', 'name phone email')
    .populate('restaurant', 'name slug address phone gstNumber settings')

  res.json({ success: true, orders, preview: isSuperAdmin })
})
