const User = require('../models/User')
const Restaurant = require('../models/Restaurant')
const Membership = require('../models/Membership')
const Category = require('../models/Category')
const MenuItem = require('../models/MenuItem')
const Table = require('../models/Table')
const Order = require('../models/Order')
const Coupon = require('../models/Coupon')

const DEMO_SLUGS = ['spice-garden', 'coastal-bites']
const DEMO_USER_EMAILS = [
  'admin@spicegarden.com',
  'staff@spicegarden.com',
  'user@spicegarden.com',
  'chef@spicegarden.com',
  'waiter@spicegarden.com',
]

async function deleteRestaurantData(restaurantIds) {
  if (!restaurantIds.length) return
  await Promise.all([
    Order.deleteMany({ restaurant: { $in: restaurantIds } }),
    MenuItem.deleteMany({ restaurant: { $in: restaurantIds } }),
    Category.deleteMany({ restaurant: { $in: restaurantIds } }),
    Table.deleteMany({ restaurant: { $in: restaurantIds } }),
    Coupon.deleteMany({ restaurant: { $in: restaurantIds } }),
    Membership.deleteMany({ restaurant: { $in: restaurantIds } }),
    Restaurant.deleteMany({ _id: { $in: restaurantIds } }),
  ])
}

async function getPlatformSuperAdmin() {
  return User.findOne({ platformRole: 'superadmin' })
}

async function syncPlatformRestaurants() {
  const superAdmin = await getPlatformSuperAdmin()
  if (!superAdmin) return { linked: 0, demoRemoved: 0 }

  const demoRestaurants = await Restaurant.find({ slug: { $in: DEMO_SLUGS } }).select('_id')
  const demoIds = demoRestaurants.map((r) => r._id)

  if (demoIds.length) {
    await deleteRestaurantData(demoIds)
    console.log(`✅ Removed ${demoIds.length} demo restaurant(s)`)
  }

  const demoUsers = await User.find({
    email: { $in: DEMO_USER_EMAILS.map((e) => e.toLowerCase()) },
    platformRole: { $ne: 'superadmin' },
  }).select('_id')

  if (demoUsers.length) {
    const demoUserIds = demoUsers.map((u) => u._id)
    await Membership.deleteMany({ user: { $in: demoUserIds } })
    await User.deleteMany({ _id: { $in: demoUserIds } })
    console.log(`✅ Removed ${demoUsers.length} demo user(s)`)
  }

  const linkResult = await Restaurant.updateMany(
    { createdBy: { $ne: superAdmin._id } },
    { $set: { createdBy: superAdmin._id } },
  )

  if (linkResult.modifiedCount > 0) {
    console.log(`✅ Linked ${linkResult.modifiedCount} restaurant(s) to Super Admin`)
  }

  return { linked: linkResult.modifiedCount, demoRemoved: demoIds.length }
}

module.exports = {
  getPlatformSuperAdmin,
  syncPlatformRestaurants,
  DEMO_SLUGS,
  DEMO_USER_EMAILS,
}
