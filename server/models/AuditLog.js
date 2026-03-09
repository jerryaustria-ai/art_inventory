import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true },
    actor: {
      id: { type: String, default: '' },
      email: { type: String, default: '' },
      role: { type: String, default: '' },
    },
    target: {
      type: { type: String, default: '' },
      id: { type: String, default: '' },
      label: { type: String, default: '' },
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
