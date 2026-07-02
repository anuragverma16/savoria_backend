const cloudinary = require('cloudinary').v2
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const multer = require('multer')

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Storage config (Direct upload to Cloudinary)
const menuStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'savoria/menu',

    // file format
    format: file.mimetype.split('/')[1],

    // unique public id
    public_id: `menu_${Date.now()}_${file.originalname
      .split('.')[0]
      .replace(/\s+/g, '_')}`,

    // image optimization
    transformation: [
      {
        width: 600,
        height: 600,
        crop: 'fill',
        quality: 'auto',
        fetch_format: 'auto',
      },
    ],
  }),
})

// Multer middleware
const uploadMenuImage = multer({
  storage: menuStorage,

  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },

  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(
        new Error('Only image files are allowed!'),
        false
      )
    }
  },
})

const paymentProofStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'savoria/payment-proofs',
    format: file.mimetype.split('/')[1],
    public_id: `payment_${Date.now()}_${file.originalname.split('.')[0].replace(/\s+/g, '_')}`,
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
  }),
})

const uploadPaymentProof = multer({
  storage: paymentProofStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Only image files are allowed for payment proof'), false)
  },
})

module.exports = {
  cloudinary,
  uploadMenuImage,
  uploadPaymentProof,
}