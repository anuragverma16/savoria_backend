const mongoose = require('mongoose')

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, trim: true, default: '', maxlength: 30 },
    restaurantName: { type: String, trim: true, default: '', maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: ['new', 'read'], default: 'new' },
  },
  { timestamps: true },
)

contactSchema.index({ status: 1, createdAt: -1 })
contactSchema.index({ email: 1 })

module.exports = mongoose.model('Contact', contactSchema)
