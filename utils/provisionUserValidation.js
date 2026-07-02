const User = require('../models/User')
const { normalizePhone, findUserByPhone } = require('./phoneUtils')
const { isSuperAdminPhone } = require('./superAdminPhone')

function provisionError(message, statusCode = 400) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

/** Block super-admin mobile from restaurant admin/staff provisioning */
function assertNotSuperAdminPhone(phoneInput, roleLabel = 'admin or staff') {
  if (isSuperAdminPhone(phoneInput)) {
    throw provisionError(
      `Super admin mobile cannot be used for ${roleLabel}. Enter a different personal mobile number.`,
    )
  }
}

function assertProvisionPhone(phoneInput) {
  const phone = normalizePhone(phoneInput)
  if (!phone) {
    throw provisionError('Enter a valid 10-digit mobile number')
  }
  assertNotSuperAdminPhone(phone)
  return phone
}

/**
 * Resolve the user for platform provisioning by email + phone.
 * Prevents super-admin assignment and email/phone conflicts.
 */
async function resolveProvisionUser({ email, phone, name, password, platformRole = 'admin' }) {
  const normalizedEmail = String(email || '').toLowerCase().trim()
  const normalizedPhone = assertProvisionPhone(phone)

  if (!normalizedEmail) {
    throw provisionError('Enter a valid email address')
  }

  const userByEmail = await User.findOne({ email: normalizedEmail })
  const userByPhone = await findUserByPhone(normalizedPhone, User)

  if (userByEmail && userByPhone && String(userByEmail._id) !== String(userByPhone._id)) {
    const phoneEmail = userByPhone.email ? ` (${userByPhone.email})` : ''
    throw provisionError(
      `This mobile is registered${phoneEmail}, but the email belongs to a different account. Use the email linked to this mobile, or enter a new mobile number.`,
    )
  }

  let user = userByEmail || userByPhone

  if (user?.platformRole === 'superadmin') {
    throw provisionError(
      'Super admin account cannot be assigned as restaurant admin or staff. Use a different mobile number.',
    )
  }

  if (!user) {
    if (!password || String(password).length < 6) {
      throw provisionError('Verified mobile is required to create this account')
    }
    if (userByEmail) {
      throw provisionError('This email is already registered. Use a different email.')
    }
    if (userByPhone) {
      throw provisionError('This mobile number is already registered. Use a different number.')
    }

    user = await User.create({
      name: String(name || '').trim() || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      password,
      phone: normalizedPhone,
      platformRole,
    })
    return user
  }

  const phoneOwner = await findUserByPhone(normalizedPhone, User)
  if (phoneOwner && String(phoneOwner._id) !== String(user._id)) {
    throw provisionError('This mobile number is already registered to another account.')
  }

  const emailOwner = await User.findOne({ email: normalizedEmail })
  if (emailOwner && String(emailOwner._id) !== String(user._id)) {
    throw provisionError('This email is already registered to another account.')
  }

  if (name?.trim()) user.name = name.trim()
  user.phone = normalizedPhone
  if (password && String(password).length >= 6) user.password = password
  await user.save()

  return user
}

/**
 * Read-only provision checks — does not create or update users.
 */
async function previewProvisionUser({ email, phone, platformRole = 'admin' }) {
  const normalizedEmail = String(email || '').toLowerCase().trim()
  const normalizedPhone = assertProvisionPhone(phone)

  if (!normalizedEmail) {
    throw provisionError('Enter a valid email address')
  }

  const userByEmail = await User.findOne({ email: normalizedEmail })
  const userByPhone = await findUserByPhone(normalizedPhone, User)

  if (userByEmail && userByPhone && String(userByEmail._id) !== String(userByPhone._id)) {
    const phoneEmail = userByPhone.email ? ` (${userByPhone.email})` : ''
    throw provisionError(
      `This mobile is registered${phoneEmail}, but the email belongs to a different account. Use the email linked to this mobile, or enter a new mobile number.`,
    )
  }

  const user = userByEmail || userByPhone

  if (user?.platformRole === 'superadmin') {
    throw provisionError(
      'Super admin account cannot be assigned as restaurant admin or staff. Use a different mobile number.',
    )
  }

  if (!user) {
    if (userByEmail) {
      throw provisionError('This email is already registered. Use a different email.')
    }
    if (userByPhone) {
      throw provisionError('This mobile number is already registered. Use a different number.')
    }
    return null
  }

  const phoneOwner = await findUserByPhone(normalizedPhone, User)
  if (phoneOwner && String(phoneOwner._id) !== String(user._id)) {
    throw provisionError('This mobile number is already registered to another account.')
  }

  const emailOwner = await User.findOne({ email: normalizedEmail })
  if (emailOwner && String(emailOwner._id) !== String(user._id)) {
    throw provisionError('This email is already registered to another account.')
  }

  return user
}

module.exports = {
  assertNotSuperAdminPhone,
  assertProvisionPhone,
  resolveProvisionUser,
  previewProvisionUser,
  provisionError,
}
