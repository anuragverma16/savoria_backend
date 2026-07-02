const asyncHandler = require('express-async-handler')
const Coupon = require('../models/Coupon')
const { validateCouponForOrder } = require('../utils/couponHelpers')

exports.getCoupons = asyncHandler(async (req, res) => {
  const restaurantId = req.params.restaurantId
  const coupons = await Coupon.find({ restaurant: restaurantId }).sort({ createdAt: -1 })
  res.json({ success: true, coupons })
})

exports.createCoupon = asyncHandler(async (req, res) => {
  const restaurantId = req.params.restaurantId
  const coupon = await Coupon.create({ ...req.body, restaurant: restaurantId })
  res.status(201).json({ success: true, coupon })
})

exports.updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findOneAndUpdate(
    { _id: req.params.couponId, restaurant: req.params.restaurantId },
    req.body,
    { new: true, runValidators: true }
  )
  if (!coupon) {
    res.status(404)
    throw new Error('Coupon not found')
  }
  res.json({ success: true, coupon })
})

exports.deleteCoupon = asyncHandler(async (req, res) => {
  const deleted = await Coupon.findOneAndDelete({
    _id: req.params.couponId,
    restaurant: req.params.restaurantId,
  })
  if (!deleted) {
    res.status(404)
    throw new Error('Coupon not found')
  }
  res.json({ success: true, message: 'Coupon deleted' })
})

exports.toggleCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findOne({
    _id: req.params.couponId,
    restaurant: req.params.restaurantId,
  })
  if (!coupon) {
    res.status(404)
    throw new Error('Coupon not found')
  }
  coupon.isActive = !coupon.isActive
  await coupon.save()
  res.json({ success: true, coupon })
})

exports.validateCustomerCoupon = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const { code, subtotal } = req.body

  if (!code?.trim()) {
    res.status(400)
    throw new Error('Coupon code is required')
  }

  const orderSubtotal = Math.max(0, Number(subtotal) || 0)
  const result = await validateCouponForOrder(restaurantId, code, orderSubtotal)

  res.json({
    success: true,
    coupon: {
      code: result.code,
      description: result.description,
      discountType: result.discountType,
      discountAmount: result.discountAmount,
      minOrder: result.coupon.minOrder,
    },
  })
})
