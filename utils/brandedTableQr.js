const QRCode = require('qrcode')

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Branded printable table QR — matches Savoria guest scan design */
async function generateBrandedTableQrDataUrl(restaurant, table, qrUrl) {
  const brandName = String(restaurant?.name || 'SAVORIA').toUpperCase().trim().slice(0, 28)
  const initial = brandName.charAt(0) || 'S'
  const qrSize = 340
  const pad = 24
  const brandBlock = 76
  const width = qrSize + pad * 2
  const height = qrSize + pad * 2 + brandBlock

  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: '#0f0f0f', light: '#ffffff' },
  })

  const center = 88
  const cx = pad + qrSize / 2
  const cy = pad + qrSize / 2

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <image href="${qrDataUrl}" x="${pad}" y="${pad}" width="${qrSize}" height="${qrSize}"/>
  <rect x="${cx - center / 2}" y="${cy - center / 2}" width="${center}" height="${center}" fill="#ffffff" rx="6"/>
  <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="38" font-weight="600" fill="#b8860b">${escapeXml(initial)}</text>
  <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="6.5" font-weight="700" fill="#111111" letter-spacing="0.4">SCAN TO VIEW MENU</text>
  <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="6.5" font-weight="700" fill="#111111" letter-spacing="0.4">&amp; PAY</text>
  <text x="${width / 2}" y="${pad + qrSize + 38}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="21" font-weight="600" fill="#111111" letter-spacing="3">${escapeXml(brandName)}</text>
  <text x="${width / 2}" y="${pad + qrSize + 58}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="8.5" fill="#555555" letter-spacing="2.8">RESTAURANT</text>
  <text x="${width / 2}" y="${pad + qrSize + 70}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="7" fill="#888888">Table ${escapeXml(table?.tableNumber || '')}</text>
</svg>`

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

module.exports = { generateBrandedTableQrDataUrl }
