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
  payload.imageUrls = Array.isArray(payload.imageUrls)
    ? payload.imageUrls.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  payload.imagePublicIds = Array.isArray(payload.imagePublicIds)
    ? payload.imagePublicIds.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return payload;
}

async function uploadArtworkImages(values = []) {
  const entries = Array.isArray(values)
    ? values.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  const uploaded = await Promise.all(entries.map((item) => uploadArtworkImage(item)));
  return uploaded.filter((item) => item.imageUrl);
}

router.get('/', async (req, res) => {
  try {
    const actorRole = String(req.header('x-actor-role') || '').toLowerCase();
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const rawLimit = Number.parseInt(String(req.query.limit || ''), 10);
    const rawOffset = Number.parseInt(String(req.query.offset || ''), 10);
    const hasPaging = Number.isFinite(rawLimit) || Number.isFinite(rawOffset);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 50);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
    const query =
      actorRole === 'super admin' && includeInactive ? {} : { isActive: { $ne: false } };

    if (hasPaging) {
      const [items, total] = await Promise.all([
        Artwork.find(query)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .select('-imageFingerprint -imagePublicId')
          .lean(),
        Artwork.countDocuments(query),
      ]);

      return res.json({
        items,
        total,
        offset,
        limit,
        hasMore: offset + items.length < total,
      });
    }

    const artworks = await Artwork.find(query).sort({ createdAt: -1 }).lean();
    return res.json(artworks);
  } catch {
    return res.status(500).json({ message: 'Failed to fetch artworks' });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const actorRole = String(req.header('x-actor-role') || '').toLowerCase();
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const query =
      actorRole === 'super admin' && includeInactive ? {} : { isActive: { $ne: false } };

    const summary = await Artwork.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $trim: { input: { $ifNull: ['$category', ''] } } },
          count: { $sum: 1 },
          activeCount: {
            $sum: {
              $cond: [{ $ne: ['$isActive', false] }, 1, 0],
            },
          },
          inactiveCount: {
            $sum: {
              $cond: [{ $eq: ['$isActive', false] }, 1, 0],
            },
          },
          value: {
            $sum: {
              $convert: {
                input: '$price',
                to: 'double',
                onError: 0,
                onNull: 0,
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          count: 1,
          activeCount: 1,
          inactiveCount: 1,
          value: 1,
        },
      },
      { $match: { name: { $ne: '' } } },
      { $sort: { name: 1 } },
    ]);

    return res.json(summary);
  } catch {
    return res.status(500).json({ message: 'Failed to fetch artwork summary' });
  }
});

router.get('/location-summary', async (req, res) => {
  try {
    const actorRole = String(req.header('x-actor-role') || '').toLowerCase();
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const category = String(req.query.category || '').trim();
    const query =
      actorRole === 'super admin' && includeInactive ? {} : { isActive: { $ne: false } };

    if (category) {
      query.category = category;
    }

    const [items, totals] = await Promise.all([
      Artwork.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              $let: {
                vars: {
                  trimmedPlace: { $trim: { input: { $ifNull: ['$place', ''] } } },
                },
                in: {
                  $cond: [{ $eq: ['$$trimmedPlace', ''] }, 'Unassigned', '$$trimmedPlace'],
                },
              },
            },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            name: '$_id',
            count: 1,
          },
        },
        { $sort: { count: -1, name: 1 } },
      ]),
      Artwork.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalCount: { $sum: 1 },
            totalValue: {
              $sum: {
                $convert: {
                  input: '$price',
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
        },
      ]),
    ]);

    return res.json({
      items,
      totalCount: Number(totals[0]?.totalCount || 0),
      totalValue: Number(totals[0]?.totalValue || 0),
    });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch location summary' });
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
    const requestedImages = payload.imageUrls.length
      ? payload.imageUrls
      : [String(payload.imageUrl || '').trim()].filter(Boolean);
    const uploadedImages = await uploadArtworkImages(requestedImages);
    payload.imageUrls = uploadedImages.map((item) => item.imageUrl);
    payload.imagePublicIds = uploadedImages.map((item) => item.imagePublicId).filter(Boolean);
    payload.imageUrl = payload.imageUrls[0] || '';
    payload.imagePublicId = payload.imagePublicIds[0] || '';
    if (!payload.imageUrls.length) {
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
    const currentImageUrls = Array.isArray(existing.imageUrls) && existing.imageUrls.length
      ? existing.imageUrls.map((item) => String(item || '').trim()).filter(Boolean)
      : [String(existing.imageUrl || '').trim()].filter(Boolean);
    const currentImagePublicIds = Array.isArray(existing.imagePublicIds) && existing.imagePublicIds.length
      ? existing.imagePublicIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [String(existing.imagePublicId || '').trim()].filter(Boolean);
    const requestedImages = payload.imageUrls.length
      ? payload.imageUrls
      : [String(payload.imageUrl ?? '').trim()].filter(Boolean);
    const normalizedRequestedImages = requestedImages.map((item) => String(item || '').trim()).filter(Boolean);
    const galleryChanged =
      normalizedRequestedImages.length !== currentImageUrls.length ||
      normalizedRequestedImages.some((item, index) => item !== currentImageUrls[index]);

    if (galleryChanged) {
      const retainedImages = normalizedRequestedImages
        .filter(Boolean)
        .filter((item) => !/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(item))
        .map((item) => {
          const retainedIndex = currentImageUrls.findIndex((currentUrl) => currentUrl === item);
          return {
            imageUrl: item,
            imagePublicId: retainedIndex >= 0 ? currentImagePublicIds[retainedIndex] || '' : '',
          };
        });
      const newUploads = await uploadArtworkImages(
        normalizedRequestedImages.filter((item) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(item))
      );
      const nextImages = [...retainedImages, ...newUploads].filter((item) => item.imageUrl);
      const nextPublicIds = new Set(nextImages.map((item) => String(item.imagePublicId || '').trim()).filter(Boolean));
      const removedImages = currentImagePublicIds
        .map((publicId, index) => ({
          imagePublicId: publicId,
          imageUrl: currentImageUrls[index] || '',
        }))
        .filter((item) => item.imagePublicId && !nextPublicIds.has(item.imagePublicId));

      payload.imageUrls = nextImages.map((item) => item.imageUrl);
      payload.imagePublicIds = nextImages.map((item) => item.imagePublicId).filter(Boolean);
      payload.imageUrl = payload.imageUrls[0] || '';
      payload.imagePublicId = payload.imagePublicIds[0] || '';
      if (!payload.imageUrls.length) {
        payload.imageFingerprint = '';
      }

      await Promise.all(
        removedImages.map((item) =>
          deleteArtworkImage({
            imagePublicId: item.imagePublicId,
            imageUrl: item.imageUrl,
          })
        )
      );
    } else {
      payload.imageUrls = currentImageUrls;
      payload.imagePublicIds = currentImagePublicIds;
      payload.imageUrl = currentImageUrls[0] || '';
      payload.imagePublicId = currentImagePublicIds[0] || '';
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
