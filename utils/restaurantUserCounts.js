const Membership = require('../models/Membership')
const { PROVISION } = require('./provisionAccess')

const EMPTY_COUNTS = { admins: 0, staff: 0, customers: 0, teamTotal: 0 }

function bucketRole(role) {
  if (role === 'restaurant_admin') return 'admins'
  if (role === 'customer') return 'customers'
  return 'staff'
}

function normalizeCounts(counts) {
  counts.teamTotal = counts.admins + counts.staff
  return counts
}

/**
 * Count distinct active users per restaurant role, ignoring orphan memberships
 * whose user document no longer exists (e.g. from failed duplicate creates).
 */
async function aggregateRestaurantUserCounts(restaurantIds) {
  if (!restaurantIds?.length) return {}

  const rows = await Membership.aggregate([
    {
      $match: {
        restaurant: { $in: restaurantIds },
        isActive: true,
        $or: [
          { role: 'customer' },
          { provisionedBy: PROVISION.PLATFORM },
          { role: 'restaurant_admin', provisionedBy: { $exists: false } },
        ],
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDoc',
      },
    },
    { $match: { userDoc: { $ne: [] } } },
    {
      $group: {
        _id: { restaurant: '$restaurant', role: '$role' },
        users: { $addToSet: '$user' },
      },
    },
    {
      $project: {
        restaurant: '$_id.restaurant',
        role: '$_id.role',
        count: { $size: '$users' },
      },
    },
  ])

  const userCountsByRestaurant = {}
  for (const row of rows) {
    const rid = String(row.restaurant)
    if (!userCountsByRestaurant[rid]) {
      userCountsByRestaurant[rid] = { ...EMPTY_COUNTS }
    }
    const bucket = bucketRole(row.role)
    userCountsByRestaurant[rid][bucket] += row.count
  }

  for (const counts of Object.values(userCountsByRestaurant)) {
    normalizeCounts(counts)
  }

  return userCountsByRestaurant
}

/** Deactivate ghost memberships left behind when user rows were removed. */
async function deactivateOrphanMemberships(restaurantIds) {
  if (!restaurantIds?.length) return 0

  const orphanRows = await Membership.aggregate([
    {
      $match: {
        restaurant: { $in: restaurantIds },
        isActive: true,
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDoc',
      },
    },
    { $match: { userDoc: { $eq: [] } } },
    { $project: { _id: 1 } },
  ])

  if (!orphanRows.length) return 0

  const result = await Membership.updateMany(
    { _id: { $in: orphanRows.map((row) => row._id) } },
    { $set: { isActive: false } },
  )

  return result.modifiedCount || 0
}

module.exports = {
  EMPTY_COUNTS,
  aggregateRestaurantUserCounts,
  deactivateOrphanMemberships,
  normalizeCounts,
}
