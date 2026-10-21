import { Schema, model, type ClientSession } from 'mongoose';

const counterSchema = new Schema(
  { _id: { type: String, required: true }, seq: { type: Number, default: 0 } },
  { collection: 'counters', versionKey: false },
);

export const Counter = model('Counter', counterSchema);

/** Atomically increments and returns the next value of a named sequence. */
export async function nextSequence(name: string, session?: ClientSession): Promise<number> {
  const doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
  return doc!.seq;
}
