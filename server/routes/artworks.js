import express from 'express';
import Artwork from '../models/Artwork.js';
import { readActorFromRequest, writeAuditLog } from '../utils/audit.js';

const router = express.Router();

const INVENTORY_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInventoryId() {
  return Array.from({ length: 5 }, () => {
    const index = Math.floor(Math.random() * INVENTORY_ID_ALPHABET.length);
    return INVENTORY_ID_ALPHABET[index];
  }).join('');
}

function isValidInventoryId(value) {
  return /^[A-Z0-9]{5}$/.test(String(value || '').trim());
}

async function createUniqueInventoryId() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateInventoryId();
    const existing = await Artwork.exists({ inventoryId: candidate });
    if (!existing) return candidate;
  }

  throw new Error('Failed to generate unique inventory ID');
}

async function ensureInventoryId(artwork) {
  if (!artwork) return artwork;
  const currentValue = String(artwork.inventoryId || '').trim().toUpperCase();
  if (isValidInventoryId(currentValue)) {
    if (artwork.inventoryId !== currentValue) {
      artwork.inventoryId = currentValue;
      await artwork.save();
    }
    return artwork;
  }

  artwork.inventoryId = await createUniqueInventoryId();
  await artwork.save();
  return artwork;
}

function sanitizeArtworkPayload(body = {}) {
  const payload = { ...body };
  delete payload.inventoryId;
  return payload;
}

router.get('/', async (req, res) => {
  try {
    const actorRole = String(req.header('x-actor-role') || '').toLowerCase();
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const query =
      actorRole === 'super admin' && includeInactive ? {} : { isActive: { $ne: false } };
    const artworks = await Artwork.find(query).sort({ createdAt: -1 });
    await Promise.all(artworks.map((artwork) => ensureInventoryId(artwork)));
    res.json(artworks);
  } catch {
    res.status(500).json({ message: 'Failed to fetch artworks' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const actorRole = String(req.header('x-actor-role') || '').toLowerCase();
    const item = await Artwork.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Artwork not found' });
    }
    if (item.isActive === false && actorRole !== 'super admin') {
      return res.status(404).json({ message: 'Artwork not found' });
    }
    await ensureInventoryId(item);
    return res.json(item);
  } catch {
    return res.status(400).json({ message: 'Failed to fetch artwork' });
  }
});

router.post('/', async (req, res) => {
  try {
    const artwork = await Artwork.create(sanitizeArtworkPayload(req.body));
    await ensureInventoryId(artwork);
    res.status(201).json(artwork);
  } catch {
    res.status(400).json({ message: 'Failed to create artwork' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await Artwork.findByIdAndUpdate(
      req.params.id,
      sanitizeArtworkPayload(req.body),
      {
        new: true,
        runValidators: true,
      }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Artwork not found' });
    }
    await ensureInventoryId(updated);
    res.json(updated);
  } catch {
    res.status(400).json({ message: 'Failed to update artwork' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const actor = readActorFromRequest(req);
    const deactivated = await Artwork.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true, runValidators: true }
    );
    if (!deactivated) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    await writeAuditLog({
      action: 'inventory.deactivate',
      actor,
      target: {
        type: 'artwork',
        id: String(deactivated._id),
        label: deactivated.title || '',
      },
      metadata: {
        category: deactivated.category || '',
        place: deactivated.place || '',
      },
    });

    return res.json({ message: 'Artwork marked as inactive.' });
  } catch {
    res.status(400).json({ message: 'Failed to delete artwork' });
  }
});

router.delete('/:id/permanent', async (req, res) => {
  try {
    const actor = readActorFromRequest(req);
    const actorRole = actor.role;
    if (actorRole !== 'super admin') {
      return res.status(403).json({ message: 'Only super admin can permanently delete artwork.' });
    }

    const deleted = await Artwork.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    await writeAuditLog({
      action: 'inventory.delete_permanent',
      actor,
      target: {
        type: 'artwork',
        id: String(deleted._id),
        label: deleted.title || '',
      },
      metadata: {
        category: deleted.category || '',
        place: deleted.place || '',
      },
    });

    return res.status(204).send();
  } catch {
    return res.status(400).json({ message: 'Failed to permanently delete artwork' });
  }
});

router.patch('/:id/activate', async (req, res) => {
  try {
    const actor = readActorFromRequest(req);
    const actorRole = actor.role;
    if (actorRole !== 'super admin') {
      return res.status(403).json({ message: 'Only super admin can activate artwork.' });
    }

    const activated = await Artwork.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true, runValidators: true }
    );
    if (!activated) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    await writeAuditLog({
      action: 'inventory.activate',
      actor,
      target: {
        type: 'artwork',
        id: String(activated._id),
        label: activated.title || '',
      },
      metadata: {
        category: activated.category || '',
        place: activated.place || '',
      },
    });

    return res.json(activated);
  } catch {
    return res.status(400).json({ message: 'Failed to activate artwork' });
  }
});

export default router;
