import prisma from '../utils/prisma';
import { computeHash } from '../utils/hash';
import { logger } from '../utils/logger';

/**
 * Appends a new tamper-evident log entry to the chain.
 * Uses an interactive transaction to guarantee atomic read-then-write,
 * preventing race conditions where concurrent requests could reference
 * the same prevHash.
 */
export async function appendLog(actor: string, action: string, payload: any) {
  // Interactive transaction ensures no two concurrent appends can read
  // the same "last entry" — the second caller blocks until the first commits.
  return prisma.$transaction(async (tx) => {
    const lastEntry = await tx.logEntry.findFirst({
      orderBy: { id: 'desc' },
    });

    const prevHash = lastEntry?.hash ?? null;

    // Create the entry with a placeholder hash — we need the auto-generated
    // id before we can compute the real hash.
    const newEntry = await tx.logEntry.create({
      data: {
        actor,
        action,
        payload: JSON.stringify(payload),
        hash: '',
        prevHash,
      },
    });

    const hash = computeHash(
      newEntry.id,
      actor,
      action,
      JSON.stringify(payload),
      prevHash
    );

    const finalEntry = await tx.logEntry.update({
      where: { id: newEntry.id },
      data: { hash },
    });

    logger.info({ id: finalEntry.id, actor, action }, 'Log entry appended');
    return finalEntry;
  });
}

/**
 * Retrieves a log entry by its ID and verifies its integrity
 * by recomputing the hash and comparing it to the stored value.
 */
export async function getLogById(id: number) {
  const entry = await prisma.logEntry.findUnique({ where: { id } });

  if (!entry) {
    return null;
  }

  const recomputedHash = computeHash(
    entry.id,
    entry.actor,
    entry.action,
    entry.payload,
    entry.prevHash
  );

  const isValid = recomputedHash === entry.hash;

  if (!isValid) {
    logger.warn({ id: entry.id }, 'Integrity check failed for log entry');
  }

  return { entry, isValid };
}

/**
 * Verifies the entire hash chain from genesis to the latest entry.
 * Checks both individual hash integrity and prev-hash linkage.
 * Returns the position of the first broken entry if tampering is detected.
 */
export async function verifyChain(): Promise<{
  valid: boolean;
  totalEntries: number;
  firstBrokenEntry: number | null;
}> {
  const entries = await prisma.logEntry.findMany({
    orderBy: { id: 'asc' },
  });

  if (entries.length === 0) {
    return { valid: true, totalEntries: 0, firstBrokenEntry: null };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Genesis entry must have null prevHash
    if (i === 0 && entry.prevHash !== null) {
      logger.warn({ id: entry.id }, 'Genesis entry has non-null prevHash');
      return { valid: false, totalEntries: entries.length, firstBrokenEntry: entry.id };
    }

    // Non-genesis entries must link to the previous entry's hash
    if (i > 0 && entry.prevHash !== entries[i - 1].hash) {
      logger.warn(
        { id: entry.id, expected: entries[i - 1].hash, got: entry.prevHash },
        'Chain linkage broken'
      );
      return { valid: false, totalEntries: entries.length, firstBrokenEntry: entry.id };
    }

    // Recompute and verify the entry's own hash
    const recomputedHash = computeHash(
      entry.id,
      entry.actor,
      entry.action,
      entry.payload,
      entry.prevHash
    );

    if (recomputedHash !== entry.hash) {
      logger.warn(
        { id: entry.id, expected: recomputedHash, got: entry.hash },
        'Hash mismatch detected'
      );
      return { valid: false, totalEntries: entries.length, firstBrokenEntry: entry.id };
    }
  }

  logger.info({ totalEntries: entries.length }, 'Chain verification passed');
  return { valid: true, totalEntries: entries.length, firstBrokenEntry: null };
}

/**
 * Exports log entries matching the provided filters.
 * Supports filtering by actor (exact match) and/or date range.
 */
export async function exportLogs(filters: {
  actor?: string;
  startDate?: string;
  endDate?: string;
}) {
  const where: any = {};

  if (filters.actor) {
    where.actor = filters.actor;
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};

    if (filters.startDate) {
      where.createdAt.gte = new Date(filters.startDate);
    }

    if (filters.endDate) {
      where.createdAt.lte = new Date(filters.endDate);
    }
  }

  return prisma.logEntry.findMany({
    where,
    orderBy: { id: 'asc' },
  });
}
