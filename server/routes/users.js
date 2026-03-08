import express from 'express';
import User from '../models/User.js';
import { sendLoginNotification } from '../utils/mailer.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || user.password !== password) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    if (user.status === 'inactive') {
      return res.status(403).json({ message: 'Your account is inactive.' });
    }

    // Non-blocking notification; login should still succeed even if email fails.
    sendLoginNotification({
      to: user.email,
      name: user.name,
      role: user.role,
    }).catch(() => {});

    return res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    });
  } catch {
    return res.status(500).json({ message: 'Login failed.' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email, newPassword } = req.body || {};

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'Email and new password are required.' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    user.password = newPassword;
    await user.save();

    return res.json({ message: 'Password has been reset successfully.' });
  } catch {
    return res.status(400).json({ message: 'Failed to reset password.' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    return res.json(users);
  } catch {
    return res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

router.post('/', async (req, res) => {
  const { name, email, password, role, status } = req.body || {};

  if (!name || !email || !password || !role || !status) {
    return res.status(400).json({ message: 'Name, email, password, role, and status are required.' });
  }

  try {
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ message: 'Email already exists.' });
    }

    const created = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role,
      status,
    });

    return res.status(201).json({
      id: created._id,
      name: created.name,
      email: created.email,
      role: created.role,
      status: created.status,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch {
    return res.status(400).json({ message: 'Failed to create user.' });
  }
});

router.put('/:id', async (req, res) => {
  const { name, email, password, role, status } = req.body || {};
  const actorRole = String(req.header('x-actor-role') || '').toLowerCase();

  if (!name || !email || !role || !status) {
    return res.status(400).json({ message: 'Name, email, role, and status are required.' });
  }

  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (targetUser.role === 'super admin' && actorRole !== 'super admin') {
      return res.status(403).json({ message: 'Only super admin can edit a super admin account.' });
    }

    const existingEmailOwner = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingEmailOwner && String(existingEmailOwner._id) !== req.params.id) {
      return res.status(409).json({ message: 'Email already exists.' });
    }

    const updatePayload = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role,
      status,
    };

    if (password && password.trim()) {
      updatePayload.password = password;
    }

    const updated = await User.findByIdAndUpdate(req.params.id, updatePayload, {
      new: true,
      runValidators: true,
    }).select('-password');

    if (!updated) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.json(updated);
  } catch {
    return res.status(400).json({ message: 'Failed to update user.' });
  }
});

router.delete('/:id', async (req, res) => {
  const actorRole = String(req.header('x-actor-role') || '').toLowerCase();
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (targetUser.role === 'super admin' && actorRole !== 'super admin') {
      return res.status(403).json({ message: 'Only super admin can delete a super admin account.' });
    }
    await User.findByIdAndDelete(req.params.id);
    return res.status(204).send();
  } catch {
    return res.status(400).json({ message: 'Failed to delete user.' });
  }
});

export default router;
