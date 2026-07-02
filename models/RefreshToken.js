const mongoose = require('mongoose')

const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    userAgent: String,
    ip: String,
  },
  { timestamps: true }
)

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('RefreshToken', refreshTokenSchema)
