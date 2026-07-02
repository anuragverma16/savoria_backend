const express = require('express')
const router = express.Router()

const {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} = require('../controllers/couponController')

// simple CRUD
router.get('/', getCoupons)
router.post('/', createCoupon)
router.put('/:id', updateCoupon)
router.delete('/:id', deleteCoupon)

module.exports = router
