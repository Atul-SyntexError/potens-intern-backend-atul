import prisma from '../utils/prisma';
import { beforeEach, afterAll } from 'vitest';

beforeEach(async () => {
  await prisma.logEntry.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
