const mongoose = require('mongoose')
const { v4: uuidv4 } = require('uuid')

const tableSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    tableNumber: { type: String, required: true, trim: true },
    label: { type: String, default: '' },
    capacity: { type: Number, default: 4, min: 1 },
    status: {
      type: String,
      enum: ['available', 'occupied', 'reserved', 'cleaning'],
      default: 'available',
    },
    qrToken: { type: String, unique: true, default: () => uuidv4() },
    qrCodeUrl: { type: String, default: '' },
    qrTargetUrl: { type: String, default: '' },
    location: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    currentOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    activeGuestCount: { type: Number, default: 0, min: 0 },
    lastOccupiedAt: Date,
  },
  { timestamps: true }
)

tableSchema.index({ restaurant: 1, tableNumber: 1 }, { unique: true })
tableSchema.index({ restaurant: 1, status: 1 })

module.exports = mongoose.model('Table', tableSchema)
