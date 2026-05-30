#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Create or promote a SUPER_ADMIN / ADMIN user.
 *
 * Usage:
 *   npm run create-admin -- --email you@example.com --password 'StrongPass1' --name "Your Name" [--role SUPER_ADMIN] [--phone +91...]
 *
 * If a user with that email already exists, it's promoted to the requested role
 * (default SUPER_ADMIN) and the password is updated. Wallet row is created if
 * missing. Bypasses email-OTP signup — use this for the first admin and any
 * subsequent ones added by a trusted operator.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const VALID_ROLES = ['ADMIN', 'SUPER_ADMIN'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    out[key] = val;
  }
  return out;
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email;
  const password = args.password;
  const name = args.name ?? args.fullName;
  const phone = args.phone ?? null;
  const role = (args.role ?? 'SUPER_ADMIN').toUpperCase();

  if (!email) fail('Missing --email');
  if (!password) fail('Missing --password');
  if (!name) fail('Missing --name');
  if (!VALID_ROLES.includes(role)) fail(`--role must be one of ${VALID_ROLES.join(', ')}`);
  if (password.length < 8) fail('Password must be at least 8 chars');

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          fullName: name,
          phone,
          role,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });
      // Make sure they have a wallet row
      const wallet = await prisma.wallet.findUnique({ where: { userId: updated.id } });
      if (!wallet) await prisma.wallet.create({ data: { userId: updated.id } });
      console.log(`✓ Updated existing user → ${updated.role} (${updated.email})`);
      return;
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: name,
          phone,
          role,
          status: 'ACTIVE',
        },
      });
      await tx.wallet.create({ data: { userId: created.id } });
      return created;
    });
    console.log(`✓ Created ${user.role}: ${user.email} (id ${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('✗', err.message ?? err);
  process.exit(1);
});
