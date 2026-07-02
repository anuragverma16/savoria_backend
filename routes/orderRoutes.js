const express = require('express')
const router  = express.Router()

const {
  createOrder, getMyOrders, getOrderById,
  getAllOrders, updateOrderStatus, cancelOrder, getAnalytics,
} = require('../controllers/orderController')

const { protect, authorize } = require('../middleware/auth')
const { orderRules, validate } = require('../middleware/validators')

router.use(protect)

// ── User routes ──────────────────────────────────────────────
router.post('/', authorize('user', 'superadmin'), orderRules, validate, createOrder)
router.get('/my-orders', authorize('user', 'superadmin'), getMyOrders)
router.patch('/:id/cancel', authorize('user', 'superadmin'), cancelOrder)

// ── Staff + Manager routes ───────────────────────────────────
router.get('/', authorize('staff', 'manager', 'superadmin'), getAllOrders)
router.patch('/:id/status', authorize('staff', 'manager', 'superadmin'), updateOrderStatus)

// ── Manager only ─────────────────────────────────────────────
router.get('/analytics', authorize('manager', 'superadmin'), getAnalytics)

// ── Any authenticated user can view a single order ───────────
router.get('/:id', getOrderById)

module.exports = router