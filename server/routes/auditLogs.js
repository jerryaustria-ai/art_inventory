import express from 'express';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const actorRole = String(req.header('x-actor-role') || '').toLowerCase();
  if (actorRole !== 'super admin') {
    return res.status(403).json({ message: 'Only super admin can view audit logs.' });
  }

  try {
    const action = String(req.query.action || '').trim();
    const email = String(req.query.email || '').trim().toLowerCase();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const limitValue = Number(req.query.limit || 100);
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 500) : 100;

    const query = {};

    if (action) {
      query.action = action;
    }

    if (email) {
      query['actor.email'] = email;
    }

    if (from || to) {
      query.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) {
          query.createdAt.$gte = fromDate;
        }
      }
      if (to) {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) {
          query.createdAt.$lte = toDate;
        }
      }
      if (!query.createdAt.$gte && !query.createdAt.$lte) {
        delete query.createdAt;
      }
    }

    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit);
    return res.json(logs);
  } catch {
    return res.status(500).json({ message: 'Failed to fetch audit logs.' });
  }
});

export default router;
