const express = require('express')
const router = express.Router()
const {
  getOverview, getRestaurants, createRestaurant, createRestaurantAdmin, getRestaurantAdmins,
  getRestaurantStaff, createRestaurantStaff, sendProvisionEmailOtp,
  updateRestaurant, suspendRestaurant, activateRestaurant, deleteRestaurant, getRestaurantAnalytics,
  getPlatformOrders,
  getPlatformUsers,
  getPlatformLoginHistory,
  getRestaurantCustomerDashboard,
} = require('../controllers/platformController')
const {
  listContacts, updateContactStatus, deleteContact,
} = require('../controllers/contactController')
const { protect, authorizePlatform } = require('../middleware/auth')

router.use(protect, authorizePlatform('superadmin'))

router.get('/overview', getOverview)
router.get('/contacts', listContacts)
router.patch('/contacts/:id', updateContactStatus)
router.delete('/contacts/:id', deleteContact)
router.get('/orders', getPlatformOrders)
router.get('/users', getPlatformUsers)
router.get('/login-history', getPlatformLoginHistory)
router.get('/restaurants/:id/customer-dashboard', getRestaurantCustomerDashboard)
router.post('/provision/email-otp', sendProvisionEmailOtp)
router.get('/restaurants', getRestaurants)
router.post('/restaurants', createRestaurant)
router.get('/restaurants/:id/admins', getRestaurantAdmins)
router.post('/restaurants/:id/admins', createRestaurantAdmin)
router.get('/restaurants/:id/staff', getRestaurantStaff)
router.post('/restaurants/:id/staff', createRestaurantStaff)
router.put('/restaurants/:id', updateRestaurant)
router.patch('/restaurants/:id/suspend', suspendRestaurant)
router.patch('/restaurants/:id/activate', activateRestaurant)
router.delete('/restaurants/:id', deleteRestaurant)
router.get('/restaurants/:id/analytics', getRestaurantAnalytics)

module.exports = router
