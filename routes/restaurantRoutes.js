const express = require('express')
const router = express.Router({ mergeParams: true })
const {
  getTables, createTable, createTablesBulk, updateTable, deleteTable, regenerateQR, regenerateAllQR, updateTableStatus,
} = require('../controllers/tableController')
const {
  getCategories, createCategory, updateCategory, deleteCategory,
} = require('../controllers/categoryController')
const {
  getMenuItems, createMenuItem, updateMenuItem, deleteMenuItem, toggleAvailability,
} = require('../controllers/menuController')
const {
  getOrders, getKitchenOrders, updateOrderStatus, getAnalytics, getOrder,
  placeCustomerOrder, getMyCustomerOrders, checkInCustomerTable,
  previewCustomerCheckout, verifyUpiPayment, validateTableQr, getMyTableSession,
} = require('../controllers/orderController')
const {
  getCoupons, createCoupon, updateCoupon, deleteCoupon, toggleCoupon, validateCustomerCoupon,
} = require('../controllers/restaurantCouponController')
const { getSettings, updateSettings } = require('../controllers/settingsController')
const { getStaff, createStaff, updateStaff, removeStaff } = require('../controllers/staffController')
const { protect, authorizePlatform, authorizeMembership, requirePermission, resolveTenant } = require('../middleware/auth')
const { uploadMenuImage, uploadPaymentProof } = require('../config/cloudinary')

const tenantAccess = [protect, resolveTenant]
const adminAccess = [...tenantAccess, authorizeMembership('restaurant_admin', 'manager')]
const staffAccess = [...tenantAccess, authorizeMembership('restaurant_admin', 'manager', 'waiter', 'chef', 'cashier', 'staff')]
const orderStaffAccess = [...tenantAccess, authorizeMembership('restaurant_admin', 'manager', 'waiter', 'chef', 'cashier', 'staff')]

const kitchenAccess = [...tenantAccess, authorizeMembership('restaurant_admin', 'manager', 'chef', 'staff')]
const customerAccess = [...tenantAccess, authorizeMembership('customer')]

const maybeUploadMenuImage = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    return uploadMenuImage.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message })
      next()
    })
  }
  next()
}

const maybeUploadPaymentProof = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    return uploadPaymentProof.single('paymentProof')(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message })
      next()
    })
  }
  next()
}

// Tables
router.get('/tables', staffAccess, getTables)
router.post('/tables/bulk', adminAccess, requirePermission('tables.manage'), createTablesBulk)
router.post('/tables', adminAccess, requirePermission('tables.manage'), createTable)
router.put('/tables/:tableId', adminAccess, requirePermission('tables.manage'), updateTable)
router.delete('/tables/:tableId', adminAccess, requirePermission('tables.manage'), deleteTable)
router.post('/tables/:tableId/qr', adminAccess, regenerateQR)
router.post('/tables/qr/regenerate-all', adminAccess, requirePermission('tables.manage'), regenerateAllQR)
router.patch('/tables/:tableId/status', staffAccess, updateTableStatus)

// Categories
router.get('/categories', staffAccess, getCategories)
router.post('/categories', adminAccess, requirePermission('menu.manage'), createCategory)
router.put('/categories/:categoryId', adminAccess, requirePermission('menu.manage'), updateCategory)
router.delete('/categories/:categoryId', adminAccess, requirePermission('menu.manage'), deleteCategory)

// Menu
router.get('/menu', staffAccess, getMenuItems)
router.post('/menu', adminAccess, requirePermission('menu.manage'), maybeUploadMenuImage, createMenuItem)
router.put('/menu/:itemId', adminAccess, requirePermission('menu.manage'), maybeUploadMenuImage, updateMenuItem)
router.delete('/menu/:itemId', adminAccess, requirePermission('menu.manage'), deleteMenuItem)
router.patch('/menu/:itemId/toggle', staffAccess, toggleAvailability)

// Orders
router.get('/orders', orderStaffAccess, getOrders)
router.get('/orders/kitchen', kitchenAccess, getKitchenOrders)
router.get('/orders/:orderId', orderStaffAccess, getOrder)
router.patch('/orders/:orderId/status', orderStaffAccess, updateOrderStatus)
router.post('/checkout-preview', customerAccess, previewCustomerCheckout)
router.post('/verify-upi-payment', customerAccess, maybeUploadPaymentProof, verifyUpiPayment)
router.post('/customer-orders', customerAccess, maybeUploadPaymentProof, placeCustomerOrder)
router.post('/table-check-in', customerAccess, checkInCustomerTable)
router.post('/validate-table-qr', customerAccess, validateTableQr)
router.get('/my-table-session', customerAccess, getMyTableSession)
router.get('/my-orders', customerAccess, getMyCustomerOrders)

// Analytics
router.get('/analytics', adminAccess, requirePermission('reports.view'), getAnalytics)
router.get('/orders/analytics', adminAccess, requirePermission('reports.view'), getAnalytics)

// Coupons
router.get('/coupons', adminAccess, getCoupons)
router.post('/coupons/validate', customerAccess, validateCustomerCoupon)
router.post('/coupons', adminAccess, createCoupon)
router.put('/coupons/:couponId', adminAccess, updateCoupon)
router.delete('/coupons/:couponId', adminAccess, deleteCoupon)
router.patch('/coupons/:couponId/toggle', adminAccess, toggleCoupon)

// Settings
router.get('/settings', adminAccess, requirePermission('settings.manage'), getSettings)
router.put('/settings', adminAccess, requirePermission('settings.manage'), updateSettings)

// Staff (admin only)
router.get('/staff', adminAccess, requirePermission('staff.view'), getStaff)
router.post('/staff', adminAccess, requirePermission('staff.manage'), createStaff)
router.patch('/staff/:membershipId', adminAccess, requirePermission('staff.manage'), updateStaff)
router.delete('/staff/:membershipId', adminAccess, requirePermission('staff.manage'), removeStaff)

module.exports = router
