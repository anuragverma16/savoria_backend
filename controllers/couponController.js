const Coupon = require('../models/Coupon')

// GET
exports.getCoupons = async (req, res) => {
  const data = await Coupon.find().sort({ createdAt: -1 })
  res.json(data)
}

// CREATE
exports.createCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.create(req.body)
    res.status(201).json(coupon)
  } catch (err) {
    res.status(500).json({ message: 'Create failed' })
  }
}

// UPDATE
exports.updateCoupon = async (req, res) => {
  try {
    const updated = await Coupon.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
    res.json(updated)
  } catch {
    res.status(500).json({ message: 'Update failed' })
  }
}

// DELETE
exports.deleteCoupon = async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id)
    res.json({ message: 'Deleted' })
  } catch {
    res.status(500).json({ message: 'Delete failed' })
  }
}