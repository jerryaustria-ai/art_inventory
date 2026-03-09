import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import artworksRouter from './routes/artworks.js'
import User from './models/User.js'
import auditLogsRouter from './routes/auditLogs.js'
import usersRouter from './routes/users.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5001
const MONGODB_URI = process.env.MONGODB_URI
const CLIENT_URL = process.env.CLIENT_URL || ''

const allowedOrigins = CLIENT_URL.split(',')
  .map((item) => item.trim())
  .filter(Boolean)

app.use(
  cors({
    origin: ['http://localhost:5173', 'https://art-inventory-self.vercel.app'],
  }),
)

app.use(express.json({ limit: '12mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/artworks', artworksRouter)
app.use('/api/users', usersRouter)
app.use('/api/audit-logs', auditLogsRouter)

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment variables.')
  process.exit(1)
}

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    const defaults = [
      {
        name: 'Super Admin',
        email: 'superadmin@inventory.local',
        password: 'superadmin123',
        role: 'super admin',
        status: 'active',
      },
      {
        name: 'Admin User',
        email: 'admin@inventory.local',
        password: 'admin123',
        role: 'admin',
        status: 'active',
      },
      {
        name: 'Client User',
        email: 'client@inventory.local',
        password: 'client123',
        role: 'client',
        status: 'active',
      },
    ]

    for (const user of defaults) {
      const hashedPassword = await bcrypt.hash(user.password, 10)
      // Upsert default accounts so first run always has login users.
      await User.updateOne(
        { email: user.email },
        { $setOnInsert: { ...user, password: hashedPassword } },
        { upsert: true },
      )
    }

    app.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`)
    })
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error.message)
    process.exit(1)
  })
