const mongoose = require('mongoose')

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    logo: { url: String },
    coverImage: { url: String },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' },
    },
    gstNumber: { type: String, default: '' },
    ownerName: { type: String, default: '' },
    ownerPhone: { type: String, default: '' },
    status: {
      type: String,
      enum: ['active', 'suspended', 'pending', 'inactive'],
      default: 'pending',
    },
    subscription: {
      plan: { type: String, enum: ['free', 'basic', 'premium', 'enterprise'], default: 'free' },
      status: { type: String, enum: ['active', 'expired', 'cancelled', 'trial'], default: 'trial' },
      startDate: { type: Date, default: Date.now },
      endDate: Date,
      billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    },
    settings: {
      currency: { type: String, default: 'INR' },
      taxRate: { type: Number, default: 5 },
      serviceCharge: { type: Number, default: 0 },
      theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
      allowGuestOrdering: { type: Boolean, default: true },
      upiId: { type: String, default: '' },
      upiPayeeName: { type: String, default: '' },
      razorpayKeyId: String,
      razorpayKeySecret: String,
    },
    features: {
      maxTables: { type: Number, default: 10 },
      maxStaff: { type: Number, default: 5 },
      maxMenuItems: { type: Number, default: 50 },
      analytics: { type: Boolean, default: false },
      customBranding: { type: Boolean, default: false },
    },
    stats: {
      totalOrders: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

restaurantSchema.index({ status: 1 })
restaurantSchema.index({ 'subscription.plan': 1 })

module.exports = mongoose.model('Restaurant', restaurantSchema)
