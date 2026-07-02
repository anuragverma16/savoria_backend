const mongoose = require('mongoose')

const reviewSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 500 },
    guestName: String,
  },
  { timestamps: true }
)

reviewSchema.index({ restaurant: 1, createdAt: -1 })

module.exports = mongoose.model('Review', reviewSchema)
