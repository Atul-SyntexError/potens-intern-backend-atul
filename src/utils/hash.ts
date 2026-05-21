import crypto from 'crypto';

/**
 * Computes a SHA-256 hash for a log entry, chaining it to the previous entry.
 * Uses a pipe delimiter between fields to prevent ambiguous concatenation.
 */
export function computeHash(
  id: number,
  actor: string,
  action: string,
  payload: string,
  prevHash: string | null
): string {
  const data = `${id}|${actor}|${action}|${payload}|${prevHash ?? 'GENESIS'}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}
