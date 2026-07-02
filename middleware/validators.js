const { body, param, query, validationResult } = require('express-validator')

// ── Run validations and return errors ────────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors:  errors.array(),
    })
  }
  next()
}

// ── Auth validators ──────────────────────────────────────────
const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 60 }).withMessage('Name too long'),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['user']).withMessage('Only user signup is allowed publicly'),
]

const loginRules = [
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
]

// ── Menu item validators ─────────────────────────────────────
const menuItemRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('price').isNumeric().withMessage('Price must be a number').custom(v => v > 0).withMessage('Price must be positive'),
  body('category').isIn(['Starters', 'Main Course', 'Biryani', 'Breads', 'Desserts', 'Drinks', 'Specials']).withMessage('Invalid category'),
  body('isVeg').optional().isBoolean().withMessage('isVeg must be boolean'),
  body('calories').optional().isNumeric().withMessage('Calories must be a number'),
]

// ── Order validators ─────────────────────────────────────────
const orderRules = [
  body('items').isArray({ min: 1 }).withMessage('Order must have at least one item'),
  body('items.*.menuItem').notEmpty().withMessage('Menu item ID required'),
  body('items.*.qty').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('orderType').optional().isIn(['delivery', 'dine-in', 'takeaway']).withMessage('Invalid order type'),
  body('paymentMethod').optional().isIn(['cash', 'upi', 'card', 'online']).withMessage('Invalid payment method'),
]

// ── Review validators ────────────────────────────────────────
const reviewRules = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().isLength({ max: 400 }).withMessage('Comment too long'),
]

module.exports = {
  validate,
  registerRules, loginRules,
  menuItemRules, orderRules, reviewRules,
}
