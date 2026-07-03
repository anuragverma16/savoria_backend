const { v4: uuidv4 } = require('uuid')
const os = require('os')
const { generateBrandedTableQrDataUrl } = require('./brandedTableQr')

function getClientBaseUrl() {
  const url = (
    process.env.PUBLIC_APP_URL
    || process.env.CLIENT_URL
    || process.env.FRONTEND_URL
    || 'http://localhost:3000'
  ).replace(/\/$/, '')
  return url
}

function isLocalhostUrl(url) {
  return /localhost|127\.0\.0\.1/i.test(url || '')
}

/** Suggested LAN URL for phone testing on the same Wi‑Fi (dev only). */
function getSuggestedLanBaseUrl(port = 3000) {
  const nets = os.networkInterfaces()
  for (const iface of Object.values(nets)) {
    for (const net of iface || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return `http://${net.address}:${port}`
      }
    }
  }
  return null
}

function getQrConfigMeta() {
  const qrBaseUrl = getClientBaseUrl()
  const qrUsesLocalhost = isLocalhostUrl(qrBaseUrl)
  const suggestedLanUrl = qrUsesLocalhost ? getSuggestedLanBaseUrl() : null
  return { qrBaseUrl, qrUsesLocalhost, suggestedLanUrl }
}

/** Canonical QR URL: /scan?restaurantId=&tableId= */
function getTableScanUrl(restaurant, table) {
  const base = getClientBaseUrl()
  const restaurantId = encodeURIComponent(String(restaurant._id || ''))
  const tableId = encodeURIComponent(String(table._id || ''))
  return `${base}/scan?restaurantId=${restaurantId}&tableId=${tableId}`
}

/** @deprecated legacy book-table URL — kept for old printed QRs */
function getTableBookingUrl(restaurant, table) {
  return getTableScanUrl(restaurant, table)
}

/** @deprecated use getTableBookingUrl — kept for compatibility */
function getTableOrderUrl(restaurant, table) {
  return getTableBookingUrl(restaurant, table)
}

async function generateTableQrDataUrl(restaurant, table) {
  const qrUrl = getTableBookingUrl(restaurant, table)
  const qrCodeUrl = await generateBrandedTableQrDataUrl(restaurant, table, qrUrl)
  return { qrCodeUrl, qrUrl, bookingUrl: qrUrl }
}

async function ensureTableQrCode(restaurant, table) {
  if (!table) return table
  let dirty = false

  if (!table.qrToken) {
    table.qrToken = uuidv4()
    dirty = true
  }

  const { qrCodeUrl, qrUrl } = await generateTableQrDataUrl(restaurant, table)
  if (!table.qrCodeUrl || table.qrTargetUrl !== qrUrl) {
    table.qrCodeUrl = qrCodeUrl
    table.qrTargetUrl = qrUrl
    dirty = true
  }

  if (dirty) await table.save()
  return table
}

module.exports = {
  getClientBaseUrl,
  isLocalhostUrl,
  getSuggestedLanBaseUrl,
  getQrConfigMeta,
  getTableScanUrl,
  getTableBookingUrl,
  getTableOrderUrl,
  generateTableQrDataUrl,
  ensureTableQrCode,
}
