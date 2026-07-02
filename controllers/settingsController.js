const asyncHandler = require('express-async-handler')
const Restaurant = require('../models/Restaurant')

exports.getSettings = asyncHandler(async (req, res) => {
  res.json({ success: true, restaurant: req.restaurant })
})

exports.updateSettings = asyncHandler(async (req, res) => {
  const allowed = [
    'name', 'description', 'phone', 'email', 'address',
    'gstNumber', 'ownerName', 'ownerPhone', 'settings',
  ]
  const updates = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key]
  }

  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.restaurantId,
    updates,
    { new: true, runValidators: true }
  )

  res.json({ success: true, restaurant })
})
