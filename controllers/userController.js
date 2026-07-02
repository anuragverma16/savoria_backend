const asyncHandler = require('express-async-handler')
const User  = require('../models/User')
const Order = require('../models/Order')

// ─────────────────────────────────────────────────────────────
// @route   GET /api/users
// @access  Private (manager)
// ─────────────────────────────────────────────────────────────
exports.getAllUsers = asyncHandler(async (req, res) => {
  const { role, search, page = 1, limit = 20 } = req.query

  const filter = {}

  if (role) filter.role = role

  if (search) {
    filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ]
  }

  const skip = (Number(page) - 1) * Number(limit)

  const total = await User.countDocuments(filter)

  const users = await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))

  res.json({
    success: true,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    users,
  })
})

// ─────────────────────────────────────────────────────────────
// @route   GET /api/users/:id
// @access  Private (manager)
// ─────────────────────────────────────────────────────────────
exports.getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password')

  if (!user) {
    res.status(404)
    throw new Error('User not found')
  }

  const orders = await Order.find({ user: req.params.id })
    .sort({ createdAt: -1 })
    .limit(5)

  res.json({
    success: true,
    user,
    recentOrders: orders,
  })
})

// ─────────────────────────────────────────────────────────────
// @route   PUT /api/users/:id/role
// @access  Private (manager)
// ─────────────────────────────────────────────────────────────
exports.updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body

  const allowedRoles = ['user', 'staff', 'manager']
  if (req.user.role === 'superadmin') allowedRoles.push('superadmin')

  if (!allowedRoles.includes(role)) {
    res.status(400)
    throw new Error('Invalid role')
  }

  const user = await User.findById(req.params.id)

  if (!user) {
    res.status(404)
    throw new Error('User not found')
  }

  // 🚨 Prevent self role change (important)
  if (user._id.toString() === req.user.id) {
    res.status(400)
    throw new Error('You cannot change your own role')
  }

  user.role = role
  await user.save()

  const { password, ...safeUser } = user.toObject()

  res.json({
    success: true,
    user: safeUser,
  })
})

// ─────────────────────────────────────────────────────────────
// @route   PATCH /api/users/:id/toggle-active
// @access  Private (manager)
// ─────────────────────────────────────────────────────────────
exports.toggleUserActive = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)

  if (!user) {
    res.status(404)
    throw new Error('User not found')
  }

  // 🚨 Prevent self deactivation
  if (user._id.toString() === req.user.id) {
    res.status(400)
    throw new Error('You cannot deactivate your own account')
  }

  user.isActive = !user.isActive
  await user.save()

  const { password, ...safeUser } = user.toObject()

  res.json({
    success: true,
    isActive: user.isActive,
    user: safeUser,
  })
})

// ─────────────────────────────────────────────────────────────
// @route   DELETE /api/users/:id
// @access  Private (manager)
// ─────────────────────────────────────────────────────────────
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)

  if (!user) {
    res.status(404)
    throw new Error('User not found')
  }

  // 🚨 Prevent self delete
  if (user._id.toString() === req.user.id) {
    res.status(400)
    throw new Error('You cannot delete your own account')
  }

  await user.deleteOne()

  res.json({
    success: true,
    message: 'User deleted successfully',
  })
})