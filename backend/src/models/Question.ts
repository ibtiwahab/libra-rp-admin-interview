import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  TIMER_DEFAULT_SECONDS,
  TIMER_MAX_SECONDS,
  TIMER_MIN_SECONDS,
} from '../config/constants';
import { makeImmutable } from './immutable';

export const optionSchema = new Schema(
  {
    key: { type: String, required: true, maxlength: 8 },
    text: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false },
);

/** Fields that define what a candidate sees and how the question is graded. Versioned. */
const contentFields = {
  title: { type: String, required: true, trim: true, maxlength: 160 },
  prompt: { type: String, required: true, trim: true, maxlength: 4000 },
  scenario: { type: String, trim: true, maxlength: 4000, default: '' },
  type: { type: String, enum: QUESTION_TYPES, required: true },
  difficulty: { type: String, enum: DIFFICULTIES, required: true, default: 'MEDIUM' },
  timeLimitSeconds: {
    type: Number,
    required: true,
    min: TIMER_MIN_SECONDS,
    max: TIMER_MAX_SECONDS,
    default: TIMER_DEFAULT_SECONDS,
  },
  maxScore: { type: Number, required: true, min: 1, max: 100, default: 10 },
  rubric: { type: String, trim: true, maxlength: 4000, default: '' },
  options: { type: [optionSchema], default: [] },
  allowMultiple: { type: Boolean, default: false },
  correctOptionKeys: { type: [String], default: [] },
  correctBoolean: { type: Boolean, default: null },
};

const questionSchema = new Schema(
  {
    ...contentFields,
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    position: { type: Number, required: true },
    version: { type: Number, required: true, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'questions' },
);
questionSchema.index({ isDeleted: 1, position: 1 });
questionSchema.index({ categoryId: 1, isDeleted: 1 });
questionSchema.index({ title: 'text', prompt: 'text' });

export type QuestionAttrs = InferSchemaType<typeof questionSchema>;
export type QuestionDoc = HydratedDocument<QuestionAttrs>;
export const Question = model('Question', questionSchema);

/** Immutable snapshot of every revision of a question. */
const questionVersionSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    version: { type: Number, required: true },
    ...contentFields,
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    categoryName: { type: String, required: true },
    changeType: { type: String, enum: ['CREATED', 'UPDATED', 'DELETED'], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'question_versions' },
);
questionVersionSchema.index({ questionId: 1, version: 1 }, { unique: true });
makeImmutable(questionVersionSchema, 'QuestionVersion');

export type QuestionVersionAttrs = InferSchemaType<typeof questionVersionSchema>;
export const QuestionVersion = model('QuestionVersion', questionVersionSchema);
