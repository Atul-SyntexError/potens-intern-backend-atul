import prisma from '../utils/prisma';
import { computeHash } from '../utils/hash';
import { logger } from '../utils/logger';

const seedEntries = [
  { actor: 'system', action: 'server.start', payload: { version: '1.0.0', environment: 'production' } },
  { actor: 'alice', action: 'user.login', payload: { ip: '192.168.1.10', method: 'password' } },
  { actor: 'alice', action: 'document.create', payload: { title: 'Q4 Report', format: 'pdf' } },
  { actor: 'bob', action: 'user.login', payload: { ip: '10.0.0.5', method: 'sso' } },
  { actor: 'alice', action: 'document.update', payload: { title: 'Q4 Report', changes: 3, section: 'financials' } },
];

async function seed() {
  logger.info('🌱 Seeding database...');

  // Clear existing data
  await prisma.logEntry.deleteMany();

  let prevHash: string | null = null;

  for (const data of seedEntries) {
    const payloadStr = JSON.stringify(data.payload);

    // Create entry with placeholder hash — we need the auto-generated id first
    const entry = await prisma.logEntry.create({
      data: {
        actor: data.actor,
        action: data.action,
        payload: payloadStr,
        hash: '',
        prevHash,
      },
    });

    // Compute and set the real hash now that we have the id
    const hash = computeHash(entry.id, data.actor, data.action, payloadStr, prevHash);
    await prisma.logEntry.update({
      where: { id: entry.id },
      data: { hash },
    });

    prevHash = hash;
    logger.info({ id: entry.id, actor: data.actor, action: data.action }, 'Seeded entry');
  }

  logger.info(`✅ Seeded ${seedEntries.length} log entries`);
  await prisma.$disconnect();
}

seed().catch((e) => {
  logger.error(e, 'Seed failed');
  process.exit(1);
});
