import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ASSIGNMENT_STATUSES } from '../config/constants';

const assignmentSchema = new Schema(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'InterviewTemplate', required: true },
    interviewVersionId: { type: Schema.Types.ObjectId, ref: 'InterviewVersion', required: true },
    status: { type: String, enum: ASSIGNMENT_STATUSES, default: 'NOT_STARTED', required: true },
    /** true while NOT_STARTED or IN_PROGRESS — a partial unique index allows one open assignment per candidate. */
    isOpen: { type: Boolean, default: true },
    attemptId: { type: Schema.Types.ObjectId, ref: 'InterviewAttempt', default: null },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedAt: { type: Date, required: true, default: () => new Date() },
    /** Last moment the candidate may begin. Null = no deadline beyond the interview availability window. */
    startDeadline: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'interview_assignments' },
);

assignmentSchema.index({ candidateId: 1 }, { unique: true, partialFilterExpression: { isOpen: true }, name: 'one_open_assignment_per_candidate' });
assignmentSchema.index({ candidateId: 1, assignedAt: -1 });
assignmentSchema.index({ status: 1, startDeadline: 1 });

export type AssignmentAttrs = InferSchemaType<typeof assignmentSchema>;
export type AssignmentDoc = HydratedDocument<AssignmentAttrs>;
export const Assignment = model('Assignment', assignmentSchema);
