const Order = require('../models/Order')

const WELCOME_DISCOUNT_AMOUNT = 50

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 10) return ''
  return digits.slice(-10)
}

async function getWelcomeDiscountAmount(restaurantId, phone) {
  const normalized = normalizePhone(phone)
  if (!normalized) return 0

  const existing = await Order.findOne({
    restaurant: restaurantId,
    status: { $nin: ['cancelled'] },
    'guest.phone': { $regex: `${normalized}$` },
  }).select('_id')

  return existing ? 0 : WELCOME_DISCOUNT_AMOUNT
}

module.exports = {
  WELCOME_DISCOUNT_AMOUNT,
  normalizePhone,
  getWelcomeDiscountAmount,
}
