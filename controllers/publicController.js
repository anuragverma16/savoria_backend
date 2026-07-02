const asyncHandler = require('express-async-handler')
const mongoose = require('mongoose')
const Restaurant = require('../models/Restaurant')
const Table = require('../models/Table')
const Category = require('../models/Category')
const MenuItem = require('../models/MenuItem')
const Order = require('../models/Order')
const { getTableSeatInfo, getRestaurantTablesSeatInfo, syncTableOccupancy } = require('../utils/tableSeats')
const { ensureTableQrCode, getTableBookingUrl, getClientBaseUrl } = require('../utils/tableQr')
const { validateOrderItems, calculateOrderTotals } = require('../utils/orderHelpers')

const BLOCKED_STATUSES = ['reserved', 'cleaning']

async function resolveScanTable(restaurantId, tableId) {
  if (!restaurantId || !tableId) {
    return { error: 'INVALID_QR', status: 400, message: 'Invalid QR Code' }
  }

  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    return { error: 'INVALID_QR', status: 400, message: 'Invalid QR Code' }
  }

  const restaurant = await Restaurant.findOne({ _id: restaurantId, status: 'active' })
  if (!restaurant) {
    return { error: 'INVALID_QR', status: 404, message: 'Invalid QR Code' }
  }

  if (!mongoose.Types.ObjectId.isValid(tableId)) {
    return { error: 'TABLE_NOT_FOUND', status: 404, message: 'Table Not Found' }
  }

  const table = await Table.findOne({
    _id: tableId,
    restaurant: restaurant._id,
    isActive: true,
  })

  if (!table) {
    return { error: 'TABLE_NOT_FOUND', status: 404, message: 'Table Not Found' }
  }

  await syncTableOccupancy(table._id)
  const seatInfo = await getTableSeatInfo(table._id)
  const refreshed = seatInfo.table

  return { restaurant, table: refreshed, seatInfo }
}

function scanAvailabilityResponse(restaurant, table, seatInfo) {
  if (!table.isActive) {
    return {
      success: false,
      available: false,
      code: 'TABLE_NOT_FOUND',
      message: 'This table is currently unavailable. Please contact staff.',
      restaurant: { _id: restaurant._id, name: restaurant.name, slug: restaurant.slug },
      table: publicTablePayload(table, seatInfo, restaurant),
    }
  }

  if (BLOCKED_STATUSES.includes(table.status)) {
    const messages = {
      reserved: 'This table is reserved. Please contact the host.',
      cleaning: 'This table is being cleaned. Please try again shortly.',
    }
    return {
      success: false,
      available: false,
      code: 'TABLE_UNAVAILABLE',
      message: messages[table.status] || 'Table not available',
      restaurant: { _id: restaurant._id, name: restaurant.name, slug: restaurant.slug },
      table: publicTablePayload(table, seatInfo, restaurant),
    }
  }

  if (seatInfo.isFull) {
    return {
      success: false,
      available: false,
      code: 'TABLE_UNAVAILABLE',
      message: `Table ${table.tableNumber} is full. Please ask staff for assistance.`,
      restaurant: { _id: restaurant._id, name: restaurant.name, slug: restaurant.slug },
      table: publicTablePayload(table, seatInfo, restaurant),
    }
  }

  return {
    success: true,
    available: true,
    code: 'OK',
    restaurant: {
      _id: restaurant._id,
      name: restaurant.name,
      slug: restaurant.slug,
      logo: restaurant.logo,
      settings: restaurant.settings,
      address: restaurant.address,
      phone: restaurant.phone,
      email: restaurant.email,
      gstNumber: restaurant.gstNumber,
    },
    table: publicTablePayload(table, seatInfo, restaurant),
  }
}

/** GET /api/public/scan/validate?restaurantId=&tableId= */
exports.validateScan = asyncHandler(async (req, res) => {
  const { restaurantId, tableId } = req.query
  const resolved = await resolveScanTable(restaurantId, tableId)

  if (resolved.error) {
    return res.status(resolved.status).json({
      success: false,
      code: resolved.error,
      message: resolved.message,
    })
  }

  res.json(scanAvailabilityResponse(resolved.restaurant, resolved.table, resolved.seatInfo))
})

/** GET /api/public/scan/menu?restaurantId=&tableId= — menu scoped to scanned table */
exports.getScanMenu = asyncHandler(async (req, res) => {
  const { restaurantId, tableId } = req.query
  const resolved = await resolveScanTable(restaurantId, tableId)

  if (resolved.error) {
    return res.status(resolved.status).json({
      success: false,
      code: resolved.error,
      message: resolved.message,
    })
  }

  const availability = scanAvailabilityResponse(
    resolved.restaurant,
    resolved.table,
    resolved.seatInfo,
  )
  if (!availability.available) {
    return res.status(403).json({
      success: false,
      code: availability.code,
      message: availability.message,
    })
  }

  const restaurant = resolved.restaurant
  const [categories, items] = await Promise.all([
    Category.find({ restaurant: restaurant._id, isActive: true }).sort({ sortOrder: 1 }),
    MenuItem.find({ restaurant: restaurant._id })
      .populate('category', 'name')
      .sort({ sortOrder: 1 }),
  ])

  res.json({
    success: true,
    restaurant: {
      _id: restaurant._id,
      name: restaurant.name,
      slug: restaurant.slug,
      logo: restaurant.logo,
      settings: restaurant.settings,
      address: restaurant.address,
      gstNumber: restaurant.gstNumber,
      phone: restaurant.phone,
      email: restaurant.email,
    },
    table: availability.table,
    categories,
    menuItems: items,
  })
})

function publicTablePayload(table, seatInfo, restaurant) {
  return {
    _id: table._id,
    tableNumber: table.tableNumber,
    label: table.label,
    capacity: table.capacity,
    status: table.status,
    displayStatus: seatInfo?.displayStatus || table.status,
    qrToken: table.qrToken,
    qrCodeUrl: table.qrCodeUrl || null,
    bookingUrl: restaurant
      ? getTableBookingUrl(restaurant, table)
      : (table.qrTargetUrl || ''),
    seatedGuests: seatInfo?.seatedGuests ?? 0,
    seatsAvailable: seatInfo?.seatsAvailable ?? table.capacity,
    activeOrders: seatInfo?.activeOrderCount ?? 0,
  }
}

exports.validateTable = asyncHandler(async (req, res) => {
  const { slug } = req.params
  const { table: qrToken } = req.query

  if (!qrToken) {
    res.status(400)
    throw new Error('Table QR token is required')
  }

  const restaurant = await Restaurant.findOne({ slug, status: 'active' })
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found or inactive')
  }

  const table = await Table.findOne({ restaurant: restaurant._id, qrToken, isActive: true })
  if (!table) {
    res.status(404)
    throw new Error('Invalid table QR code')
  }

  await syncTableOccupancy(table._id)
  const seatInfo = await getTableSeatInfo(table._id)
  const refreshed = seatInfo.table

  if (!refreshed.isActive) {
    return res.json({
      success: false,
      available: false,
      displayStatus: 'unavailable',
      message: 'This table is currently unavailable. Please contact staff.',
      table: publicTablePayload(refreshed, seatInfo, restaurant),
    })
  }

  if (BLOCKED_STATUSES.includes(refreshed.status)) {
    const messages = {
      reserved: 'This table is reserved. Please contact the host.',
      cleaning: 'This table is being cleaned. Please try again shortly.',
    }
    return res.json({
      success: false,
      available: false,
      displayStatus: refreshed.status,
      message: messages[refreshed.status] || 'Table not available',
      table: publicTablePayload(refreshed, seatInfo, restaurant),
    })
  }

  if (seatInfo.isFull) {
    return res.json({
      success: false,
      available: false,
      displayStatus: 'occupied',
      message: `Table ${refreshed.tableNumber} is full (${refreshed.capacity}/${refreshed.capacity} seats). Please scan another table or ask staff.`,
      table: publicTablePayload(refreshed, seatInfo, restaurant),
    })
  }

  res.json({
    success: true,
    available: true,
    displayStatus: seatInfo.displayStatus,
    restaurant: {
      _id: restaurant._id,
      name: restaurant.name,
      slug: restaurant.slug,
      logo: restaurant.logo,
      settings: restaurant.settings,
    },
    table: publicTablePayload(refreshed, seatInfo, restaurant),
  })
})

exports.getPublicMenu = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ slug: req.params.slug, status: 'active' })
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  const [categories, items] = await Promise.all([
    Category.find({ restaurant: restaurant._id, isActive: true }).sort({ sortOrder: 1 }),
    MenuItem.find({ restaurant: restaurant._id })
      .populate('category', 'name')
      .sort({ sortOrder: 1 }),
  ])

  res.json({
    success: true,
    restaurant: {
      _id: restaurant._id,
      name: restaurant.name,
      slug: restaurant.slug,
      logo: restaurant.logo,
      settings: restaurant.settings,
      address: restaurant.address,
      gstNumber: restaurant.gstNumber,
      phone: restaurant.phone,
      email: restaurant.email,
    },
    categories,
    menuItems: items,
  })
})

exports.getPopularMenuItems = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ slug: req.params.slug, status: 'active' })
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  const ranked = await Order.aggregate([
    {
      $match: {
        restaurant: restaurant._id,
        status: { $nin: ['cancelled', 'refunded'] },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.menuItem',
        orderCount: { $sum: '$items.qty' },
      },
    },
    { $match: { _id: { $ne: null } } },
    { $sort: { orderCount: -1 } },
    { $limit: 3 },
  ])

  let popularItems = []

  if (ranked.length) {
    const ids = ranked.map((r) => r._id)
    const items = await MenuItem.find({
      _id: { $in: ids },
      restaurant: restaurant._id,
      isAvailable: { $ne: false },
    }).populate('category', 'name')

    const byId = new Map(items.map((i) => [String(i._id), i]))
    popularItems = ranked
      .map((r) => {
        const item = byId.get(String(r._id))
        if (!item) return null
        return { ...item.toObject(), orderCount: r.orderCount }
      })
      .filter(Boolean)
  }

  res.json({
    success: true,
    popularItems,
    basedOnOrders: ranked.length > 0,
  })
})

exports.getPublicTables = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ slug: req.params.slug, status: 'active' })
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  const seatInfos = await getRestaurantTablesSeatInfo(restaurant._id)
  await Promise.all(seatInfos.map((seatInfo) => ensureTableQrCode(restaurant, seatInfo.table)))
  const enriched = seatInfos.map((seatInfo) => publicTablePayload(seatInfo.table, seatInfo, restaurant))

  enriched.sort((a, b) => {
    const na = Number(a.tableNumber)
    const nb = Number(b.tableNumber)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return String(a.tableNumber).localeCompare(String(b.tableNumber), undefined, { numeric: true })
  })

  res.json({
    success: true,
    tables: enriched,
    qrBaseUrl: getClientBaseUrl(),
  })
})

exports.placeGuestOrder = asyncHandler(async (req, res) => {
  const { slug } = req.params
  const { tableToken, guest, items, specialInstructions, paymentMethod } = req.body

  const restaurant = await Restaurant.findOne({ slug, status: 'active' })
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  const table = await Table.findOne({ restaurant: restaurant._id, qrToken: tableToken, isActive: true })
  if (!table) {
    res.status(404)
    throw new Error('Invalid table')
  }

  if (BLOCKED_STATUSES.includes(table.status)) {
    res.status(400)
    throw new Error('Table is not available for ordering')
  }

  const seatInfo = await getTableSeatInfo(table._id)
  const guestCount = Math.max(1, Number(guest?.guestCount) || 1)

  if (guestCount > seatInfo.seatsAvailable) {
    res.status(400)
    throw new Error(`Only ${seatInfo.seatsAvailable} seat(s) available at this table. Reduce guest count or choose another table.`)
  }

  if (!guest?.name || !guest?.phone || !items?.length) {
    res.status(400)
    throw new Error('Guest name, phone and items are required')
  }

  try {
    await validateOrderItems(restaurant._id, items)
  } catch (e) {
    res.status(e.statusCode || 400)
    throw e
  }

  const totals = calculateOrderTotals(items, restaurant.settings)
  const { subtotal, tax, serviceCharge: service, total } = totals

  const order = await Order.create({
    restaurant: restaurant._id,
    table: table._id,
    tableNumber: table.tableNumber,
    guest: {
      name: guest.name,
      phone: guest.phone,
      guestCount,
    },
    items,
    subtotal,
    tax,
    serviceCharge: service,
    total,
    specialInstructions,
    paymentMethod: paymentMethod || 'cash',
    orderType: 'dine-in',
    status: 'pending',
  })

  await Restaurant.findByIdAndUpdate(restaurant._id, {
    $inc: { 'stats.totalOrders': 1 },
  })

  const io = req.app.get('io')
  const orderPayload = await Order.findById(order._id).populate('table', 'tableNumber label')

  await syncTableOccupancy(table._id)
  const updatedTable = await Table.findById(table._id)

  io?.to(`restaurant_${restaurant._id}`).emit('new-order', orderPayload)
  io?.to(`restaurant_${restaurant._id}_kitchen`).emit('kitchen-order', orderPayload)
  io?.to(`restaurant_${restaurant._id}`).emit('table-updated', updatedTable)
  io?.to(`table_${table._id}`).emit('order-placed', orderPayload)
  io?.to(`table_${table._id}`).emit('table-seats-updated', {
    tableId: table._id,
    seatedGuests: updatedTable?.activeGuestCount,
    seatsAvailable: Math.max(0, (updatedTable?.capacity || 0) - (updatedTable?.activeGuestCount || 0)),
    capacity: updatedTable?.capacity,
    status: updatedTable?.status,
  })

  res.status(201).json({ success: true, order: orderPayload })
})

exports.getPlatformStats = asyncHandler(async (req, res) => {
  const [restaurants, orders] = await Promise.all([
    Restaurant.countDocuments({ status: 'active' }),
    Order.countDocuments(),
  ])

  res.json({ success: true, stats: { restaurants, orders } })
})

exports.trackOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderId: req.params.orderId })
    .populate('restaurant', 'name slug')
    .populate('table', 'tableNumber')

  if (!order) {
    res.status(404)
    throw new Error('Order not found')
  }

  res.json({ success: true, order })
})
