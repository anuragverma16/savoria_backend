require('dotenv').config()
const connectDB = require('../config/db')
const User = require('../models/User')
const { ensureSuperAdmin } = require('./ensureSuperAdmin')
const { syncPlatformRestaurants } = require('./syncPlatformRestaurants')

const seed = async () => {
  await connectDB()
  console.log('🌱 DineFlow seed — Super Admin only (no demo data)')

  await ensureSuperAdmin()
  await syncPlatformRestaurants()

  console.log('\n✅ Done. Only Super Admin is ensured.')
  console.log('   Super Admin → superadmin@dineflow.com / super123')
  console.log('   Create your restaurant via Sign Up as Admin, or from Super Admin panel.\n')
  process.exit(0)
}

seed().catch((e) => { console.error(e); process.exit(1) })
