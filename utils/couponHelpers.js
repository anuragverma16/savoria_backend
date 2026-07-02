const Coupon = require('../models/Coupon')

async function findActiveCoupon(restaurantId, code) {
  if (!code || !String(code).trim()) return null
  return Coupon.findOne({
    restaurant: restaurantId,
    code: String(code).trim().toUpperCase(),
    isActive: true,
  })
}

function computeDiscountAmount(coupon, subtotal) {
  const base = Math.max(0, Number(subtotal) || 0)
  let amount = 0

  if (coupon.discountType === 'percentage') {
    amount = Math.round(base * (Number(coupon.discount) || 0) / 100)
    if (coupon.maxDiscount > 0) {
      amount = Math.min(amount, coupon.maxDiscount)
    }
  } else {
    amount = Math.round(Number(coupon.discount) || 0)
  }

  return Math.min(Math.max(0, amount), base)
}

async function validateCouponForOrder(restaurantId, code, subtotal) {
  const coupon = await findActiveCoupon(restaurantId, code)
  if (!coupon) {
    const err = new Error('Invalid or inactive coupon code')
    err.statusCode = 400
    throw err
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    const err = new Error('This coupon has expired')
    err.statusCode = 400
    throw err
  }

  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    const err = new Error('This coupon has reached its usage limit')
    err.statusCode = 400
    throw err
  }

  const orderSubtotal = Math.max(0, Number(subtotal) || 0)
  if (orderSubtotal < (coupon.minOrder || 0)) {
    const err = new Error(`Minimum order ₹${coupon.minOrder} required for this coupon`)
    err.statusCode = 400
    throw err
  }

  const discountAmount = computeDiscountAmount(coupon, orderSubtotal)
  if (discountAmount <= 0) {
    const err = new Error('Coupon does not apply to this order amount')
    err.statusCode = 400
    throw err
  }

  return {
    coupon,
    discountAmount,
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
  }
}

module.exports = {
  findActiveCoupon,
  computeDiscountAmount,
  validateCouponForOrder,
}
