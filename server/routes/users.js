import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { sendLoginNotification } from '../utils/mailer.js';
import { writeAuditLog } from '../utils/audit.js';

const router = express.Router();
const BCRYPT_ROUNDS = 10;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset attempts. Please try again in 15 minutes.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    let isValidPassword = false;

    if (typeof user.password === 'string' && user.password.startsWith('$2')) {
      isValidPassword = await bcrypt.compare(password, user.password);
    } else if (user.password === password) {
      // Migrate legacy plaintext password to bcrypt hash on successful login.
      isValidPassword = true;
      user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await user.save();
    }

    if (!isValidPassword) {
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
    })
      .then((result) => {
        if (!result) return;
        if (result.ok) {
          console.log(
            `Login notification sent via ${result.provider || 'unknown'} to ${user.email}. accepted=${result.accepted?.length || 0} rejected=${result.rejected?.length || 0}`
          );
          return;
        }
        if (result.skipped) {
          console.warn(`Login notification skipped for ${user.email}: ${result.reason}`);
        }
      })
      .catch((error) => {
        console.error('Login notification email failed:', error?.message || error);
    });

    await writeAuditLog({
      action: 'user.login',
      actor: {
        id: String(user._id),
        email: user.email,
        role: user.role,
      },
      target: {
        type: 'user',
        id: String(user._id),
        label: user.email,
      },
      metadata: {
        ip: req.ip || '',
        userAgent: req.get('user-agent') || '',
      },
    });

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

router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email, newPassword } = req.body || {};

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'Email and new password are required.' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
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
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
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
      updatePayload.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
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
