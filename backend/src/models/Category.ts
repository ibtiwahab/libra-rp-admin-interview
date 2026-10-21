import { Schema, model, type InferSchemaType } from 'mongoose';

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 64 },
    description: { type: String, trim: true, maxlength: 280, default: '' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'categories' },
);
categorySchema.index({ slug: 1 }, { unique: true });

export type CategoryAttrs = InferSchemaType<typeof categorySchema>;
export const Category = model('Category', categorySchema);
