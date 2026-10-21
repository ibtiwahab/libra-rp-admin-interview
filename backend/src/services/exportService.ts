import PDFDocument from 'pdfkit';
import type { z } from 'zod';
import { Attempt } from '../models';
import { toCsv } from '../utils/csv';
import type { listAttemptsSchema } from '../validators/evaluations';
import { attemptFilter, getEvaluation } from './evaluationService';

const MAX_EXPORT_ROWS = 10_000;

export async function attemptsCsv(input: z.infer<typeof listAttemptsSchema>) {
  const rows = await Attempt.find(attemptFilter(input)).sort({ startedAt: -1 }).limit(MAX_EXPORT_ROWS).populate('evaluatedBy', 'fullName').lean();
  const headers = [
    'Reference',
    'Candidate ID',
    'Name (OOC)',
    'Discord Username',
    'Discord ID',
    'Main IC Character',
    'Applied Role',
    'Interview',
    'Interview Version',
    'Status',
    'End Reason',
    'Started At (UTC)',
    'Ended At (UTC)',
    'Answered',
    'Unanswered',
    'Timed Out',
    'Score',
    'Max Score',
    'Percentage',
    'Passing %',
    'Result',
    'Security Violation',
    'Violation Detected At (UTC)',
    'Warnings',
    'Evaluated By',
    'Evaluated At (UTC)',
  ];
  const data = rows.map((a: any) => [
    a.referenceCode,
    a.candidateSnapshot.candidateCode,
    a.candidateSnapshot.fullName,
    a.candidateSnapshot.discordUsername,
    a.candidateSnapshot.discordId,
    a.candidateSnapshot.characterName,
    a.candidateSnapshot.appliedRole,
    a.interviewSnapshot.title,
    a.interviewSnapshot.version,
    a.status,
    a.endReason,
    a.startedAt,
    a.endedAt,
    a.scoring.answeredCount,
    a.scoring.unansweredCount,
    a.scoring.timedOutCount,
    a.scoring.totalScore,
    a.scoring.maxScore,
    a.scoring.percentage,
    a.interviewSnapshot.passingPercent,
    a.result,
    a.securityViolation?.type ?? '',
    a.securityViolation?.detectedAt ?? '',
    a.warningCount,
    a.evaluatedBy?.fullName ?? '',
    a.evaluatedAt,
  ]);
  return { csv: toCsv(headers, data), count: rows.length };
}

const C = {
  ink: '#08090D',
  panel: '#111319',
  gold: '#C9A961',
  goldSoft: '#E6D3A3',
  text: '#1D2029',
  muted: '#6B7080',
  line: '#D9D4C7',
  red: '#B4443C',
  green: '#3C8F6A',
  amber: '#B98A2E',
};

function fmt(d: Date | string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

/** Branded single-attempt report. Streams the PDF to the provided writable. */
export async function attemptPdf(attemptId: string, generatedBy: string): Promise<{ doc: PDFKit.PDFDocument; filename: string }> {
  const data = await getEvaluation(attemptId);
  const a = data.attempt;
  const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 56, left: 48, right: 48 }, bufferPages: true, info: { Title: `Interview Report ${a.referenceCode}`, Author: 'LIBRA RP — Admin Recruitment System' } });
  const W = doc.page.width;
  const left = doc.page.margins.left;
  const contentW = W - left - doc.page.margins.right;

  // Header band
  doc.rect(0, 0, W, 120).fill(C.ink);
  doc.rect(0, 118, W, 2).fill(C.gold);
  doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(9).text('LIBRA RP', left, 30, { characterSpacing: 4 });
  doc.fillColor('#F4EFE4').font('Helvetica-Bold').fontSize(18).text('Interview Evaluation Report', left, 46);
  doc.fillColor('#9BA0AE').font('Helvetica').fontSize(9).text('ADMIN RECRUITMENT SYSTEM  ·  Integrity. Authority. Excellence.', left, 72, { characterSpacing: 0.5 });
  doc.fillColor(C.goldSoft).font('Helvetica-Bold').fontSize(10).text(`REF ${a.referenceCode}`, left, 30, { width: contentW, align: 'right' });
  doc.fillColor('#9BA0AE').font('Helvetica').fontSize(8).text(`Generated ${fmt(new Date())}`, left, 46, { width: contentW, align: 'right' }).text(`by ${generatedBy}`, { width: contentW, align: 'right' });

  doc.y = 140;
  const section = (title: string) => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(0.6);
    doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(8.5).text(title.toUpperCase(), left, doc.y, { characterSpacing: 2 });
    doc.moveTo(left, doc.y + 3).lineTo(left + contentW, doc.y + 3).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.moveDown(0.7);
  };
  const kv = (pairs: [string, string][]) => {
    const colW = contentW / 2;
    for (let i = 0; i < pairs.length; i += 2) {
      const y = doc.y;
      for (let j = 0; j < 2; j++) {
        const p = pairs[i + j];
        if (!p) continue;
        doc.fillColor(C.muted).font('Helvetica').fontSize(7.5).text(p[0].toUpperCase(), left + j * colW, y, { width: colW - 12, characterSpacing: 0.8 });
        doc.fillColor(C.text).font('Helvetica-Bold').fontSize(10).text(p[1] || '—', left + j * colW, y + 10, { width: colW - 12 });
      }
      doc.y = y + 30;
    }
  };

  section('Candidate');
  kv([
    ['Name (OOC)', a.candidate.fullName],
    ['Candidate ID', a.candidate.candidateCode],
    ['Discord username', a.candidate.discordUsername],
    ['Discord ID', a.candidate.discordId ?? '—'],
    ['Main IC character', a.candidate.characterName],
    ['Applied role', a.candidate.appliedRole],
  ]);

  section('Interview');
  const pct = a.scoring.percentage != null ? `${a.scoring.percentage}%` : '—';
  kv([
    ['Interview', `${a.interview.title} (v${a.interview.version})`],
    ['Position', a.interview.position],
    ['Started', fmt(a.startedAt)],
    ['Ended', fmt(a.endedAt)],
    ['Status', a.status.replace(/_/g, ' ')],
    ['End reason', (a.endReason ?? '—').replace(/_/g, ' ')],
    ['Answered / Unanswered / Timed out', `${a.scoring.answeredCount} / ${a.scoring.unansweredCount} / ${a.scoring.timedOutCount}`],
    ['Score', `${a.scoring.totalScore ?? '—'} / ${a.scoring.maxScore}  (${pct})  ·  pass mark ${a.interview.passingPercent}%`],
  ]);

  // Result badge
  const resultColor = a.result === 'PASSED' ? C.green : a.result === 'FAILED' || a.result === 'DISQUALIFIED' ? C.red : C.amber;
  const by = doc.y + 4;
  doc.roundedRect(left, by, contentW, 34, 4).fill('#F6F2E8');
  doc.rect(left, by, 4, 34).fill(resultColor);
  doc.fillColor(C.muted).font('Helvetica').fontSize(7.5).text('FINAL EVALUATION', left + 16, by + 7, { characterSpacing: 1 });
  doc.fillColor(resultColor).font('Helvetica-Bold').fontSize(13).text(a.result.replace(/_/g, ' '), left + 16, by + 16);
  doc.fillColor(C.muted).font('Helvetica').fontSize(8).text(a.evaluatedBy ? `Evaluated by ${a.evaluatedBy.fullName} · ${fmt(a.evaluatedAt)}` : 'Not yet evaluated', left, by + 13, { width: contentW - 16, align: 'right' });
  doc.y = by + 46;

  section('Security');
  if (a.securityViolation) {
    doc.fillColor(C.red).font('Helvetica-Bold').fontSize(10).text(`${a.securityViolation.type.replace(/_/g, ' ')} — ${a.securityViolation.source.replace(/_/g, ' ')}`, left);
    doc.fillColor(C.text).font('Helvetica').fontSize(9).text(a.securityViolation.reason, { width: contentW });
    doc.fillColor(C.muted).fontSize(8).text(`Detected ${fmt(a.securityViolation.detectedAt)} on question ${(a.securityViolation.questionIndex ?? 0) + 1}`);
  } else {
    doc.fillColor(C.green).font('Helvetica-Bold').fontSize(10).text('No security violation recorded', left);
  }
  doc.fillColor(C.muted).font('Helvetica').fontSize(8).text(`Security warnings logged: ${a.warningCount}`);

  section('Responses');
  for (const q of data.questions) {
    if (doc.y > doc.page.height - 160) doc.addPage();
    const top = doc.y;
    doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(9).text(`Q${q.index + 1}`, left, top, { width: 28 });
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(10).text(q.question.title, left + 30, top, { width: contentW - 130 });
    const score = q.awardedScore != null ? `${q.awardedScore} / ${q.question.maxScore}` : `— / ${q.question.maxScore}`;
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(10).text(score, left, top, { width: contentW, align: 'right' });
    doc.fillColor(C.muted).font('Helvetica').fontSize(7.5).text(
      `${q.question.categoryName} · ${q.question.type.replace(/_/g, ' ')} · ${q.allowedSeconds}s · ${q.status.replace(/_/g, ' ')}${q.responseMs != null ? ` in ${(q.responseMs / 1000).toFixed(1)}s` : ''}`,
      left + 30,
      doc.y + 2,
      { width: contentW - 30 },
    );
    doc.moveDown(0.3);
    doc.fillColor('#3A3F4B').font('Helvetica').fontSize(8.5).text(q.question.prompt, left + 30, doc.y, { width: contentW - 30 });
    doc.moveDown(0.35);
    let answer = '';
    if (!q.reached) answer = 'Not reached';
    else if (q.question.type === 'MULTIPLE_CHOICE') {
      answer = q.selectedOptionKeys.length
        ? q.selectedOptionKeys.map((k: string) => `${k}. ${q.question.options.find((o: { key: string }) => o.key === k)?.text ?? ''}`).join('\n')
        : 'No answer';
    } else if (q.question.type === 'TRUE_FALSE') answer = q.booleanAnswer === null ? 'No answer' : q.booleanAnswer ? 'True' : 'False';
    else answer = q.answerText?.trim() ? q.answerText : 'No answer';
    const ay = doc.y;
    doc.font('Helvetica').fontSize(9);
    const h = doc.heightOfString(answer, { width: contentW - 46 }) + 12;
    doc.roundedRect(left + 30, ay, contentW - 30, h, 3).fill('#F7F5EF');
    doc.fillColor(C.text).text(answer, left + 38, ay + 6, { width: contentW - 46 });
    doc.y = ay + h + 4;
    if (q.evaluatorNotes) {
      doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(8).text(`Evaluator: ${q.evaluatorNotes}`, left + 30, doc.y, { width: contentW - 30 });
    }
    doc.moveDown(0.8);
  }

  if (data.revisions.length) {
    section('Evaluation history');
    for (const r of data.revisions) {
      doc.fillColor(C.text).font('Helvetica-Bold').fontSize(9).text(`Rev ${r.revision} · ${r.decision.replace(/_/g, ' ')} · ${r.totalScore}/${r.maxScore} (${r.percentage}%)`, left);
      doc.fillColor(C.muted).font('Helvetica').fontSize(8).text(`${r.evaluator} · ${fmt(r.createdAt)} · previously ${r.previousDecision.replace(/_/g, ' ')}`);
      if (r.overallNotes) doc.fillColor('#3A3F4B').fontSize(8.5).text(r.overallNotes, { width: contentW });
      doc.moveDown(0.5);
    }
  }

  // Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = doc.page.height - 36;
    doc.moveTo(left, fy - 6).lineTo(left + contentW, fy - 6).lineWidth(0.4).strokeColor(C.line).stroke();
    doc.fillColor(C.muted).font('Helvetica').fontSize(7).text(`CONFIDENTIAL — LIBRA RP MANAGEMENT ONLY  ·  ${a.candidate.candidateCode}  ·  ${a.referenceCode}`, left, fy, { width: contentW, align: 'left', lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, left, fy, { width: contentW, align: 'right', lineBreak: false });
  }

  return { doc, filename: `libra-interview-${a.candidate.candidateCode}-${a.referenceCode}.pdf` };
}
