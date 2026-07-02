const asyncHandler = require('express-async-handler')
const Membership = require('../models/Membership')
const { PROVISION } = require('../utils/provisionAccess')

const STAFF_ROLES = ['manager', 'waiter', 'chef', 'cashier', 'staff', 'custom']

exports.getStaff = asyncHandler(async (req, res) => {
  const staff = await Membership.find({
    restaurant: req.restaurant._id,
    role: { $in: STAFF_ROLES },
    provisionedBy: PROVISION.PLATFORM,
  })
    .populate('user', 'name email phone isActive lastLogin')
    .sort({ createdAt: -1 })

  res.json({ success: true, staff })
})

exports.createStaff = asyncHandler(async (req, res) => {
  res.status(403)
  throw new Error('Staff must be added by Super Admin from the platform panel')
})

exports.updateStaff = asyncHandler(async (req, res) => {
  const { role: staffRole, isActive, customRoleName } = req.body

  const membership = await Membership.findOne({
    _id: req.params.membershipId,
    restaurant: req.restaurant._id,
    role: { $in: STAFF_ROLES },
  })

  if (!membership) {
    res.status(404)
    throw new Error('Staff member not found')
  }

  if (staffRole !== undefined) {
    if (!STAFF_ROLES.includes(staffRole)) {
      res.status(400)
      throw new Error('Invalid staff role')
    }
    membership.role = staffRole
    membership.customRoleName = staffRole === 'custom' ? (customRoleName || '') : ''
  }

  if (typeof isActive === 'boolean') {
    membership.isActive = isActive
  }

  await membership.save()
  await membership.populate('user', 'name email phone isActive lastLogin')

  res.json({ success: true, staff: membership })
})

exports.removeStaff = asyncHandler(async (req, res) => {
  const membership = await Membership.findOne({
    _id: req.params.membershipId,
    restaurant: req.restaurant._id,
    role: { $in: STAFF_ROLES },
  })

  if (!membership) {
    res.status(404)
    throw new Error('Staff member not found')
  }

  membership.isActive = false
  await membership.save()

  res.json({ success: true, message: 'Staff access removed' })
})
