const asyncHandler = require('express-async-handler')
const Category = require('../models/Category')

exports.getCategories = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const categories = await Category.find({ restaurant: restaurantId }).sort({ sortOrder: 1 })
  res.json({ success: true, categories })
})

exports.createCategory = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant?._id || req.params.restaurantId
  const category = await Category.create({ ...req.body, restaurant: restaurantId })
  res.status(201).json({ success: true, category })
})

exports.updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findOneAndUpdate(
    { _id: req.params.categoryId, restaurant: req.params.restaurantId },
    req.body,
    { new: true }
  )
  if (!category) {
    res.status(404)
    throw new Error('Category not found')
  }
  res.json({ success: true, category })
})

exports.deleteCategory = asyncHandler(async (req, res) => {
  await Category.findOneAndDelete({ _id: req.params.categoryId, restaurant: req.params.restaurantId })
  res.json({ success: true, message: 'Category deleted' })
})
