import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
config({ path: resolve(process.cwd(), '../../.env') });
export const db = new PrismaClient();
