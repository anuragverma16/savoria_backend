const mongoose = require('mongoose')

const categorySchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    image: { url: String },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

categorySchema.index({ restaurant: 1, name: 1 }, { unique: true })

module.exports = mongoose.model('Category', categorySchema)
