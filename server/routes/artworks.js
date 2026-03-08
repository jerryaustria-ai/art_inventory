import express from 'express';
import Artwork from '../models/Artwork.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const artworks = await Artwork.find().sort({ createdAt: -1 });
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
    const deleted = await Artwork.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Artwork not found' });
    }
    res.status(204).send();
  } catch {
    res.status(400).json({ message: 'Failed to delete artwork' });
  }
});

export default router;
