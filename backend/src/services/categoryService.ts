import type { Request } from 'express';
import type { z } from 'zod';
import { Category, Question } from '../models';
import { conflict, notFound } from '../utils/errors';
import type { categorySchema, categoryUpdateSchema } from '../validators/questions';
import { audit } from './logService';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export async function listCategories() {
  const [cats, counts] = await Promise.all([
    Category.find().sort({ name: 1 }).lean(),
    Question.aggregate<{ _id: unknown; n: number }>([{ $match: { isDeleted: false } }, { $group: { _id: '$categoryId', n: { $sum: 1 } } }]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  return cats.map((c) => ({
    id: String(c._id),
    name: c.name,
    slug: c.slug,
    description: c.description,
    isActive: c.isActive,
    questionCount: byId.get(String(c._id)) ?? 0,
  }));
}

export async function createCategory(req: Request, input: z.infer<typeof categorySchema>) {
  const slug = slugify(input.name);
  if (await Category.exists({ slug })) throw conflict('A category with this name already exists', 'CATEGORY_EXISTS');
  const cat = await Category.create({ ...input, slug, createdBy: req.admin!.user._id });
  await audit(req, { action: 'CATEGORY_CREATED', targetType: 'Category', targetId: cat._id, targetLabel: cat.name });
  return cat;
}

export async function updateCategory(req: Request, id: string, input: z.infer<typeof categoryUpdateSchema>) {
  const update: Record<string, unknown> = { ...input };
  if (input.name) {
    update.slug = slugify(input.name);
    if (await Category.exists({ slug: update.slug, _id: { $ne: id } })) throw conflict('A category with this name already exists', 'CATEGORY_EXISTS');
  }
  const cat = await Category.findByIdAndUpdate(id, { $set: update }, { new: true });
  if (!cat) throw notFound('Category not found');
  await audit(req, { action: 'CATEGORY_UPDATED', targetType: 'Category', targetId: cat._id, targetLabel: cat.name, details: input });
  return cat;
}

/** Categories in use are deactivated rather than deleted (snapshots keep the category name). */
export async function deleteCategory(req: Request, id: string) {
  const cat = await Category.findById(id);
  if (!cat) throw notFound('Category not found');
  const inUse = await Question.exists({ categoryId: cat._id, isDeleted: false });
  if (inUse) {
    cat.isActive = false;
    await cat.save();
    await audit(req, { action: 'CATEGORY_UPDATED', targetType: 'Category', targetId: cat._id, targetLabel: cat.name, details: { deactivated: true, reason: 'in use' } });
    return { deactivated: true };
  }
  await Category.deleteOne({ _id: cat._id });
  await audit(req, { action: 'CATEGORY_DELETED', targetType: 'Category', targetId: cat._id, targetLabel: cat.name });
  return { deleted: true };
}
