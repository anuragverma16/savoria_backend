const MenuItem = require('../models/MenuItem')

async function validateOrderItems(restaurantId, items) {
  if (!items?.length) {
    const err = new Error('Order must include at least one item')
    err.statusCode = 400
    throw err
  }

  const ids = items.map((i) => i.menuItem).filter(Boolean)
  const dbItems = await MenuItem.find({ _id: { $in: ids }, restaurant: restaurantId })
  const byId = new Map(dbItems.map((i) => [String(i._id), i]))

  for (const item of items) {
    const db = byId.get(String(item.menuItem))
    if (!db) {
      const err = new Error(`"${item.name}" is no longer on the menu`)
      err.statusCode = 400
      throw err
    }
    if (!db.isAvailable) {
      const err = new Error(`"${db.name}" is out of stock`)
      err.statusCode = 400
      throw err
    }
  }
}

function calculateOrderTotals(items, settings = {}, discount = 0) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
  const taxRate = settings.taxRate || 5
  const serviceCharge = settings.serviceCharge || 0
  const tax = Math.round(subtotal * taxRate / 100)
  const service = Math.round(subtotal * serviceCharge / 100)
  const safeDiscount = Math.min(Math.max(0, Number(discount) || 0), subtotal + tax + service)
  return {
    subtotal,
    tax,
    serviceCharge: service,
    discount: safeDiscount,
    total: Math.max(0, subtotal + tax + service - safeDiscount),
  }
}

module.exports = { validateOrderItems, calculateOrderTotals }
