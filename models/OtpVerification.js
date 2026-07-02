const mongoose = require('mongoose')

const otpVerificationSchema = new mongoose.Schema(
  {
    phone: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true, trim: true },
    channel: { type: String, enum: ['sms', 'whatsapp', 'email'], default: 'sms' },
    code: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    lastSentAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

otpVerificationSchema.index({ phone: 1, channel: 1 }, {
  unique: true,
  partialFilterExpression: { phone: { $type: 'string', $ne: '' } },
})
otpVerificationSchema.index({ email: 1, channel: 1 }, {
  unique: true,
  partialFilterExpression: { email: { $type: 'string', $ne: '' } },
})
otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('OtpVerification', otpVerificationSchema)
