import { Schema, model, type InferSchemaType, type HydratedDocument, type Types } from 'mongoose';
import { DIFFICULTIES, QUESTION_TYPES, TEMPLATE_STATUSES, TIMER_MAX_SECONDS, TIMER_MIN_SECONDS } from '../config/constants';
import { makeImmutable } from './immutable';
import { optionSchema } from './Question';

const templateQuestionSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    /** Optional per-interview timer override (30–60s); falls back to the question's own timer. */
    timeLimitSeconds: { type: Number, min: TIMER_MIN_SECONDS, max: TIMER_MAX_SECONDS, default: null },
  },
  { _id: false },
);

/** Editable interview template (draft). Publishing freezes it into an InterviewVersion. */
const interviewTemplateSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    position: { type: String, required: true, trim: true, maxlength: 64 },
    instructions: { type: String, trim: true, maxlength: 6000, default: '' },
    status: { type: String, enum: TEMPLATE_STATUSES, default: 'DRAFT', required: true },
    isActive: { type: Boolean, default: true },
    availableFrom: { type: Date, default: null },
    availableUntil: { type: Date, default: null },
    passingPercent: { type: Number, min: 0, max: 100, default: 70 },
    questions: { type: [templateQuestionSchema], default: [] },
    publishedVersionId: { type: Schema.Types.ObjectId, ref: 'InterviewVersion', default: null },
    publishedVersion: { type: Number, default: 0 },
    publishedAt: { type: Date, default: null },
    hasUnpublishedChanges: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'interview_templates' },
);
interviewTemplateSchema.index({ isDeleted: 1, status: 1, updatedAt: -1 });
interviewTemplateSchema.index({ 'questions.questionId': 1 });

export type InterviewTemplateAttrs = InferSchemaType<typeof interviewTemplateSchema>;
export type InterviewTemplateDoc = HydratedDocument<InterviewTemplateAttrs>;
export const InterviewTemplate = model('InterviewTemplate', interviewTemplateSchema);

/** Exactly what a candidate receives for one question, frozen at publish time. */
export const questionSnapshotSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    questionVersion: { type: Number, required: true },
    order: { type: Number, required: true },
    title: { type: String, required: true },
    prompt: { type: String, required: true },
    scenario: { type: String, default: '' },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    difficulty: { type: String, enum: DIFFICULTIES, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    categoryName: { type: String, required: true },
    timeLimitSeconds: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    rubric: { type: String, default: '' },
    options: { type: [optionSchema], default: [] },
    allowMultiple: { type: Boolean, default: false },
    correctOptionKeys: { type: [String], default: [] },
    correctBoolean: { type: Boolean, default: null },
  },
  { _id: false },
);

const interviewVersionSchema = new Schema(
  {
    templateId: { type: Schema.Types.ObjectId, ref: 'InterviewTemplate', required: true },
    version: { type: Number, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    position: { type: String, required: true },
    instructions: { type: String, default: '' },
    passingPercent: { type: Number, required: true },
    availableFrom: { type: Date, default: null },
    availableUntil: { type: Date, default: null },
    questions: { type: [questionSnapshotSchema], required: true },
    totalQuestions: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    totalTimeSeconds: { type: Number, required: true },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    publishedAt: { type: Date, required: true },
  },
  { collection: 'interview_versions', versionKey: false },
);
interviewVersionSchema.index({ templateId: 1, version: 1 }, { unique: true });
makeImmutable(interviewVersionSchema, 'InterviewVersion');

export type InterviewVersionAttrs = InferSchemaType<typeof interviewVersionSchema>;
/** Plain (non-Mongoose) shape of a frozen question, used by grading and delivery code. */
export interface QuestionSnapshot {
  questionId: Types.ObjectId;
  questionVersion: number;
  order: number;
  title: string;
  prompt: string;
  scenario?: string | null;
  type: (typeof QUESTION_TYPES)[number];
  difficulty: (typeof DIFFICULTIES)[number];
  categoryId: Types.ObjectId;
  categoryName: string;
  timeLimitSeconds: number;
  maxScore: number;
  rubric?: string | null;
  options: { key: string; text: string }[];
  allowMultiple?: boolean | null;
  correctOptionKeys: string[];
  correctBoolean?: boolean | null;
}
export const InterviewVersion = model('InterviewVersion', interviewVersionSchema);
