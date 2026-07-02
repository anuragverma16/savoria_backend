const asyncHandler = require('express-async-handler')
const User = require('../models/User')
const Order = require('../models/Order')
const MenuItem = require('../models/MenuItem')
const Restaurant = require('../models/Restaurant')

exports.getOverview = asyncHandler(async (req, res) => {
  const [totalUsers, totalOrders, totalMenuItems, totalRestaurants, revenueAgg, roleCounts] =
    await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      MenuItem.countDocuments(),
      Restaurant.countDocuments(),
      Order.aggregate([
        { $match: { status: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    ])

  const usersByRole = roleCounts.reduce((acc, item) => {
    acc[item._id] = item.count
    return acc
  }, {})

  res.json({
    success: true,
    overview: {
      totalUsers,
      totalOrders,
      totalMenuItems,
      totalRestaurants,
      totalRevenue: revenueAgg[0]?.total || 0,
      usersByRole,
    },
  })
})
