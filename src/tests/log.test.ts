import { describe, it, expect } from 'vitest';
import './setup';
import { computeHash } from '../utils/hash';
import * as logService from '../services/log.service';
import prisma from '../utils/prisma';

// ---------------------------------------------------------------------------
// Hash Utility
// ---------------------------------------------------------------------------
describe('Hash Utility', () => {
  it('should produce consistent SHA-256 hashes', () => {
    const hash1 = computeHash(1, 'alice', 'login', '{}', null);
    const hash2 = computeHash(1, 'alice', 'login', '{}', null);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // 64-char hex string
  });

  it('should use GENESIS when prevHash is null', () => {
    const withNull = computeHash(1, 'alice', 'login', '{}', null);
    const withGenesis = computeHash(1, 'alice', 'login', '{}', null);
    // Both calls pass null, so they should produce the same "GENESIS" fallback hash
    expect(withNull).toBe(withGenesis);

    // A non-null prevHash should yield a different result
    const withPrev = computeHash(1, 'alice', 'login', '{}', 'abc123');
    expect(withNull).not.toBe(withPrev);
  });

  it('should produce different hashes for different inputs', () => {
    const h1 = computeHash(1, 'alice', 'login', '{}', null);
    const h2 = computeHash(2, 'alice', 'login', '{}', null);
    const h3 = computeHash(1, 'bob', 'login', '{}', null);
    const h4 = computeHash(1, 'alice', 'logout', '{}', null);

    const hashes = [h1, h2, h3, h4];
    const unique = new Set(hashes);
    expect(unique.size).toBe(hashes.length);
  });
});

// ---------------------------------------------------------------------------
// Log Service
// ---------------------------------------------------------------------------
describe('Log Service', () => {
  // ----- appendLog --------------------------------------------------------
  describe('appendLog', () => {
    it('should create genesis entry with null prevHash', async () => {
      const entry = await logService.appendLog('alice', 'login', { ip: '1.2.3.4' });

      expect(entry.id).toBeGreaterThan(0);
      expect(entry.prevHash).toBeNull();
      expect(entry.actor).toBe('alice');
      expect(entry.action).toBe('login');
      expect(entry.hash).toMatch(/^[a-f0-9]{64}$/);

      // Verify hash correctness
      const expectedHash = computeHash(
        entry.id,
        'alice',
        'login',
        JSON.stringify({ ip: '1.2.3.4' }),
        null,
      );
      expect(entry.hash).toBe(expectedHash);
    });

    it('should chain entries correctly', async () => {
      const first = await logService.appendLog('alice', 'login', {});
      const second = await logService.appendLog('bob', 'logout', {});

      expect(second.prevHash).toBe(first.hash);
      expect(second.hash).not.toBe(first.hash);
    });

    it('should store payload as JSON string', async () => {
      const payload = { key: 'value', nested: { a: 1 } };
      const entry = await logService.appendLog('alice', 'action', payload);

      expect(entry.payload).toBe(JSON.stringify(payload));
    });
  });

  // ----- getLogById -------------------------------------------------------
  describe('getLogById', () => {
    it('should return entry with valid verification', async () => {
      const created = await logService.appendLog('alice', 'login', {});
      const result = await logService.getLogById(created.id);

      expect(result).not.toBeNull();
      expect(result!.entry.id).toBe(created.id);
      expect(result!.isValid).toBe(true);
    });

    it('should return null for non-existent entry', async () => {
      const result = await logService.getLogById(99999);
      expect(result).toBeNull();
    });

    it('should detect tampered entry', async () => {
      const created = await logService.appendLog('alice', 'login', {});

      // Manually corrupt the payload directly in the database
      await prisma.logEntry.update({
        where: { id: created.id },
        data: { payload: '{"tampered":true}' },
      });

      const result = await logService.getLogById(created.id);
      expect(result).not.toBeNull();
      expect(result!.isValid).toBe(false);
    });
  });

  // ----- verifyChain ------------------------------------------------------
  describe('verifyChain', () => {
    it('should pass on empty chain', async () => {
      const result = await logService.verifyChain();

      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(0);
      expect(result.firstBrokenEntry).toBeNull();
    });

    it('should pass on valid chain', async () => {
      await logService.appendLog('alice', 'login', {});
      await logService.appendLog('bob', 'logout', {});
      await logService.appendLog('charlie', 'update', { field: 'name' });

      const result = await logService.verifyChain();

      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(3);
      expect(result.firstBrokenEntry).toBeNull();
    });

    it('should detect tampered chain and report broken entry', async () => {
      await logService.appendLog('alice', 'login', {});
      const second = await logService.appendLog('bob', 'logout', {});
      await logService.appendLog('charlie', 'update', {});

      // Corrupt the second entry's payload
      await prisma.logEntry.update({
        where: { id: second.id },
        data: { payload: '{"tampered":true}' },
      });

      const result = await logService.verifyChain();

      expect(result.valid).toBe(false);
      expect(result.totalEntries).toBe(3);
      expect(result.firstBrokenEntry).toBe(second.id);
    });
  });

  // ----- exportLogs -------------------------------------------------------
  describe('exportLogs', () => {
    it('should return all entries with no filters', async () => {
      await logService.appendLog('alice', 'login', {});
      await logService.appendLog('bob', 'logout', {});

      const entries = await logService.exportLogs({});

      expect(entries).toHaveLength(2);
    });

    it('should filter by actor', async () => {
      await logService.appendLog('alice', 'login', {});
      await logService.appendLog('bob', 'logout', {});
      await logService.appendLog('alice', 'update', {});

      const entries = await logService.exportLogs({ actor: 'alice' });

      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.actor === 'alice')).toBe(true);
    });

    it('should return empty array when no entries match filter', async () => {
      await logService.appendLog('alice', 'login', {});

      const entries = await logService.exportLogs({ actor: 'unknown' });

      expect(entries).toHaveLength(0);
    });
  });
});
