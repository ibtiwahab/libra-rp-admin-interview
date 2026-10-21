import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { SUBJECT_TYPES } from '../config/constants';

/**
 * Server-side sessions. The cookie carries an opaque random token; only its HMAC is stored,
 * so a database leak cannot be replayed as a valid cookie.
 */
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    subjectType: { type: String, enum: SUBJECT_TYPES, required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    role: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'MFA_PENDING', 'REVOKED'], required: true, default: 'ACTIVE' },
    createdAt: { type: Date, required: true, default: () => new Date() },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    mfaAttempts: { type: Number, default: 0 },
  },
  { collection: 'sessions', versionKey: false },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ subjectType: 1, subjectId: 1, status: 1 });
// Expired session documents are purged 30 days after their absolute expiry.
sessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export type SessionAttrs = InferSchemaType<typeof sessionSchema>;
export type SessionDoc = ReturnType<(typeof Session)['hydrate']>;
export const Session = model('Session', sessionSchema);
