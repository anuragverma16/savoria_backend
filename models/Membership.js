const mongoose = require('mongoose')

const STAFF_PERMISSIONS = [
  'orders.view', 'orders.manage', 'kitchen.view', 'kitchen.update',
  'tables.view', 'tables.manage', 'menu.view', 'menu.manage',
  'staff.view', 'staff.manage', 'reports.view', 'billing.manage',
  'customers.view', 'settings.manage',
]

const membershipSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    role: {
      type: String,
      enum: ['restaurant_admin', 'manager', 'waiter', 'chef', 'cashier', 'staff', 'custom', 'customer'],
      required: true,
    },
    customRoleName: { type: String, default: '' },
    permissions: [{ type: String, enum: STAFF_PERMISSIONS }],
    isActive: { type: Boolean, default: true },
    provisionedBy: {
      type: String,
      enum: ['platform', 'restaurant', 'self'],
      default: 'self',
    },
    assignedTables: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Table' }],
  },
  { timestamps: true }
)

membershipSchema.index({ user: 1, restaurant: 1 }, { unique: true })
membershipSchema.index({ restaurant: 1, role: 1 })

const DEFAULT_PERMISSIONS = {
  restaurant_admin: STAFF_PERMISSIONS,
  manager: ['orders.view', 'orders.manage', 'kitchen.view', 'tables.view', 'tables.manage', 'staff.view', 'reports.view', 'customers.view'],
  waiter: ['orders.view', 'orders.manage', 'tables.view', 'customers.view'],
  staff: ['orders.view', 'orders.manage', 'kitchen.view', 'tables.view'],
  chef: ['kitchen.view', 'kitchen.update', 'orders.view'],
  cashier: ['orders.view', 'billing.manage', 'customers.view'],
  customer: [],
  custom: [],
}

membershipSchema.pre('save', function (next) {
  if (this.isNew && (!this.permissions || this.permissions.length === 0)) {
    this.permissions = DEFAULT_PERMISSIONS[this.role] || []
  }
  next()
})

module.exports = mongoose.model('Membership', membershipSchema)
module.exports.STAFF_PERMISSIONS = STAFF_PERMISSIONS
module.exports.DEFAULT_PERMISSIONS = DEFAULT_PERMISSIONS
