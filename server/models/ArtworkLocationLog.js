import mongoose from 'mongoose';

const artworkLocationLogSchema = new mongoose.Schema(
  {
    artworkId: { type: String, required: true, trim: true, index: true },
    inventoryId: { type: String, default: '', trim: true },
    title: { type: String, default: '', trim: true },
    artist: { type: String, default: '', trim: true },
    fromPlace: { type: String, default: '', trim: true },
    fromStorageLocation: { type: String, default: '', trim: true },
    toPlace: { type: String, default: '', trim: true },
    toStorageLocation: { type: String, default: '', trim: true },
    note: { type: String, default: '', trim: true },
    actor: {
      id: { type: String, default: '' },
      email: { type: String, default: '' },
      role: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

const ArtworkLocationLog = mongoose.model('ArtworkLocationLog', artworkLocationLogSchema);

export default ArtworkLocationLog;
