/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Automated Verification Suite for UMED Offline Bulk Question Import & Synchronization
 */

import {
  parseBulkQuestionsInput,
  validateAndAnnotateDrafts,
  computeQuestionFingerprint,
  SAMPLE_BULK_TEXT_TEMPLATE,
  SAMPLE_BULK_CSV_TEMPLATE
} from '../src/services/mcqBulkParser.ts';
import {
  sanitizePublicQuestion,
  extractProtectedAnswerKey,
  mergeCloudAndOfflineQuestions,
  enqueueQuestionsUpsert
} from '../src/services/questionImportSyncService.ts';
import { QuestionItemFull } from '../src/types/umed.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runVerification() {
  console.log('=== UMED Offline Bulk Question Import & Sync Verification ===\n');

  // 1. Test Structured Arabic & English Text Parsing (Aiken + inline markers + ANSWER lines)
  const { drafts: sampleParsed } = parseBulkQuestionsInput({
    rawInput: SAMPLE_BULK_TEXT_TEMPLATE,
    formatHint: 'text',
    bankId: 'qbank-cvs-default',
    defaultPoints: 5,
    existingBankQuestions: []
  });
  assert(sampleParsed.length === 3, `Expected 3 parsed questions from SAMPLE_BULK_TEXT_TEMPLATE, got ${sampleParsed.length}`);
  assert(sampleParsed[0].correctOptionId === 'opt-b', `Q1 correctOptionId should be opt-b, got ${sampleParsed[0].correctOptionId}`);
  assert(sampleParsed[1].correctOptionId === 'opt-a' && sampleParsed[1].questionType === 'true_false', `Q2 should be true_false with opt-a (صح)`);
  assert(sampleParsed[2].questionType === 'essay' && Boolean(sampleParsed[2].modelAnswerArabic), `Q3 should be essay with model answer`);
  assert(sampleParsed.every(q => q.isValid), 'All 3 sample text questions should be valid');
  console.log('[PASS] 1. Structured Arabic/English text parsing (MCQ, True/False, Essay, Rationale)');

  // 2. Test Trailing Answer Key Table Support
  const trailingKeyInput = `
س1: ما هو العصب المسؤول عن تغذية عضلة الحجاب الحاجز؟
أ) العصب المبهم (Vagus Nerve)
ب) العصب الحجابي (Phrenic Nerve)
ج) العصب الوربي
د) العصب اللاحق

س2: أي من الفيتامينات التالية يذوب في الماء؟
أ) فيتامين A
ب) فيتامين D
ج) فيتامين C
د) فيتامين K

مفتاح الإجابات:
1: ب
2: ج
`;
  const { drafts: trailingParsed } = parseBulkQuestionsInput({
    rawInput: trailingKeyInput,
    formatHint: 'text',
    bankId: 'qbank-cvs-default',
    defaultPoints: 5,
    existingBankQuestions: []
  });
  assert(trailingParsed.length === 2, `Expected 2 questions from trailingKeyInput, got ${trailingParsed.length}`);
  assert(trailingParsed[0].correctOptionId === 'opt-b', `Expected Q1 answer opt-b from trailing key, got ${trailingParsed[0].correctOptionId}`);
  assert(trailingParsed[1].correctOptionId === 'opt-c', `Expected Q2 answer opt-c from trailing key, got ${trailingParsed[1].correctOptionId}`);
  assert(trailingParsed.every(q => q.isValid), 'Trailing key questions should be valid');
  console.log('[PASS] 2. Trailing answer-key table extraction');

  // 3. Test CSV Parsing
  const { drafts: csvParsed } = parseBulkQuestionsInput({
    rawInput: SAMPLE_BULK_CSV_TEMPLATE,
    formatHint: 'csv',
    bankId: 'qbank-cvs-default',
    defaultPoints: 5,
    existingBankQuestions: []
  });
  assert(csvParsed.length === 2, `Expected 2 questions from CSV template, got ${csvParsed.length}`);
  assert(csvParsed[0].correctOptionId === 'opt-c', `CSV Q1 should have opt-c, got ${csvParsed[0].correctOptionId}`);
  assert(csvParsed[1].correctOptionId === 'opt-a', `CSV Q2 should have opt-a, got ${csvParsed[1].correctOptionId}`);
  console.log('[PASS] 3. CSV bulk parsing with Arabic/English columns');

  // 4. Test JSON Parsing
  const jsonInput = JSON.stringify([
    {
      stemArabic: 'ما هو المضاد الحيوي المختار لعلاج الزهري الأولي (Primary Syphilis)؟',
      options: ['البنسلين G طويل المفعول (Benzathine Penicillin G)', 'السيبروفلوكساسين', 'الجنتامايسين', 'الفانكومايسين'],
      answer: 'A',
      explanationArabic: 'البنسلين G البنزاثين بجرعة عضلية واحدة هو العلاج القياسي للزهري الأولي.',
      points: 5
    }
  ]);
  const { drafts: jsonParsed } = parseBulkQuestionsInput({
    rawInput: jsonInput,
    formatHint: 'json',
    bankId: 'qbank-cvs-default',
    defaultPoints: 5,
    existingBankQuestions: []
  });
  assert(Boolean(jsonParsed.length === 1 && jsonParsed[0].isValid), 'JSON question should parse and validate');
  assert(jsonParsed[0].correctOptionId === 'opt-a', 'JSON question answer should map to opt-a');
  console.log('[PASS] 4. JSON bulk parsing');

  // 5. Test Validation & Duplicate Detection (Intra-batch and Existing Bank)
  const existingBankQuestion: QuestionItemFull = {
    id: 'q-existing-1',
    bankId: 'qbank-cvs-default',
    stemArabic: sampleParsed[0].stemArabic,
    stemEnglish: sampleParsed[0].stemEnglish,
    options: sampleParsed[0].options,
    correctOptionId: sampleParsed[0].correctOptionId,
    points: 5,
    createdBy: 'ADMIN',
    createdAt: '2025-01-01T00:00:00Z',
    contentHash: computeQuestionFingerprint(sampleParsed[0].stemArabic, sampleParsed[0].stemEnglish, sampleParsed[0].options)
  };

  const { drafts: batchWithDuplicatesAndErrors } = parseBulkQuestionsInput({
    rawInput: `${SAMPLE_BULK_TEXT_TEMPLATE}\n\n4. سؤال ناقص بدون إجابة محددة؟\nأ) خيار أول\nب) خيار ثانٍ\nج) خيار ثالث\nد) خيار رابع`,
    formatHint: 'text',
    bankId: 'qbank-cvs-default',
    defaultPoints: 5,
    existingBankQuestions: [existingBankQuestion]
  });
  assert(batchWithDuplicatesAndErrors.length === 4, 'Expected 4 items in mixed validation test');
  assert(batchWithDuplicatesAndErrors[0].isDuplicateInBank === true, 'Item 1 should be flagged as duplicate in existing bank');
  assert(batchWithDuplicatesAndErrors[3].correctOptionId === '', 'Item 4 should have empty correctOptionId');
  assert(batchWithDuplicatesAndErrors[3].isValid === false, 'Item 4 should be invalid until user selects a correct answer');

  // Simulate user selecting correct answer in Review UI
  batchWithDuplicatesAndErrors[3].correctOptionId = 'opt-b';
  const revalidated = validateAndAnnotateDrafts(batchWithDuplicatesAndErrors, 'qbank-cvs-default', [existingBankQuestion]);
  assert(revalidated[3].isValid === true, 'Item 4 should become valid after user selects correct answer in review screen');
  console.log('[PASS] 5. Validation & duplicate detection (existing bank + intra-batch + interactive fix)');

  // 6. Test Security & Answer Key Protection (Sanitization)
  const fullAdminQ: QuestionItemFull = {
    id: 'q-sec-test',
    bankId: 'qbank-cvs-default',
    stemArabic: 'سؤال اختبار أمان سري؟',
    options: [
      { id: 'opt-a', textArabic: 'خيار 1' },
      { id: 'opt-b', textArabic: 'خيار 2' }
    ],
    correctOptionId: 'opt-b',
    explanationArabic: 'تعليل سري لا يظهر للطالب أثناء الامتحان',
    points: 5,
    createdBy: 'ADMIN',
    createdAt: new Date().toISOString()
  };
  const publicQ = sanitizePublicQuestion(fullAdminQ) as unknown as Record<string, unknown>;
  assert(publicQ.correctOptionId === undefined, 'Public question MUST NOT contain correctOptionId');
  assert(publicQ.explanationArabic === undefined, 'Public question MUST NOT contain explanationArabic');
  const protectedKey = extractProtectedAnswerKey(fullAdminQ);
  assert(protectedKey.correctOptionId === 'opt-b', 'Protected answer key must retain correctOptionId');
  console.log('[PASS] 6. Answer-key security separation (public vs protected collection payloads)');

  // 7. Test Conflict-Safe Cloud + Offline Outbox Merge
  const cloudQuestions: QuestionItemFull[] = [
    {
      ...fullAdminQ,
      id: 'q-merge-1',
      stemArabic: 'نسخة السحابة القديمة',
      updatedAt: '2025-01-01T10:00:00Z',
      syncStatus: 'synced'
    }
  ];
  await enqueueQuestionsUpsert('qbank-cvs-default', [
    {
      ...fullAdminQ,
      id: 'q-merge-1',
      stemArabic: 'نسخة محلية أحدث تم تعديلها أوفلاين',
      updatedAt: '2025-01-01T12:00:00Z',
      syncStatus: 'pending_sync'
    }
  ]);
  const merged = mergeCloudAndOfflineQuestions('qbank-cvs-default', cloudQuestions, []);
  assert(merged.length === 1, 'Merged list should deduplicate by question ID');
  assert(
    merged[0].stemArabic === 'نسخة محلية أحدث تم تعديلها أوفلاين',
    'Newer offline pending outbox edit must win over older cloud record without data loss'
  );
  console.log('[PASS] 7. Conflict-safe offline outbox + cloud merging & deduplication');

  console.log('\nALL 7 VERIFICATION SUITES PASSED SUCCESSFULLY.');
}

runVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
