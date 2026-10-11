import { db } from './db';
export async function audit(
  actorId: string | null,
  action: string,
  target?: string,
  summary?: any,
) {
  await db.auditLog.create({ data: { actorId, action, target, summary } });
}
