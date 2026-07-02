const Order = require('../models/Order')
const Table = require('../models/Table')
const TableSession = require('../models/TableSession')

const CLOSED_STATUSES = ['completed', 'cancelled', 'refunded']

function resolveDisplayStatus(table, seatInfo) {
  if (!table) return 'unavailable'
  if (table.status === 'reserved') return 'reserved'
  if (table.status === 'cleaning') return 'cleaning'
  if (seatInfo?.seatsAvailable <= 0) return 'occupied'
  return 'available'
}

async function getActiveTableSessions(tableId) {
  return TableSession.find({
    table: tableId,
    expiresAt: { $gt: new Date() },
  }).select('guestCount user')
}

async function getTableSeatInfo(tableId) {
  const table = await Table.findById(tableId)
  if (!table) return null

  const activeOrders = await Order.find({
    table: tableId,
    status: { $nin: CLOSED_STATUSES },
  }).select('guest status orderId')

  const sessions = await getActiveTableSessions(tableId)

  const orderGuests = activeOrders.reduce(
    (sum, order) => sum + (order.guest?.guestCount || 1),
    0,
  )
  const sessionGuests = sessions.reduce((sum, session) => sum + (session.guestCount || 1), 0)
  const seatedGuests = orderGuests + sessionGuests
  const seatsAvailable = Math.max(0, table.capacity - seatedGuests)

  return {
    table,
    seatedGuests,
    seatsAvailable,
    activeOrderCount: activeOrders.length,
    activeSessionCount: sessions.length,
    isFull: seatsAvailable <= 0,
    displayStatus: resolveDisplayStatus(table, { seatedGuests, seatsAvailable }),
  }
}

async function syncTableOccupancy(tableId) {
  const info = await getTableSeatInfo(tableId)
  if (!info) return null

  const { table, seatedGuests, seatsAvailable } = info

  if (table.status === 'cleaning' || table.status === 'reserved') {
    table.activeGuestCount = seatedGuests
    await table.save()
    return { ...info, table }
  }

  if (seatedGuests <= 0) {
    table.status = 'available'
    table.currentOrder = null
  } else if (seatsAvailable <= 0) {
    table.status = 'occupied'
    table.lastOccupiedAt = table.lastOccupiedAt || new Date()
  } else {
    table.status = 'available'
    table.lastOccupiedAt = table.lastOccupiedAt || new Date()
  }

  table.activeGuestCount = seatedGuests
  const latestOrder = info.activeOrderCount
    ? await Order.findOne({
        table: tableId,
        status: { $nin: CLOSED_STATUSES },
      }).sort({ createdAt: -1 }).select('_id')
    : null
  table.currentOrder = latestOrder?._id || null
  await table.save()

  return { ...info, table, displayStatus: resolveDisplayStatus(table, { seatedGuests, seatsAvailable }) }
}

async function clearUserTableSessions(restaurantId, userId, tableId = null) {
  const filter = { restaurant: restaurantId, user: userId }
  if (tableId) filter.table = tableId
  await TableSession.deleteMany(filter)
}

async function getRestaurantTablesSeatInfo(restaurantId) {
  const tables = await Table.find({ restaurant: restaurantId, isActive: { $ne: false } })
  if (!tables.length) return []

  const tableIds = tables.map((t) => t._id)
  const [orders, sessions] = await Promise.all([
    Order.find({
      table: { $in: tableIds },
      status: { $nin: CLOSED_STATUSES },
    }).select('table guest'),
    TableSession.find({
      table: { $in: tableIds },
      expiresAt: { $gt: new Date() },
    }).select('table guestCount'),
  ])

  const orderGuestsByTable = new Map()
  for (const order of orders) {
    const key = String(order.table)
    orderGuestsByTable.set(key, (orderGuestsByTable.get(key) || 0) + (order.guest?.guestCount || 1))
  }

  const sessionGuestsByTable = new Map()
  for (const session of sessions) {
    const key = String(session.table)
    sessionGuestsByTable.set(key, (sessionGuestsByTable.get(key) || 0) + (session.guestCount || 1))
  }

  return tables.map((table) => {
    const key = String(table._id)
    const orderGuests = orderGuestsByTable.get(key) || 0
    const sessionGuests = sessionGuestsByTable.get(key) || 0
    const seatedGuests = orderGuests + sessionGuests
    const seatsAvailable = Math.max(0, table.capacity - seatedGuests)
    const activeOrderCount = orders.filter((o) => String(o.table) === key).length

    return {
      table,
      seatedGuests,
      seatsAvailable,
      activeOrderCount,
      activeSessionCount: sessions.filter((s) => String(s.table) === key).length,
      isFull: seatsAvailable <= 0,
      displayStatus: resolveDisplayStatus(table, { seatedGuests, seatsAvailable }),
    }
  })
}

module.exports = {
  CLOSED_STATUSES,
  resolveDisplayStatus,
  getTableSeatInfo,
  getRestaurantTablesSeatInfo,
  syncTableOccupancy,
  clearUserTableSessions,
}
