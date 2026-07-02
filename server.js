const { logOtpConfig } = require('./config/env')
const { setTwilioWhatsAppConfig } = require('./utils/twilioWhatsApp')
const { setEmailOtpConfig } = require('./utils/emailConfig')
const { verifyMailConnection } = require('./config/mail')

setTwilioWhatsAppConfig({
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  from: process.env.TWILIO_WHATSAPP_FROM,
  contentSid: process.env.TWILIO_CONTENT_SID,
  otpVariableKey: process.env.TWILIO_OTP_VARIABLE_KEY || '1',
})

const EMAIL_OTP = {
  gmail: '',
  appPassword: '',
}

setEmailOtpConfig({
  user: EMAIL_OTP.gmail || process.env.EMAIL_USER || '',
  pass: EMAIL_OTP.appPassword || process.env.EMAIL_PASS || '',
})

const express = require('express')
const http = require('http')
const mongoose = require('mongoose')
const { Server } = require('socket.io')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const connectDB = require('./config/db')
const { errorHandler, notFound } = require('./middleware/error')
const { ensureSuperAdmin } = require('./utils/ensureSuperAdmin')
const { syncPlatformRestaurants } = require('./utils/syncPlatformRestaurants')
const { syncAllUserPlatformRoles } = require('./utils/userPlatformRole')

const authRoutes = require('./routes/authRoutes')
const platformRoutes = require('./routes/platformRoutes')
const publicRoutes = require('./routes/publicRoutes')
const restaurantRoutes = require('./routes/restaurantRoutes')

connectDB().then(async () => {
  if (process.env.NODE_ENV !== 'production') {
    try {
      await ensureSuperAdmin()
      await syncPlatformRestaurants()
      const roleSync = await syncAllUserPlatformRoles()
      if (roleSync > 0) {
        console.log(`✅ Synced platformRole for ${roleSync} user(s)`)
      }
    } catch (err) {
      console.warn('⚠️ Could not ensure Super Admin user:', err.message)
    }
  }
})

const app = express()
const server = http.createServer(app)

// =======================
// Allowed Origins
// =======================

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://savoria-app-frontend-ekzd.vercel.app",
  process.env.CLIENT_URL,
].filter(Boolean)

// =======================
// Socket.io
// =======================

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin) return callback(null, true)

      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      console.log("Socket Blocked Origin:", origin)
      callback(new Error("Not allowed by CORS"))
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  },
})

app.set("io", io)

io.on("connection", (socket) => {
  socket.on("join-restaurant", (restaurantId) => {
    socket.join(`restaurant_${restaurantId}`)
    socket.join(`restaurant_${restaurantId}_kitchen`)
  })

  socket.on("join-kitchen", (restaurantId) => {
    socket.join(`restaurant_${restaurantId}_kitchen`)
  })

  socket.on("join-table", (tableId) => {
    socket.join(`table_${tableId}`)
  })

  socket.on("disconnect", () => {})
})

// =======================
// Security
// =======================

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
)

// =======================
// CORS
// =======================

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true)

      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      console.log("Blocked Origin:", origin)

      callback(new Error("Not allowed by CORS"))
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Restaurant-Id",
      "Idempotency-Key",
    ],
  })
)

// Handle browser preflight requests
app.options("*", cors())

app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))
app.use(express.urlencoded({ extended: true }))

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'))

app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }))
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }))
app.use('/api/auth/otp', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many OTP requests. Please try again later.' },
}))
app.use('/api/auth/send-whatsapp-otp', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many WhatsApp OTP requests. Please try again later.' },
}))
app.use('/api/auth/email-otp', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, message: 'Too many email code requests. Please try again later.' },
}))
app.use('/api/auth/verify-whatsapp-otp', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many verification attempts. Please try again later.' },
}))
app.use('/api/public/contact', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: { success: false, message: 'Too many contact requests. Please try again later.' },
}))

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'DineFlow API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/platform', platformRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/restaurants/:restaurantId', restaurantRoutes)

app.use(notFound)
app.use(errorHandler)

const PORT = process.env.PORT || 5000

const startServer = () => {
  server.listen(PORT, async () => {
    console.log(`\n🍽️  DineFlow API → http://localhost:${PORT}\n`)
    logOtpConfig()
    const mail = await verifyMailConnection()
    if (mail.ok) {
      console.log('📧 Email OTP: Gmail SMTP ready — codes will be sent to user inbox\n')
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  Email OTP not ready:', mail.reason)
      console.warn('   Fill EMAIL_OTP.gmail + EMAIL_OTP.appPassword in backend/server.js')
      console.warn('   App Password: https://myaccount.google.com/apppasswords\n')
    }
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${PORT} is already in use. Run: npm run dev\n`)
    } else {
      console.error('Server error:', err.message)
    }
    process.exit(1)
  })
}

const shutdown = () => {
  server.close(() => {
    mongoose.connection.close(false).finally(() => process.exit(0))
  })
  setTimeout(() => process.exit(1), 3000).unref()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.once('SIGUSR2', () => {
  server.close(() => process.kill(process.pid, 'SIGUSR2'))
})

startServer()

module.exports = { app, server, io }
