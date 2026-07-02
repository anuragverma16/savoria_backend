const mongoose = require('mongoose')

const loginHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    method: {
      type: String,
      enum: ['whatsapp_otp', 'email_otp', 'password', 'refresh'],
      default: 'whatsapp_otp',
    },
    loginRole: {
      type: String,
      enum: ['superadmin', 'admin', 'staff', 'user', 'customer'],
      default: 'user',
    },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' },
    userAgent: String,
    ip: String,
  },
  { timestamps: true },
)

loginHistorySchema.index({ createdAt: -1 })

module.exports = mongoose.model('LoginHistory', loginHistorySchema)
