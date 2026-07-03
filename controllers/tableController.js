const asyncHandler = require('express-async-handler')
const Table = require('../models/Table')
const Restaurant = require('../models/Restaurant')
const { generateTableQrDataUrl, ensureTableQrCode, getTableOrderUrl, getQrConfigMeta } = require('../utils/tableQr')

exports.getTables = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const restaurant = req.restaurant || await Restaurant.findById(restaurantId)
  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  const tables = await Table.find({ restaurant: restaurantId, isActive: { $ne: false } })
  await Promise.all(tables.map((table) => ensureTableQrCode(restaurant, table)))

  tables.sort((a, b) => {
    const na = Number(a.tableNumber)
    const nb = Number(b.tableNumber)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return String(a.tableNumber).localeCompare(String(b.tableNumber), undefined, { numeric: true })
  })

  res.json({
    success: true,
    tables,
    ...getQrConfigMeta(),
  })
})

exports.createTable = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const restaurant = req.restaurant || await Restaurant.findById(restaurantId)

  if (!req.body.tableNumber) {
    res.status(400)
    throw new Error('Table number is required')
  }

  const exists = await Table.findOne({ restaurant: restaurantId, tableNumber: String(req.body.tableNumber).trim() })
  if (exists) {
    res.status(400)
    throw new Error(`Table ${req.body.tableNumber} already exists`)
  }

  const table = await Table.create({
    ...req.body,
    tableNumber: String(req.body.tableNumber).trim(),
    restaurant: restaurantId,
    label: req.body.label || `Table ${req.body.tableNumber}`,
  })

  const { qrCodeUrl, qrUrl } = await generateTableQrDataUrl(restaurant, table)
  table.qrCodeUrl = qrCodeUrl
  table.qrTargetUrl = qrUrl
  await table.save()

  const io = req.app.get('io')
  io?.to(`restaurant_${restaurantId}`).emit('table-updated', table)

  res.status(201).json({ success: true, table, qrUrl })
})

exports.createTablesBulk = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const restaurant = req.restaurant || await Restaurant.findById(restaurantId)
  const { count, startFrom = 1, capacity = 4, location = '' } = req.body

  const numCount = Number(count)
  const numStart = Number(startFrom)
  const numCapacity = Number(capacity)
  const section = String(location || '').trim()

  if (!numCount || numCount < 1 || numCount > 50) {
    res.status(400)
    throw new Error('Number of tables must be between 1 and 50')
  }
  if (!numStart || numStart < 1) {
    res.status(400)
    throw new Error('Starting table number must be at least 1')
  }
  if (!numCapacity || numCapacity < 1 || numCapacity > 20) {
    res.status(400)
    throw new Error('Seats per table must be between 1 and 20')
  }

  const existing = await Table.find({ restaurant: restaurantId }).select('tableNumber')
  const taken = new Set(existing.map((t) => t.tableNumber))

  const created = []
  const skipped = []
  for (let i = 0; i < numCount; i++) {
    const tableNumber = String(numStart + i)
    if (taken.has(tableNumber)) {
      skipped.push(tableNumber)
      continue
    }

    const table = await Table.create({
      restaurant: restaurantId,
      tableNumber,
      label: `Table ${tableNumber}`,
      capacity: numCapacity,
      location: section,
      status: 'available',
      activeGuestCount: 0,
    })

    const { qrCodeUrl, qrUrl } = await generateTableQrDataUrl(restaurant, table)
    table.qrCodeUrl = qrCodeUrl
    table.qrTargetUrl = qrUrl
    await table.save()
    created.push(table)
    taken.add(tableNumber)
  }

  if (!created.length) {
    res.status(400)
    throw new Error(
      skipped.length
        ? `Tables ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''} already exist. Try a different start number.`
        : 'No tables could be created.'
    )
  }

  const io = req.app.get('io')
  io?.to(`restaurant_${restaurantId}`).emit('tables-bulk-created', created)
  created.forEach((table) => {
    io?.to(`restaurant_${restaurantId}`).emit('table-updated', table)
  })

  res.status(201).json({
    success: true,
    message: `${created.length} table(s) created${skipped.length ? ` · ${skipped.length} skipped (already exist)` : ''}`,
    tables: created,
    count: created.length,
    skipped,
  })
})

exports.updateTable = asyncHandler(async (req, res) => {
  const allowed = ['label', 'capacity', 'location', 'status']
  const updates = {}
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key]
  })
  if (updates.capacity !== undefined) {
    const cap = Number(updates.capacity)
    if (!cap || cap < 1 || cap > 20) {
      res.status(400)
      throw new Error('Seats per table must be between 1 and 20')
    }
    updates.capacity = cap
  }

  const table = await Table.findOneAndUpdate(
    { _id: req.params.tableId, restaurant: req.params.restaurantId },
    updates,
    { new: true, runValidators: true }
  )
  if (!table) {
    res.status(404)
    throw new Error('Table not found')
  }

  const io = req.app.get('io')
  io?.to(`restaurant_${req.params.restaurantId}`).emit('table-updated', table)

  res.json({ success: true, table })
})

exports.deleteTable = asyncHandler(async (req, res) => {
  const table = await Table.findOneAndDelete({
    _id: req.params.tableId,
    restaurant: req.params.restaurantId,
  })
  if (!table) {
    res.status(404)
    throw new Error('Table not found')
  }
  res.json({ success: true, message: 'Table deleted' })
})

exports.regenerateQR = asyncHandler(async (req, res) => {
  const table = await Table.findOne({
    _id: req.params.tableId,
    restaurant: req.params.restaurantId,
  })
  if (!table) {
    res.status(404)
    throw new Error('Table not found')
  }

  const restaurant = await Restaurant.findById(req.params.restaurantId)
  const { qrCodeUrl, qrUrl } = await generateTableQrDataUrl(restaurant, table)
  table.qrCodeUrl = qrCodeUrl
  table.qrTargetUrl = qrUrl
  await table.save()

  res.json({ success: true, table, qrUrl })
})

exports.regenerateAllQR = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const restaurant = req.restaurant || await Restaurant.findById(restaurantId)
  const tables = await Table.find({ restaurant: restaurantId, isActive: { $ne: false } })

  await Promise.all(tables.map(async (table) => {
    const { qrCodeUrl, qrUrl } = await generateTableQrDataUrl(restaurant, table)
    table.qrCodeUrl = qrCodeUrl
    table.qrTargetUrl = qrUrl
    await table.save()
  }))

  res.json({ success: true, count: tables.length, message: `QR codes regenerated for ${tables.length} table(s)` })
})

exports.updateTableStatus = asyncHandler(async (req, res) => {
  const { status } = req.body
  const table = await Table.findOneAndUpdate(
    { _id: req.params.tableId, restaurant: req.params.restaurantId },
    { status },
    { new: true }
  )
  if (!table) {
    res.status(404)
    throw new Error('Table not found')
  }

  const io = req.app.get('io')
  io?.to(`restaurant_${req.params.restaurantId}`).emit('table-updated', table)

  res.json({ success: true, table })
})

module.exports.getTableOrderUrl = getTableOrderUrl
