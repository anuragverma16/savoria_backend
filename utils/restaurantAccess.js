const RESTAURANT_SUSPENDED_MESSAGE = 'Restaurant suspended by super admin'

function isRestaurantSuspended(restaurant) {
  return restaurant?.status === 'suspended'
}

function assertRestaurantNotSuspended(restaurant, res) {
  if (isRestaurantSuspended(restaurant)) {
    if (res) {
      res.status(403)
    }
    const err = new Error(RESTAURANT_SUSPENDED_MESSAGE)
    err.statusCode = 403
    throw err
  }
}

module.exports = {
  RESTAURANT_SUSPENDED_MESSAGE,
  isRestaurantSuspended,
  assertRestaurantNotSuspended,
}
