import mongoose from 'mongoose';

const artworkSchema = new mongoose.Schema(
  {
    inventoryId: { type: String, default: '', trim: true },
    title: { type: String, default: '', trim: true },
    artist: { type: String, default: '', trim: true },
    year: { type: String, default: '' },
    category: { type: String, default: '' },
    medium: { type: String, default: '' },
    dimensions: { type: String, default: '' },
    place: { type: String, default: '' },
    storageLocation: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Available', 'Sold', 'Reserved', 'On Loan'],
      default: 'Available',
    },
    price: { type: String, default: '' },
    notes: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    imageUrls: { type: [String], default: [] },
    imagePublicId: { type: String, default: '', trim: true },
    imagePublicIds: { type: [String], default: [] },
    imageFingerprint: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

artworkSchema.index({ createdAt: -1 });
artworkSchema.index({ isActive: 1, createdAt: -1 });
artworkSchema.index({ category: 1, isActive: 1 });
artworkSchema.index({ place: 1, isActive: 1 });

const Artwork = mongoose.model('Artwork', artworkSchema);

export default Artwork;
