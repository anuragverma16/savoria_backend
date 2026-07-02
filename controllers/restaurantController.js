const asyncHandler = require('express-async-handler')
const Restaurant = require('../models/Restaurant')

exports.getRestaurants = asyncHandler(async (req, res) => {
  const filter = req.user?.role === 'superadmin' ? {} : { status: 'active' }

  const restaurants = await Restaurant.find(filter)
    .populate('manager', 'name email phone')
    .sort({ createdAt: -1 })

  res.json({ success: true, count: restaurants.length, restaurants })
})

exports.getRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id).populate(
    'manager',
    'name email phone role'
  )

  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  res.json({ success: true, restaurant })
})

exports.createRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.create(req.body)

  res.status(201).json({ success: true, restaurant })
})

exports.updateRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  }).populate('manager', 'name email phone')

  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  res.json({ success: true, restaurant })
})

exports.deleteRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id)

  if (!restaurant) {
    res.status(404)
    throw new Error('Restaurant not found')
  }

  await restaurant.deleteOne()

  res.json({ success: true, message: 'Restaurant deleted successfully' })
})
