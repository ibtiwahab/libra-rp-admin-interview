import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { CANDIDATE_STATUSES } from '../config/constants';

const candidateSchema = new Schema(
  {
    /** Login username, e.g. LIBRA-ADMIN-0001. */
    candidateCode: { type: String, required: true, trim: true, uppercase: true },
    sequence: { type: Number, required: true },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    discordUsername: { type: String, required: true, trim: true, maxlength: 64 },
    discordId: { type: String, trim: true, maxlength: 32, default: null },
    characterName: { type: String, required: true, trim: true, maxlength: 80 },
    appliedRole: { type: String, required: true, trim: true, maxlength: 64, default: 'Admin Assistant' },
    status: { type: String, enum: CANDIDATE_STATUSES, default: 'ACTIVE', required: true },
    passwordHash: { type: String, required: true, select: false },
    credentialsIssuedAt: { type: Date, required: true },
    credentialsIssuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    credentialVersion: { type: Number, default: 1 },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'candidates' },
);

candidateSchema.index({ candidateCode: 1 }, { unique: true });
candidateSchema.index({ sequence: 1 }, { unique: true });
candidateSchema.index({ discordUsername: 1 });
candidateSchema.index({ status: 1, createdAt: -1 });

export type CandidateAttrs = InferSchemaType<typeof candidateSchema>;
export type CandidateDoc = HydratedDocument<CandidateAttrs>;
export const Candidate = model('Candidate', candidateSchema);
