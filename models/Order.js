const mongoose = require('mongoose')

const orderItemSchema = new mongoose.Schema(
  {
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
    image: String,
    notes: String,
  },
  { _id: false }
)

const statusHistorySchema = new mongoose.Schema(
  {
    status: String,
    note: String,
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    staffRole: String,
  },
  { _id: false }
)

const ORDER_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'refunded']

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, unique: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
    tableNumber: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    guest: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      guestCount: { type: Number, default: 1 },
    },
    items: {
      type: [orderItemSchema],
      validate: [(arr) => arr.length > 0, 'Order must have items'],
    },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    statusHistory: { type: [statusHistorySchema], default: [] },
    orderType: { type: String, enum: ['dine-in', 'takeaway', 'delivery'], default: 'dine-in' },
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    serviceCharge: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    welcomeDiscount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    couponCode: String,
    paymentProofUrl: String,
    paymentMethod: { type: String, enum: ['cash', 'upi', 'card', 'online'], default: 'upi' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    specialInstructions: { type: String, maxlength: 500 },
    assignedStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    preparedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    servedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    estimatedTime: { type: Number, default: 20 },
    pointsEarned: { type: Number, default: 0 },
    invoiceUrl: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

orderSchema.pre('save', async function (next) {
  if (!this.orderId) {
    this.orderId = `DF${Date.now().toString(36).toUpperCase()}`
  }
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      updatedBy: this.updatedBy,
      timestamp: new Date(),
    })
  }
  next()
})

orderSchema.index({ restaurant: 1, createdAt: -1 })
orderSchema.index({ restaurant: 1, status: 1 })
orderSchema.index({ table: 1 })

module.exports = mongoose.model('Order', orderSchema)
module.exports.ORDER_STATUSES = ORDER_STATUSES
