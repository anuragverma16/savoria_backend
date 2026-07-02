const mongoose = require('mongoose')

const couponSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    discountType: { type: String, enum: ['percentage', 'flat'], default: 'percentage' },
    discount: { type: Number, required: true, min: 0 },
    minOrder: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 },
    usageLimit: { type: Number, default: 0 },
    usedCount: { type: Number, default: 0 },
    expiresAt: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

couponSchema.index({ restaurant: 1, code: 1 }, { unique: true })

module.exports = mongoose.model('Coupon', couponSchema)
