const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    phone: { type: String, default: '' },
    avatar: { type: String, default: '' },
    platformRole: {
      type: String,
      enum: ['superadmin', 'admin', 'staff', 'customer'],
      default: 'customer',
    },
    isActive: { type: Boolean, default: true },
    address: { street: String, city: String, state: String, pincode: String },
    gstNumber: { type: String, default: '' },
    loyaltyPoints: { type: Number, default: 0 },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }],
    lastLogin: Date,
  },
  { timestamps: true }
)

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  if (!this.avatar) {
    this.avatar = this.name.trim().split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  }
  next()
})

userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password)
}

userSchema.virtual('initials').get(function () {
  return this.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
})

module.exports = mongoose.model('User', userSchema)
