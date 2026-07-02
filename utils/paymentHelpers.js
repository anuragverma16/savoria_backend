function verifyUpiPaymentDetails({ paymentTxnId, paymentProofUrl, expectedAmount, clientAmount }) {
  const txn = String(paymentTxnId || '').trim()
  if (!txn || txn.length < 8) {
    const err = new Error('Valid UPI transaction / reference ID is required (min 8 characters)')
    err.statusCode = 400
    throw err
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_\-.]{7,}$/.test(txn)) {
    const err = new Error('Invalid UPI transaction ID format')
    err.statusCode = 400
    throw err
  }
  if (!paymentProofUrl) {
    const err = new Error('Payment screenshot is required')
    err.statusCode = 400
    throw err
  }
  if (clientAmount != null && Math.abs(Number(clientAmount) - expectedAmount) > 0.01) {
    const err = new Error('Payment amount does not match order total')
    err.statusCode = 400
    throw err
  }
  return { verified: true, paymentTxnId: txn }
}

function buildUpiPayUrl({ upiId, payeeName, amount }) {
  const safeAmount = Number(amount)
  if (!upiId || !Number.isFinite(safeAmount) || safeAmount <= 0) return null
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName || 'Restaurant')}&am=${safeAmount.toFixed(2)}&cu=INR`
}

module.exports = { verifyUpiPaymentDetails, buildUpiPayUrl }
