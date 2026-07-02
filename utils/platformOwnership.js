const mongoose = require('mongoose')
const Restaurant = require('../models/Restaurant')

const myRestaurantQuery = (userId) => ({
  createdBy: new mongoose.Types.ObjectId(String(userId)),
})

const userOwnsRestaurant = async (userId, restaurantId) => {
  if (!userId || !restaurantId) return false
  const owned = await Restaurant.exists({
    _id: restaurantId,
    ...myRestaurantQuery(userId),
  })
  return Boolean(owned)
}

module.exports = { myRestaurantQuery, userOwnsRestaurant }
