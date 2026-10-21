import type { Request, Response } from 'express';
import { candidateCtx } from '../middleware/auth';
import * as exam from '../services/examService';
import { heartbeatSchema, saveAnswerSchema, securityEventSchema, startSchema, submitAnswerSchema } from '../validators/exam';

const instance = (req: Request) => {
  const v = req.get('x-exam-instance');
  return v && /^[A-Za-z0-9_-]{16,64}$/.test(v) ? v : undefined;
};

export async function status(req: Request, res: Response) {
  res.json(await exam.getStatus(candidateCtx(req)));
}

export async function assignment(req: Request, res: Response) {
  const s = await exam.getStatus(candidateCtx(req));
  res.json({ state: s.state, interview: 'interview' in s ? s.interview : null });
}

export async function instructions(req: Request, res: Response) {
  res.json(await exam.getInstructions(candidateCtx(req)));
}

export async function start(req: Request, res: Response) {
  const input = startSchema.parse(req.body);
  res.status(201).json(await exam.startAttempt(candidateCtx(req), input));
}

export async function currentQuestion(req: Request, res: Response) {
  res.json(await exam.currentQuestion(candidateCtx(req), instance(req)));
}

export async function saveAnswer(req: Request, res: Response) {
  const input = saveAnswerSchema.parse(req.body);
  res.json(await exam.saveAnswer(candidateCtx(req), instance(req), input));
}

export async function submitAnswer(req: Request, res: Response) {
  const input = submitAnswerSchema.parse(req.body);
  res.json(await exam.submitAnswer(candidateCtx(req), instance(req), input));
}

export async function heartbeat(req: Request, res: Response) {
  const input = heartbeatSchema.parse(req.body);
  res.json(await exam.heartbeat(candidateCtx(req), instance(req), input));
}

export async function securityEvent(req: Request, res: Response) {
  const input = securityEventSchema.parse(req.body);
  res.json(await exam.reportSecurityEvent(candidateCtx(req), { ...input, instanceId: input.instanceId ?? instance(req) }));
}
