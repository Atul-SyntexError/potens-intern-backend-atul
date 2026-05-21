import { Request, Response } from 'express';
import { createLogSchema, exportQuerySchema } from '../validations/log.validation';
import * as logService from '../services/log.service';
import { logger } from '../utils/logger';

export async function createLog(req: Request, res: Response): Promise<void> {
  const validated = createLogSchema.parse(req.body);

  const entry = await logService.appendLog(
    validated.actor,
    validated.action,
    validated.payload
  );

  logger.info({ entryId: entry.id }, 'Log entry created');

  res.status(201).json({
    success: true,
    data: entry,
  });
}

export async function getLog(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid log ID. Must be a number.' });
    return;
  }

  const result = await logService.getLogById(id);

  if (!result) {
    res.status(404).json({ error: `Log entry ${id} not found.` });
    return;
  }

  res.json({
    success: true,
    data: {
      ...result.entry,
      verification: {
        isValid: result.isValid,
        message: result.isValid
          ? 'Hash verification passed'
          : 'WARNING: Hash mismatch detected — entry may have been tampered with',
      },
    },
  });
}

export async function verifyChain(_req: Request, res: Response): Promise<void> {
  const result = await logService.verifyChain();

  res.json({
    success: true,
    data: {
      chainValid: result.valid,
      totalEntries: result.totalEntries,
      ...(result.firstBrokenEntry && {
        firstBrokenEntry: result.firstBrokenEntry,
        message: `Chain integrity broken at entry ${result.firstBrokenEntry}`,
      }),
      ...(!result.firstBrokenEntry && result.totalEntries > 0 && {
        message: 'All entries verified — chain integrity intact',
      }),
      ...(result.totalEntries === 0 && {
        message: 'No entries in the log',
      }),
    },
  });
}

export async function exportLogs(req: Request, res: Response): Promise<void> {
  const validated = exportQuerySchema.parse(req.query);

  const entries = await logService.exportLogs(validated);

  res.json({
    success: true,
    count: entries.length,
    data: entries,
  });
}
