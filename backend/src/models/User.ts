import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ADMIN_ROLES, ADMIN_STATUSES } from '../config/constants';

/** Administrative accounts: Head Admins and Support Curators. */
const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, lowercase: true, minlength: 3, maxlength: 32 },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    discordUsername: { type: String, trim: true, maxlength: 64, default: null },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: null },
    role: { type: String, enum: ADMIN_ROLES, required: true },
    status: { type: String, enum: ADMIN_STATUSES, default: 'ACTIVE', required: true },
    passwordHash: { type: String, required: true, select: false },
    passwordChangedAt: { type: Date, default: null },
    mustChangePassword: { type: Boolean, default: false },
    mfa: {
      enabled: { type: Boolean, default: false },
      secretEnc: { type: String, default: null, select: false },
      pendingSecretEnc: { type: String, default: null, select: false },
      enabledAt: { type: Date, default: null },
    },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    removedAt: { type: Date, default: null },
    removedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ role: 1, status: 1 });

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;
export const User = model('User', userSchema);
