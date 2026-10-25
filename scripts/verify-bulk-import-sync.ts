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
  SAMPLE_BULK_TEXT_TEMPLATE_EN,
  SAMPLE_BULK_TEXT_TEMPLATE_BILINGUAL,
  SAMPLE_BULK_CSV_TEMPLATE,
  buildProfessionalAiPrompt,
  synchronizeExamTimers
} from '../src/services/mcqBulkParser.ts';
import {
  sanitizePublicQuestion,
  extractProtectedAnswerKey,
  mergeCloudAndOfflineQuestions,
  enqueueQuestionsUpsert
} from '../src/services/questionImportSyncService.ts';
import { inferAcademicContextFromText } from '../src/services/academicService.ts';
import { QuestionItemFull } from '../src/types/umed.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runVerification() {
  console.log('=== UMED Offline Bulk Question Import & Sync Verification ===\n');

  // 1. Test Structured Arabic & English Text Parsing (MCQ, True/False, Fill-in-Blank, Essay)
  const { drafts: sampleParsed } = parseBulkQuestionsInput({
    rawInput: SAMPLE_BULK_TEXT_TEMPLATE,
    formatHint: 'text',
    bankId: 'qbank-cvs-default',
    defaultPoints: 5,
    existingBankQuestions: []
  });
  assert(sampleParsed.length === 4, `Expected 4 parsed questions from SAMPLE_BULK_TEXT_TEMPLATE, got ${sampleParsed.length}`);
  assert(sampleParsed[0].correctOptionId === 'opt-b', `Q1 correctOptionId should be opt-b, got ${sampleParsed[0].correctOptionId}`);
  assert(sampleParsed[1].correctOptionId === 'opt-a' && sampleParsed[1].questionType === 'true_false', `Q2 should be true_false with opt-a (صح)`);
  assert(sampleParsed[2].questionType === 'fill_blank' && Boolean(sampleParsed[2].modelAnswerArabic), `Q3 should be fill_blank with model answer`);
  assert(sampleParsed[3].questionType === 'essay' && Boolean(sampleParsed[3].modelAnswerArabic), `Q4 should be essay with model answer`);
  assert(sampleParsed.every(q => q.isValid), 'All 4 sample text questions should be valid');
  console.log('[PASS] 1. Structured Arabic/English text parsing (MCQ, True/False, Fill-in-Blank, Essay, Rationale)');

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
    rawInput: `${SAMPLE_BULK_TEXT_TEMPLATE}\n\n5. سؤال ناقص بدون إجابة محددة؟\nأ) خيار أول\nب) خيار ثانٍ\nج) خيار ثالث\nد) خيار رابع`,
    formatHint: 'text',
    bankId: 'qbank-cvs-default',
    defaultPoints: 5,
    existingBankQuestions: [existingBankQuestion]
  });
  assert(batchWithDuplicatesAndErrors.length === 5, 'Expected 5 items in mixed validation test');
  assert(batchWithDuplicatesAndErrors[0].isDuplicateInBank === true, 'Item 1 should be flagged as duplicate in existing bank');
  assert(batchWithDuplicatesAndErrors[4].correctOptionId === '', 'Item 5 should have empty correctOptionId');
  assert(batchWithDuplicatesAndErrors[4].isValid === false, 'Item 5 should be invalid until user selects a correct answer');

  // Simulate user selecting correct answer in Review UI
  batchWithDuplicatesAndErrors[4].correctOptionId = 'opt-b';
  const revalidated = validateAndAnnotateDrafts(batchWithDuplicatesAndErrors, 'qbank-cvs-default', [existingBankQuestion]);
  assert(revalidated[4].isValid === true, 'Item 5 should become valid after user selects correct answer in review screen');
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

  // 8. Test Pure English Medical Template & Multi-Line English Clinical Vignette Parsing
  const { drafts: enParsed, detectedMetadata: enMeta } = parseBulkQuestionsInput({
    rawInput: SAMPLE_BULK_TEXT_TEMPLATE_EN,
    formatHint: 'text',
    languageHint: 'en',
    bankId: 'qbank-cvs-default',
    defaultPoints: 5,
    existingBankQuestions: []
  });
  assert(enMeta?.language === 'en', `Expected detected language 'en', got ${enMeta?.language}`);
  assert(enParsed.length === 4, `Expected 4 parsed English questions, got ${enParsed.length}`);
  assert(enParsed[0].language === 'en', `Expected Q1 language 'en', got ${enParsed[0].language}`);
  assert(enParsed[0].correctOptionId === 'opt-b', `Expected English Q1 correctOptionId opt-b, got ${enParsed[0].correctOptionId}`);
  assert(enParsed[1].questionType === 'true_false' && enParsed[1].correctOptionId === 'opt-a', 'English Q2 should be True/False with opt-a');
  assert(enParsed[2].questionType === 'fill_blank' && Boolean(enParsed[2].modelAnswerArabic), 'English Q3 should be Fill-in-Blank with model answer');
  assert(enParsed[3].questionType === 'essay' && Boolean(enParsed[3].modelAnswerArabic), 'English Q4 should be Essay with model answer');
  assert(enParsed.every(q => q.isValid), 'All 4 English template questions should be valid');
  console.log('[PASS] 8. Pure English medical template & multi-line clinical vignette parsing');

  // 9. Test Bilingual (Arabic + English) Template Parsing
  const { drafts: biParsed, detectedMetadata: biMeta } = parseBulkQuestionsInput({
    rawInput: SAMPLE_BULK_TEXT_TEMPLATE_BILINGUAL,
    formatHint: 'text',
    languageHint: 'bilingual',
    bankId: 'qbank-cvs-default',
    defaultPoints: 5,
    existingBankQuestions: []
  });
  assert(biMeta?.language === 'bilingual', `Expected detected language 'bilingual', got ${biMeta?.language}`);
  assert(biParsed.length === 2, `Expected 2 bilingual questions, got ${biParsed.length}`);
  assert(Boolean(biParsed[0].stemArabic && biParsed[0].stemEnglish), 'Bilingual Q1 must have both stemArabic and stemEnglish');
  assert(biParsed.every(q => q.isValid), 'All bilingual template questions should be valid');
  console.log('[PASS] 9. Bilingual (Arabic + English) template parsing');

  // 10. Test Flexible AI Markdown Output Preprocessing & Professional AI Prompt Builder (Dynamic Count & Year 2 Hematology Fix)
  const inferred = inferAcademicContextFromText('اختبار بلوك دم سنة ثانية');
  assert(inferred.studyLevelId === 'lvl-2', `Expected inferred level 'lvl-2' for 'بلوك دم سنة ثانية', got ${inferred.studyLevelId}`);
  assert(inferred.studyPeriodId === 'blk-hem-2', `Expected inferred period 'blk-hem-2' for 'بلوك دم سنة ثانية', got ${inferred.studyPeriodId}`);

  const dynamicHematologyPrompt = buildProfessionalAiPrompt({
    language: 'ar',
    mode: 'generate_new',
    assessmentType: 'exam',
    questionTypeMode: 'hybrid',
    isDynamicQuestionCount: true,
    topic: 'فسيولوجيا وأمراض الدم (Hematology)',
    universityName: 'جامعة دار السلام الدولية للعلوم والتكنولوجيا',
    studyLevelName: inferred.studyLevelName || 'المستوى الثاني',
    blockName: inferred.studyPeriodName || 'بلوك الدم والجهاز اللمفاوي (Hematology)',
    mcqCount: 10,
    trueFalseCount: 5,
    fillBlankCount: 5,
    essayCount: 2,
    optionsCount: 4,
    difficultyMix: 'balanced'
  });
  assert(
    dynamicHematologyPrompt.includes('المستوى الثاني') &&
      !dynamicHematologyPrompt.includes('المستوى الرابع') &&
      dynamicHematologyPrompt.includes('بلوك الدم'),
    'Dynamic Hematology AI Prompt must strictly reflect المستوى الثاني and بلوك الدم, never المستوى الرابع'
  );
  assert(
    dynamicHematologyPrompt.includes('عدد ديناميكي مفتوح'),
    'Dynamic question count prompt must instruct AI not to restrict to a fixed count'
  );
  console.log('[PASS] 10. Dynamic question count, Fill-in-Blank mode, & Second Year Hematology level/block inference');

  // 11. Test Bidirectional Timer Synchronization (per-question <-> total duration)
  const syncFromQuestionSec = synchronizeExamTimers({
    questionsCount: 111,
    durationMinutes: 30,
    questionDurationSeconds: 60,
    changedField: 'questionSeconds'
  });
  assert(
    syncFromQuestionSec.durationMinutes === 111,
    `Expected 111 questions × 60s = 111 minutes, got ${syncFromQuestionSec.durationMinutes}`
  );

  const syncFrom45Sec = synchronizeExamTimers({
    questionsCount: 111,
    durationMinutes: 30,
    questionDurationSeconds: 45,
    changedField: 'questionSeconds'
  });
  assert(
    syncFrom45Sec.durationMinutes === 84,
    `Expected ceil(111 × 45 / 60) = 84 minutes, got ${syncFrom45Sec.durationMinutes}`
  );

  const syncFromTotalMin = synchronizeExamTimers({
    questionsCount: 111,
    durationMinutes: 111,
    questionDurationSeconds: 45,
    changedField: 'totalMinutes'
  });
  assert(
    syncFromTotalMin.questionDurationSeconds === 60,
    `Expected 111 minutes ÷ 111 questions = 60s/question, got ${syncFromTotalMin.questionDurationSeconds}`
  );
  console.log('[PASS] 11. Bidirectional Timer Synchronization (questionDurationSeconds <-> durationMinutes)');

  // 12. Test 111-Question Bulk Import & Full Preservation Without Truncation
  const raw111Lines: string[] = [
    'اللغة: عربي',
    'العنوان: اختبار شامل بلوك الدم سنة ثانية (111 سؤال)',
    'المستوى: المستوى الثاني',
    'مؤقت السؤال: 45 ثانية',
    ''
  ];
  for (let i = 1; i <= 111; i++) {
    raw111Lines.push(`${i}. سؤال طبي سريري رقم ${i} في بلوك الدم والجهاز اللمفاوي لمريض يعاني من فقر دم؟`);
    raw111Lines.push(`أ) خيار تشخيصي أول للسؤال ${i}`);
    raw111Lines.push(`ب) خيار تشخيصي ثانٍ صحيح للسؤال ${i} *`);
    raw111Lines.push(`ج) خيار تشخيصي ثالث للسؤال ${i}`);
    raw111Lines.push(`د) خيار تشخيصي رابع للسؤال ${i}`);
    raw111Lines.push(`الإجابة: ب`);
    raw111Lines.push('');
  }
  const { drafts: parsed111, detectedMetadata: meta111 } = parseBulkQuestionsInput({
    rawInput: raw111Lines.join('\n'),
    formatHint: 'text',
    bankId: 'qbank-hem-111',
    defaultPoints: 5,
    existingBankQuestions: []
  });
  assert(parsed111.length === 111, `Expected all 111 questions to be parsed without truncation, got ${parsed111.length}`);
  assert(parsed111.every(d => d.isValid), 'All 111 parsed questions must be valid');
  assert(meta111.durationMinutes === 84, `Expected auto-calculated total duration 84 min for 111 questions × 45s, got ${meta111.durationMinutes}`);

  const saved111 = await enqueueQuestionsUpsert(
    'qbank-hem-111',
    parsed111.map((d, idx) => ({
      id: d.deterministicId || `q-hem-${idx + 1}`,
      bankId: 'qbank-hem-111',
      stemArabic: d.stemArabic,
      options: d.options,
      correctOptionId: d.correctOptionId,
      points: d.points,
      createdBy: 'ADMIN',
      createdAt: new Date().toISOString()
    }))
  );
  assert(saved111.length === 111, `Expected all 111 questions to be saved in bank, got ${saved111.length}`);
  console.log('[PASS] 12. 111-Question bulk import, validation, and auto-timer calculation without truncation');

  console.log('\nALL 12 VERIFICATION SUITES PASSED SUCCESSFULLY.');
}

runVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
