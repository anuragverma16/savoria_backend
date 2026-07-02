const mongoose = require('mongoose')

const menuItemSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, default: 0, min: 0 },
    portionSize: { type: Number, min: 0 },
    portionUnit: { type: String, enum: ['', 'ml', 'gm', 'l', 'kg', 'pcs', 'plate'], default: '' },
    discount: { type: Number, default: 0, min: 0, max: 100 },
    image: { url: String, publicId: String },
    isVeg: { type: Boolean, default: true },
    isAvailable: { type: Boolean, default: true },
    isBestseller: { type: Boolean, default: false },
    isRecommended: { type: Boolean, default: false },
    prepTime: { type: String, default: '15 min' },
    calories: { type: Number, default: 0 },
    tags: [String],
    rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

menuItemSchema.index({ restaurant: 1, category: 1 })
menuItemSchema.index({ restaurant: 1, isAvailable: 1 })

module.exports = mongoose.model('MenuItem', menuItemSchema)
