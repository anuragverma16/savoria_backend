const express = require('express')
const router = express.Router()
const {
  login, register, refresh, getMe, updateProfile, logout, switchRestaurant, impersonate,
} = require('../controllers/authController')
const { sendOtp, verifyOtp, sendWhatsappOtp, verifyWhatsappOtp, sendEmailOtp, verifyEmailSignup, verifyEmailLogin } = require('../controllers/otpController')
const { protect, authorizePlatform } = require('../middleware/auth')

router.post('/login', login)
router.post('/register', register)
router.post('/otp/send', sendOtp)
router.post('/otp/verify', verifyOtp)
router.post('/send-whatsapp-otp', sendWhatsappOtp)
router.post('/verify-whatsapp-otp', verifyWhatsappOtp)
router.post('/email-otp/send', sendEmailOtp)
router.post('/email-otp/verify-signup', verifyEmailSignup)
router.post('/email-otp/verify-login', verifyEmailLogin)
router.post('/refresh', refresh)
router.post('/logout', logout)

router.get('/me', protect, getMe)
router.patch('/profile', protect, updateProfile)
router.post('/switch-restaurant', protect, switchRestaurant)
router.post('/impersonate/:restaurantId', protect, authorizePlatform('superadmin'), impersonate)

module.exports = router
