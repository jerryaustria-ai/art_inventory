import AuditLog from '../models/AuditLog.js';

export function readActorFromRequest(req) {
  return {
    id: String(req.header('x-actor-id') || '').trim(),
    email: String(req.header('x-actor-email') || '').trim().toLowerCase(),
    role: String(req.header('x-actor-role') || '').trim().toLowerCase(),
  };
}

export async function writeAuditLog({ action, actor, target, metadata = {} }) {
  if (!action) return;

  try {
    await AuditLog.create({
      action,
      actor: {
        id: actor?.id || '',
        email: actor?.email || '',
        role: actor?.role || '',
      },
      target: {
        type: target?.type || '',
        id: target?.id || '',
        label: target?.label || '',
      },
      metadata,
    });
  } catch (error) {
    console.error('Audit log write failed:', error?.message || error);
  }
}
