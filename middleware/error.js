// ── Global error handler ─────────────────────────────────────
const errorHandler = (err, req, res, next) => {
  let error = { ...err }
  error.message = err.message

  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.error('💥 Error:', err.stack)
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error.message = `Resource not found with id: ${err.value}`
    return res.status(404).json({ success: false, message: error.message })
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0]
    error.message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
    return res.status(400).json({ success: false, message: error.message })
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    error.message = Object.values(err.errors).map(e => e.message).join(', ')
    return res.status(400).json({ success: false, message: error.message })
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' })
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token has expired' })
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File size too large. Max 5MB allowed.' })
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

// ── 404 handler for unknown routes ──────────────────────────
const notFound = (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` })
}

module.exports = { errorHandler, notFound }
