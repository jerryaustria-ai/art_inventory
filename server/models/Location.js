import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    radiusMeters: { type: Number, default: 50 },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

const Location = mongoose.model('Location', locationSchema);

export default Location;
