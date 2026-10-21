import { Schema, model, type InferSchemaType } from 'mongoose';

/** Free-form evaluation notes that management attaches to a candidate profile. */
const candidateNoteSchema = new Schema(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
    attemptId: { type: Schema.Types.ObjectId, ref: 'InterviewAttempt', default: null },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'candidate_notes' },
);
candidateNoteSchema.index({ candidateId: 1, createdAt: -1 });

export type CandidateNoteAttrs = InferSchemaType<typeof candidateNoteSchema>;
export const CandidateNote = model('CandidateNote', candidateNoteSchema);
