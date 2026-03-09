import express from 'express';
import Artwork from '../models/Artwork.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const actorRole = String(req.header('x-actor-role') || '').toLowerCase();
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const query =
      actorRole === 'super admin' && includeInactive ? {} : { isActive: { $ne: false } };
    const artworks = await Artwork.find(query).sort({ createdAt: -1 });
    res.json(artworks);
  } catch {
    res.status(500).json({ message: 'Failed to fetch artworks' });
  }
});

router.post('/', async (req, res) => {
  try {
    const artwork = await Artwork.create(req.body);
    res.status(201).json(artwork);
  } catch {
    res.status(400).json({ message: 'Failed to create artwork' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await Artwork.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      return res.status(404).json({ message: 'Artwork not found' });
    }
    res.json(updated);
  } catch {
    res.status(400).json({ message: 'Failed to update artwork' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deactivated = await Artwork.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true, runValidators: true }
    );
    if (!deactivated) {
      return res.status(404).json({ message: 'Artwork not found' });
    }
    return res.json({ message: 'Artwork marked as inactive.' });
  } catch {
    res.status(400).json({ message: 'Failed to delete artwork' });
  }
});

router.delete('/:id/permanent', async (req, res) => {
  try {
    const actorRole = String(req.header('x-actor-role') || '').toLowerCase();
    if (actorRole !== 'super admin') {
      return res.status(403).json({ message: 'Only super admin can permanently delete artwork.' });
    }

    const deleted = await Artwork.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Artwork not found' });
    }
    return res.status(204).send();
  } catch {
    return res.status(400).json({ message: 'Failed to permanently delete artwork' });
  }
});

router.patch('/:id/activate', async (req, res) => {
  try {
    const actorRole = String(req.header('x-actor-role') || '').toLowerCase();
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
    return res.json(activated);
  } catch {
    return res.status(400).json({ message: 'Failed to activate artwork' });
  }
});

export default router;
