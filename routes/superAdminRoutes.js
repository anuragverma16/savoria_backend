const express = require('express')
const router = express.Router()

const { getOverview } = require('../controllers/superAdminController')
const { protect, authorize } = require('../middleware/auth')

router.use(protect)
router.use(authorize('superadmin'))

router.get('/overview', getOverview)

module.exports = router
