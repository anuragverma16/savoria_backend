const express = require('express')
const router = express.Router()

const {
  getMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleAvailability,
  getBestsellers,
} = require('../controllers/menuController')


const uploadMiddleware = (req, res, next) => {
  uploadMenuImage.single('image')(req, res, function (err) {
    if (err) {
      console.log("UPLOAD ERROR:", err); // 🔍 debug
      return res.status(400).json({
        success: false,
        message: err.message || "Image upload failed"
      });
    }
    next();
  });
};

const { protect, authorize } = require('../middleware/auth')
const { menuItemRules, validate } = require('../middleware/validators')
const { uploadMenuImage } = require('../config/cloudinary')

// ── Public routes ────────────────────────────────────────────
router.get('/', getMenuItems)
router.get('/bestsellers', getBestsellers)
router.get('/:id', getMenuItem)

// ── Protected routes ─────────────────────────────────────────
router.use(protect)



// ✅ Manager-only routes
router.post(
  '/',
  authorize('manager', 'superadmin'),
  uploadMiddleware,
  menuItemRules,
  validate,
  createMenuItem
)

router.put(
  '/:id',
  authorize('manager', 'superadmin'),
  uploadMiddleware,
  menuItemRules,
  validate,
  updateMenuItem
)

router.delete('/:id', authorize('manager', 'superadmin'), deleteMenuItem)

// ✅ Manager + Staff route
router.patch(
  '/:id/toggle-availability',
  authorize('manager', 'staff', 'superadmin'),
  toggleAvailability
)

// out of stock toggle for staff and manager

exports.toggleStock = async (req, res) => {
  const { id } = req.params

  const item = await MenuItem.findById(id)

  item.inStock = !item.inStock
  await item.save()

  res.json(item)
}

module.exports = router