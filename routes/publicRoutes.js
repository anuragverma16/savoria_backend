const express = require('express')
const router = express.Router()
const {
  validateTable, validateScan, getScanMenu, getPublicMenu, getPublicTables, placeGuestOrder, trackOrder, getPopularMenuItems,
  getPlatformStats,
} = require('../controllers/publicController')
const { submitContact } = require('../controllers/contactController')

router.post('/contact', submitContact)
router.get('/stats', getPlatformStats)
router.get('/scan/validate', validateScan)
router.get('/scan/menu', getScanMenu)
router.get('/:slug/table', validateTable)
router.get('/:slug/tables', getPublicTables)
router.get('/:slug/menu', getPublicMenu)
router.get('/:slug/popular-items', getPopularMenuItems)
router.post('/:slug/orders', placeGuestOrder)
router.get('/orders/:orderId/track', trackOrder)

module.exports = router
