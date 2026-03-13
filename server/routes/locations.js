import express from 'express';
import Location from '../models/Location.js';
import { readActorFromRequest, writeAuditLog } from '../utils/audit.js';

const router = express.Router();

function normalizeName(value) {
  return String(value || '').trim();
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

router.get('/', async (_req, res) => {
  try {
    const locations = await Location.find().sort({ name: 1 });
    return res.json(locations);
  } catch {
    return res.status(500).json({ message: 'Failed to fetch locations.' });
  }
});

router.post('/', async (req, res) => {
  const actor = readActorFromRequest(req);
  const name = normalizeName(req.body?.name);
  const latitude = parseNumber(req.body?.latitude);
  const longitude = parseNumber(req.body?.longitude);
  const radiusMeters = parseNumber(req.body?.radiusMeters || 50);
  const notes = String(req.body?.notes || '').trim();

  if (actor.role !== 'super admin') {
    return res.status(403).json({ message: 'Only super admin can create locations.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Location name is required.' });
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ message: 'Valid latitude and longitude are required.' });
  }

  try {
    const existing = await Location.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (existing) {
      return res.status(409).json({ message: 'Location already exists.' });
    }

    const created = await Location.create({ name, latitude, longitude, radiusMeters, notes });
    await writeAuditLog({
      action: 'location.create',
      actor,
      target: { type: 'location', id: String(created._id), label: created.name },
      metadata: { latitude, longitude, radiusMeters },
    });
    return res.status(201).json(created);
  } catch {
    return res.status(400).json({ message: 'Failed to create location.' });
  }
});

router.put('/:id', async (req, res) => {
  const actor = readActorFromRequest(req);
  const name = normalizeName(req.body?.name);
  const latitude = parseNumber(req.body?.latitude);
  const longitude = parseNumber(req.body?.longitude);
  const radiusMeters = parseNumber(req.body?.radiusMeters || 50);
  const notes = String(req.body?.notes || '').trim();

  if (actor.role !== 'super admin') {
    return res.status(403).json({ message: 'Only super admin can update locations.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Location name is required.' });
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ message: 'Valid latitude and longitude are required.' });
  }

  try {
    const location = await Location.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ message: 'Location not found.' });
    }

    const existing = await Location.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (existing && String(existing._id) !== String(location._id)) {
      return res.status(409).json({ message: 'Location already exists.' });
    }

    const previous = {
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      radiusMeters: location.radiusMeters,
    };

    location.name = name;
    location.latitude = latitude;
    location.longitude = longitude;
    location.radiusMeters = radiusMeters;
    location.notes = notes;
    await location.save();

    await writeAuditLog({
      action: 'location.update',
      actor,
      target: { type: 'location', id: String(location._id), label: location.name },
      metadata: previous,
    });

    return res.json(location);
  } catch {
    return res.status(400).json({ message: 'Failed to update location.' });
  }
});

router.delete('/:id', async (req, res) => {
  const actor = readActorFromRequest(req);
  if (actor.role !== 'super admin') {
    return res.status(403).json({ message: 'Only super admin can delete locations.' });
  }

  try {
    const location = await Location.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ message: 'Location not found.' });
    }

    await Location.findByIdAndDelete(req.params.id);
    await writeAuditLog({
      action: 'location.delete',
      actor,
      target: { type: 'location', id: String(location._id), label: location.name },
    });

    return res.status(204).send();
  } catch {
    return res.status(400).json({ message: 'Failed to delete location.' });
  }
});

export default router;
