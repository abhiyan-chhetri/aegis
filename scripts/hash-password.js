#!/usr/bin/env node
/**
 * Hash a password with bcryptjs
 * Usage: node scripts/hash-password.js <password>
 */

const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.js <password>');
  process.exit(1);
}

try {
  const hash = bcrypt.hashSync(password, 12);
  console.log(hash);
} catch (err) {
  console.error('Error hashing password:', err.message);
  process.exit(1);
}
