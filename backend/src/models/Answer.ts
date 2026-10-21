import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ANSWER_STATUSES } from '../config/constants';
import { questionSnapshotSchema } from './Interview';

/**
 * A candidate's response to one question. Created only when the question is activated,
 * so unreached questions never have a document. Holds a full copy of the question as delivered.
 */
const answerSchema = new Schema(
  {
    attemptId: { type: Schema.Types.ObjectId, ref: 'InterviewAttempt', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
    questionIndex: { type: Number, required: true },
    question: { type: questionSnapshotSchema, required: true },
    status: { type: String, enum: ANSWER_STATUSES, required: true, default: 'ACTIVE' },

    activatedAt: { type: Date, required: true },
    deadlineAt: { type: Date, required: true },
    allowedSeconds: { type: Number, required: true },
    submittedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    answerText: { type: String, default: '', maxlength: 5000 },
    selectedOptionKeys: { type: [String], default: [] },
    booleanAnswer: { type: Boolean, default: null },
    /** Monotonic client sequence; prevents a delayed autosave from overwriting a newer one. */
    saveSeq: { type: Number, default: 0 },
    saveCount: { type: Number, default: 0 },
    lastSavedAt: { type: Date, default: null },
    hasResponse: { type: Boolean, default: false },

    autoScore: { type: Number, default: null },
    awardedScore: { type: Number, default: null },
    evaluatorNotes: { type: String, default: '', maxlength: 2000 },
    scoredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    scoredAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'interview_answers' },
);

answerSchema.index({ attemptId: 1, questionIndex: 1 }, { unique: true });
answerSchema.index({ status: 1, deadlineAt: 1 });
answerSchema.index({ 'question.questionId': 1 });

export type AnswerAttrs = InferSchemaType<typeof answerSchema>;
export type AnswerDoc = HydratedDocument<AnswerAttrs>;
export const Answer = model('InterviewAnswer', answerSchema);
