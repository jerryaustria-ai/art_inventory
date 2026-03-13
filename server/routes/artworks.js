import express from 'express';
import Artwork from '../models/Artwork.js';
import ArtworkLocationLog from '../models/ArtworkLocationLog.js';
import { readActorFromRequest, writeAuditLog } from '../utils/audit.js';
import { deleteArtworkImage, uploadArtworkImage } from '../utils/cloudinary.js';
import { compareFingerprints, isValidFingerprint } from '../utils/visualSearch.js';

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
  payload.imageFingerprint = String(payload.imageFingerprint || '').trim();
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
    return res.json(artworks);
  } catch {
    return res.status(500).json({ message: 'Failed to fetch artworks' });
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

router.get('/:id/location-history', async (req, res) => {
  try {
    const actorRole = String(req.header('x-actor-role') || '').toLowerCase();
    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ message: 'Artwork not found' });
    }
    if (artwork.isActive === false && actorRole !== 'super admin') {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    const logs = await ArtworkLocationLog.find({ artworkId: String(artwork._id) }).sort({ createdAt: -1 });
    return res.json(logs);
  } catch {
    return res.status(400).json({ message: 'Failed to fetch location history.' });
  }
});

router.post('/visual-search', async (req, res) => {
  try {
    const actorRole = String(req.header('x-actor-role') || '').toLowerCase();
    const includeInactive = actorRole === 'super admin' && String(req.body?.includeInactive || '').toLowerCase() === 'true';
    const imageFingerprint = String(req.body?.imageFingerprint || '').trim();
    const limit = Math.min(Math.max(Number.parseInt(String(req.body?.limit || '8'), 10) || 8, 1), 20);

    if (!isValidFingerprint(imageFingerprint)) {
      return res.status(400).json({ message: 'A valid visual fingerprint is required.' });
    }

    const query = includeInactive ? { imageFingerprint: { $ne: '' } } : { isActive: { $ne: false }, imageFingerprint: { $ne: '' } };
    const artworks = await Artwork.find(query).sort({ createdAt: -1 });

    const matches = artworks
      .map((artwork) => {
        const comparison = compareFingerprints(imageFingerprint, artwork.imageFingerprint);
        if (!comparison) return null;
        return {
          artwork,
          similarity: comparison.similarity,
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, limit)
      .map(({ artwork, similarity }) => ({
        ...artwork.toObject(),
        similarity: Number(similarity.toFixed(4)),
      }));

    return res.json(matches);
  } catch {
    return res.status(500).json({ message: 'Failed to run visual search.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = sanitizeArtworkPayload(req.body);
    const uploadedImage = await uploadArtworkImage(payload.imageUrl);
    payload.imageUrl = uploadedImage.imageUrl;
    payload.imagePublicId = uploadedImage.imagePublicId;
    if (!payload.imageUrl) {
      payload.imageFingerprint = '';
    }
    const artwork = await Artwork.create(payload);
    await ensureInventoryId(artwork);
    res.status(201).json(artwork);
  } catch (error) {
    res.status(400).json({ message: error?.message || 'Failed to create artwork' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await Artwork.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    const payload = sanitizeArtworkPayload(req.body);
    const nextImageUrl = String(payload.imageUrl ?? '').trim();
    const currentImageUrl = String(existing.imageUrl || '').trim();
    const currentImagePublicId = String(existing.imagePublicId || '').trim();
    const isReplacingImage = Boolean(nextImageUrl) && nextImageUrl !== currentImageUrl;
    const isRemovingImage = !nextImageUrl && Boolean(currentImageUrl);

    if (isReplacingImage) {
      const uploadedImage = await uploadArtworkImage(nextImageUrl);
      payload.imageUrl = uploadedImage.imageUrl;
      payload.imagePublicId = uploadedImage.imagePublicId;
    } else if (isRemovingImage) {
      payload.imageUrl = '';
      payload.imagePublicId = '';
      payload.imageFingerprint = '';
    } else {
      payload.imageUrl = currentImageUrl;
      payload.imagePublicId = currentImagePublicId;
      payload.imageFingerprint = String(existing.imageFingerprint || '').trim();
    }

    const updated = await Artwork.findByIdAndUpdate(
      req.params.id,
      payload,
      {
        new: true,
        runValidators: true,
      }
    );

    if (isReplacingImage || isRemovingImage) {
      await deleteArtworkImage({
        imagePublicId: currentImagePublicId,
        imageUrl: currentImageUrl,
      });
    }

    await ensureInventoryId(updated);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error?.message || 'Failed to update artwork' });
  }
});

router.post('/:id/move', async (req, res) => {
  try {
    const actor = readActorFromRequest(req);
    const toPlace = String(req.body?.place || '').trim();
    const toStorageLocation = String(req.body?.storageLocation || '').trim();
    const note = String(req.body?.note || '').trim();

    if (!toPlace && !toStorageLocation) {
      return res.status(400).json({ message: 'New place or storage location is required.' });
    }

    const artwork = await Artwork.findById(req.params.id);
    if (!artwork) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    const fromPlace = String(artwork.place || '').trim();
    const fromStorageLocation = String(artwork.storageLocation || '').trim();
    const nextPlace = toPlace || fromPlace;
    const nextStorageLocation = toStorageLocation || fromStorageLocation;

    if (nextPlace === fromPlace && nextStorageLocation === fromStorageLocation) {
      return res.status(400).json({ message: 'Artwork is already in that location.' });
    }

    artwork.place = nextPlace;
    artwork.storageLocation = nextStorageLocation;
    await artwork.save();
    await ensureInventoryId(artwork);

    await ArtworkLocationLog.create({
      artworkId: String(artwork._id),
      inventoryId: artwork.inventoryId || '',
      title: artwork.title || '',
      artist: artwork.artist || '',
      fromPlace,
      fromStorageLocation,
      toPlace: nextPlace,
      toStorageLocation: nextStorageLocation,
      note,
      actor: {
        id: actor.id || '',
        email: actor.email || '',
        role: actor.role || '',
      },
    });

    await writeAuditLog({
      action: 'inventory.move',
      actor,
      target: {
        type: 'artwork',
        id: String(artwork._id),
        label: artwork.title || artwork.inventoryId || '',
      },
      metadata: {
        fromPlace,
        fromStorageLocation,
        toPlace: nextPlace,
        toStorageLocation: nextStorageLocation,
        note,
      },
    });

    return res.json(artwork);
  } catch (error) {
    return res.status(400).json({ message: error?.message || 'Failed to move artwork.' });
  }
});

router.patch('/:id/fingerprint', async (req, res) => {
  try {
    const imageFingerprint = String(req.body?.imageFingerprint || '').trim();
    if (!isValidFingerprint(imageFingerprint)) {
      return res.status(400).json({ message: 'A valid visual fingerprint is required.' });
    }

    const updated = await Artwork.findByIdAndUpdate(
      req.params.id,
      { imageFingerprint },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    await ensureInventoryId(updated);
    return res.json(updated);
  } catch {
    return res.status(400).json({ message: 'Failed to update artwork fingerprint.' });
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

    await deleteArtworkImage({
      imagePublicId: deleted.imagePublicId,
      imageUrl: deleted.imageUrl,
    });

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
