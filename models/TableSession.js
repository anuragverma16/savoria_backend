const mongoose = require('mongoose')

const tableSessionSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    guestCount: { type: Number, default: 1, min: 1 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)

tableSessionSchema.index({ table: 1, user: 1 })
tableSessionSchema.index({ restaurant: 1, user: 1 })
tableSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('TableSession', tableSessionSchema)
