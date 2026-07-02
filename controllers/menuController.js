const asyncHandler = require('express-async-handler')
const MenuItem = require('../models/MenuItem')

exports.getMenuItems = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const { category, search, available } = req.query
  const filter = { restaurant: restaurantId }
  if (category) filter.category = category
  if (available === 'true') filter.isAvailable = true
  if (search) filter.name = { $regex: search, $options: 'i' }

  const items = await MenuItem.find(filter)
    .populate('category', 'name')
    .sort({ sortOrder: 1, createdAt: -1 })

  res.json({ success: true, menuItems: items })
})

function parseMenuPayload(body = {}) {
  const toNum = (v, fallback = 0) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const toBool = (v, fallback = false) => {
    if (typeof v === 'boolean') return v
    if (v === 'true') return true
    if (v === 'false') return false
    return fallback
  }

  const payload = {
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim(),
    category: body.category,
    price: toNum(body.price),
    quantity: Math.max(0, toNum(body.quantity, 0)),
    portionSize: body.portionSize === '' || body.portionSize == null
      ? undefined
      : Math.max(0, toNum(body.portionSize, 0)),
    portionUnit: ['ml', 'gm', 'l', 'kg', 'pcs', 'plate'].includes(body.portionUnit)
      ? body.portionUnit
      : '',
    discount: Math.min(100, Math.max(0, toNum(body.discount, 0))),
    calories: Math.max(0, toNum(body.calories, 0)),
    prepTime: body.prepTime || '15 min',
    isVeg: toBool(body.isVeg, true),
    isBestseller: toBool(body.isBestseller, false),
    isRecommended: toBool(body.isRecommended, false),
    sortOrder: toNum(body.sortOrder, 0),
  }

  if (body.tags) {
    payload.tags = Array.isArray(body.tags)
      ? body.tags
      : String(body.tags).split(',').map((t) => t.trim()).filter(Boolean)
  }

  if (body.image && typeof body.image === 'object') {
    payload.image = body.image
  }

  if (!payload.portionSize) {
    delete payload.portionSize
    payload.portionUnit = ''
  }

  return payload
}

exports.createMenuItem = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const data = parseMenuPayload(req.body)

  if (!data.name || !data.category || !Number.isFinite(data.price)) {
    res.status(400)
    throw new Error('Name, category and price are required')
  }

  const item = await MenuItem.create({
    ...data,
    restaurant: restaurantId,
    createdBy: req.user?._id,
    image: req.file ? { url: req.file.path, publicId: req.file.filename } : data.image,
  })
  res.status(201).json({ success: true, menuItem: item })
})

exports.updateMenuItem = asyncHandler(async (req, res) => {
  const updates = parseMenuPayload(req.body)
  if (req.file) updates.image = { url: req.file.path, publicId: req.file.filename }

  const item = await MenuItem.findOneAndUpdate(
    { _id: req.params.itemId, restaurant: req.params.restaurantId },
    updates,
    { new: true, runValidators: true }
  )
  if (!item) {
    res.status(404)
    throw new Error('Menu item not found')
  }
  res.json({ success: true, menuItem: item })
})

exports.deleteMenuItem = asyncHandler(async (req, res) => {
  await MenuItem.findOneAndDelete({ _id: req.params.itemId, restaurant: req.params.restaurantId })
  res.json({ success: true, message: 'Menu item deleted' })
})

exports.toggleAvailability = asyncHandler(async (req, res) => {
  const item = await MenuItem.findOne({ _id: req.params.itemId, restaurant: req.params.restaurantId })
  if (!item) {
    res.status(404)
    throw new Error('Item not found')
  }
  item.isAvailable = !item.isAvailable
  await item.save()
  res.json({ success: true, menuItem: item })
})
