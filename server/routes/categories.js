import express from 'express';
import Artwork from '../models/Artwork.js';
import Category from '../models/Category.js';
import { readActorFromRequest, writeAuditLog } from '../utils/audit.js';

const router = express.Router();

function normalizeName(value) {
  return String(value || '').trim();
}

router.get('/', async (_req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    return res.json(categories);
  } catch {
    return res.status(500).json({ message: 'Failed to fetch categories.' });
  }
});

router.post('/', async (req, res) => {
  const actor = readActorFromRequest(req);
  const name = normalizeName(req.body?.name);

  if (actor.role !== 'super admin') {
    return res.status(403).json({ message: 'Only super admin can create categories.' });
  }

  if (!name) {
    return res.status(400).json({ message: 'Category name is required.' });
  }

  try {
    const existing = await Category.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (existing) {
      return res.status(409).json({ message: 'Category already exists.' });
    }

    const created = await Category.create({ name });

    await writeAuditLog({
      action: 'category.create',
      actor,
      target: {
        type: 'category',
        id: String(created._id),
        label: created.name,
      },
    });

    return res.status(201).json(created);
  } catch {
    return res.status(400).json({ message: 'Failed to create category.' });
  }
});

router.put('/:id', async (req, res) => {
  const actor = readActorFromRequest(req);
  const name = normalizeName(req.body?.name);

  if (actor.role !== 'super admin') {
    return res.status(403).json({ message: 'Only super admin can update categories.' });
  }

  if (!name) {
    return res.status(400).json({ message: 'Category name is required.' });
  }

  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found.' });
    }

    const existing = await Category.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (existing && String(existing._id) !== String(category._id)) {
      return res.status(409).json({ message: 'Category already exists.' });
    }

    const previousName = category.name;
    category.name = name;
    await category.save();

    if (previousName !== name) {
      await Artwork.updateMany({ category: previousName }, { $set: { category: name } });
    }

    await writeAuditLog({
      action: 'category.update',
      actor,
      target: {
        type: 'category',
        id: String(category._id),
        label: category.name,
      },
      metadata: {
        previousName,
      },
    });

    return res.json(category);
  } catch {
    return res.status(400).json({ message: 'Failed to update category.' });
  }
});

router.delete('/:id', async (req, res) => {
  const actor = readActorFromRequest(req);

  if (actor.role !== 'super admin') {
    return res.status(403).json({ message: 'Only super admin can delete categories.' });
  }

  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found.' });
    }

    const linkedCount = await Artwork.countDocuments({ category: category.name });
    await Artwork.updateMany({ category: category.name }, { $set: { category: '' } });
    await Category.findByIdAndDelete(req.params.id);

    await writeAuditLog({
      action: 'category.delete',
      actor,
      target: {
        type: 'category',
        id: String(category._id),
        label: category.name,
      },
      metadata: {
        affectedArtworks: linkedCount,
      },
    });

    return res.status(204).send();
  } catch {
    return res.status(400).json({ message: 'Failed to delete category.' });
  }
});

export default router;
