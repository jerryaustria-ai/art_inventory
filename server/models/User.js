import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['super admin', 'admin', 'client'],
      required: true,
      default: 'client',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      required: true,
      default: 'active',
    },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

export default User;
