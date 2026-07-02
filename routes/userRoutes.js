const express = require('express')
const router  = express.Router()

const {
  getAllUsers, getUserById, updateUserRole,
  toggleUserActive, deleteUser,
} = require('../controllers/userController')

const { protect, authorize } = require('../middleware/auth')

// All user-management routes require manager role
router.use(protect)
router.use(authorize('manager', 'superadmin'))

router.get('/',                    getAllUsers)
router.get('/:id',                 getUserById)
router.put('/:id/role',            updateUserRole)
router.patch('/:id/toggle-active', toggleUserActive)
router.delete('/:id',              deleteUser)

module.exports = router
