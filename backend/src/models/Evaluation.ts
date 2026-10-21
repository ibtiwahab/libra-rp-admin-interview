import { Schema, model, type InferSchemaType } from 'mongoose';
import { EVALUATION_DECISIONS, RESULTS } from '../config/constants';
import { makeImmutable } from './immutable';

const markSchema = new Schema(
  {
    questionIndex: { type: Number, required: true },
    awardedScore: { type: Number, required: true, min: 0 },
    maxScore: { type: Number, required: true },
    notes: { type: String, default: '', maxlength: 2000 },
  },
  { _id: false },
);

/**
 * Append-only evaluation history. Every save creates a new revision; the attempt document
 * holds the current result. Previous values are therefore never lost.
 */
const evaluationSchema = new Schema(
  {
    attemptId: { type: Schema.Types.ObjectId, ref: 'InterviewAttempt', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
    revision: { type: Number, required: true },
    evaluatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    evaluatorName: { type: String, required: true },
    decision: { type: String, enum: EVALUATION_DECISIONS, required: true },
    previousDecision: { type: String, enum: RESULTS, required: true },
    marks: { type: [markSchema], default: [] },
    overallNotes: { type: String, default: '', maxlength: 4000 },
    totalScore: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    percentage: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'interview_evaluations' },
);
evaluationSchema.index({ attemptId: 1, revision: 1 }, { unique: true });
evaluationSchema.index({ evaluatorId: 1, createdAt: -1 });
makeImmutable(evaluationSchema, 'InterviewEvaluation');

export type EvaluationAttrs = InferSchemaType<typeof evaluationSchema>;
export const Evaluation = model('InterviewEvaluation', evaluationSchema);
