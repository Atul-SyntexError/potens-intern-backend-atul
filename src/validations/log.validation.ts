import { z } from 'zod';

export const createLogSchema = z.object({
  actor: z.string().min(1, 'Actor is required').max(255),
  action: z.string().min(1, 'Action is required').max(255),
  payload: z.any(),
});

export const exportQuerySchema = z.object({
  actor: z.string().optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  },
  { message: 'startDate must be before or equal to endDate' }
);

export type CreateLogInput = z.infer<typeof createLogSchema>;
export type ExportQueryInput = z.infer<typeof exportQuerySchema>;
