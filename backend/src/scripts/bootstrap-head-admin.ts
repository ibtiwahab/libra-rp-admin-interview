/**
 * Creates the initial Head Admin. There is no public registration and no default password:
 *
 *   npm run bootstrap:admin -- --username=director --name="Server Director" [--discord=director]
 *
 * A strong random password is generated and printed ONCE (or supply BOOTSTRAP_PASSWORD in the
 * environment). The command refuses to run if a Head Admin already exists unless
 * --allow-additional is passed, so it cannot be abused to mint new top-level accounts silently.
 */
import { connectDatabase, disconnectDatabase } from '../config/database';
import { AuditLog, User } from '../models';
import { hashPassword, passwordPolicyError } from '../security/password';
import { generatePassword } from '../utils/crypto';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const username = (arg('username') ?? '').trim().toLowerCase();
  const fullName = (arg('name') ?? '').trim();
  const discord = arg('discord')?.trim() || null;
  const allowAdditional = process.argv.includes('--allow-additional');

  if (!/^[a-z0-9._-]{3,32}$/.test(username) || fullName.length < 2) {
    console.error('Usage: npm run bootstrap:admin -- --username=<3-32 chars> --name="<Full Name>" [--discord=<handle>] [--allow-additional]');
    process.exit(2);
  }

  await connectDatabase();
  try {
    const existing = await User.countDocuments({ role: 'HEAD_ADMIN', status: { $ne: 'REMOVED' } });
    if (existing > 0 && !allowAdditional) {
      console.error(`Refusing: ${existing} Head Admin account(s) already exist. Pass --allow-additional to create another.`);
      process.exit(3);
    }
    if (await User.exists({ username })) {
      console.error(`Refusing: username "${username}" is already taken.`);
      process.exit(4);
    }

    const supplied = process.env.BOOTSTRAP_PASSWORD;
    if (supplied) {
      const err = passwordPolicyError(supplied);
      if (err) {
        console.error(`BOOTSTRAP_PASSWORD rejected: ${err}`);
        process.exit(5);
      }
    }
    const password = supplied ?? generatePassword(5, 4);
    const user = await User.create({
      username,
      fullName,
      discordUsername: discord,
      role: 'HEAD_ADMIN',
      status: 'ACTIVE',
      passwordHash: await hashPassword(password),
      mustChangePassword: !supplied,
    });
    await AuditLog.create({
      action: 'ADMIN_BOOTSTRAPPED',
      actorUsername: 'system',
      actorRole: 'SYSTEM',
      targetType: 'User',
      targetId: user._id,
      targetLabel: `${fullName} (@${username})`,
      details: { via: 'cli', additional: existing > 0 },
    });

    console.log('\n  LIBRA RP — Head Admin created\n');
    console.log(`  Username : ${username}`);
    if (!supplied) console.log(`  Password : ${password}`);
    console.log('\n  This password is shown once. Sign in at /admin/login, change it, and enable MFA.\n');
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
