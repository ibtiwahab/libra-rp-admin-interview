import type { Schema } from 'mongoose';

const MUTATIONS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'findOneAndDelete',
  'deleteOne',
  'deleteMany',
] as const;

/**
 * Makes a collection append-only at the application layer: documents can be inserted but
 * never modified or deleted through Mongoose. Used for audit logs and historical snapshots.
 * (Authorized retention / legal-deletion procedures operate on the raw driver deliberately.)
 */
export function makeImmutable(schema: Schema, name: string): void {
  for (const op of MUTATIONS) {
    schema.pre(op as 'updateOne', function rejectMutation() {
      throw new Error(`${name} records are immutable (attempted ${op})`);
    });
  }
  schema.pre('save', function rejectResave() {
    if (!this.isNew) throw new Error(`${name} records are immutable (attempted save on existing document)`);
  });
}
