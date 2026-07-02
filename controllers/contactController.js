const asyncHandler = require('express-async-handler')
const Contact = require('../models/Contact')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

exports.submitContact = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const phone = String(req.body.phone || '').trim()
  const restaurantName = String(req.body.restaurantName || req.body.type || '').trim()
  const message = String(req.body.message || '').trim()

  if (!name) {
    res.status(400)
    throw new Error('Name is required')
  }
  if (!email || !EMAIL_RE.test(email)) {
    res.status(400)
    throw new Error('A valid email address is required')
  }
  if (!message || message.length < 5) {
    res.status(400)
    throw new Error('Please enter a message (at least 5 characters)')
  }

  const contact = await Contact.create({
    name,
    email,
    phone,
    restaurantName,
    message,
    status: 'new',
  })

  res.status(201).json({
    success: true,
    message: 'Message sent! We will reply soon.',
    contact: {
      _id: contact._id,
      createdAt: contact.createdAt,
    },
  })
})

exports.listContacts = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
  const skip = (page - 1) * limit
  const status = req.query.status

  const filter = {}
  if (status === 'new' || status === 'read') filter.status = status

  const [contacts, total, newCount] = await Promise.all([
    Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Contact.countDocuments(filter),
    Contact.countDocuments({ status: 'new' }),
  ])

  res.json({
    success: true,
    contacts,
    total,
    page,
    newCount,
  })
})

exports.updateContactStatus = asyncHandler(async (req, res) => {
  const { status } = req.body
  if (!['new', 'read'].includes(status)) {
    res.status(400)
    throw new Error('Status must be new or read')
  }

  const contact = await Contact.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true },
  )

  if (!contact) {
    res.status(404)
    throw new Error('Message not found')
  }

  res.json({ success: true, contact })
})

exports.deleteContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findByIdAndDelete(req.params.id)
  if (!contact) {
    res.status(404)
    throw new Error('Message not found')
  }
  res.json({ success: true, message: 'Message deleted' })
})
