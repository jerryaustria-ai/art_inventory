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
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Artwork = mongoose.model('Artwork', artworkSchema);

export default Artwork;
