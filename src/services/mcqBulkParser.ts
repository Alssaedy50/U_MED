/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Deterministic Offline Bulk MCQ Parser, Validator & Duplicate Detector
 * 100% Independent of AI and Network Connectivity.
 *
 * Supports:
 * 1. Structured / Free-form Arabic & English Text (Aiken, numbered blocks, inline * or ✓ markers,
 *    explicit Answer/الإجابة lines, and bottom Answer Key tables).
 * 2. CSV / TSV spreadsheets with Arabic or English headers.
 * 3. JSON arrays or objects (`{ questions: [...] }`).
 */

import {
  ParsedQuestionDraft,
  QuestionItemFull,
  QuestionOption,
  QuestionValidationIssue,
  QuestionType,
  DetectedAssessmentMetadata
} from '../types/umed.ts';

export const CANONICAL_OPTION_IDS = [
  'opt-a',
  'opt-b',
  'opt-c',
  'opt-d',
  'opt-e',
  'opt-f',
  'opt-g',
  'opt-h'
] as const;

export function getOptionIdByIndex(index: number): string {
  return CANONICAL_OPTION_IDS[index] || `opt-${index + 1}`;
}

/**
 * Normalizes Arabic & English text for deterministic duplicate detection and comparison.
 * Strips Arabic diacritics (tashkeel), tatweel, unifies alef/teh-marbuta/yeh, and collapses whitespace.
 */
export function normalizeMedicalText(input?: string | null): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // Remove tashkeel and tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fast, deterministic FNV-1a 64-bit-like hex hash (pure JS, works offline in browser & Node)
 */
export function computeDeterministicHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0, ch; i < input.length; i++) {
    ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hex1}${hex2}`;
}

/**
 * Computes a deterministic content fingerprint for an MCQ based on its normalized stem and options.
 */
export function computeQuestionFingerprint(
  stemArabic: string,
  stemEnglishOrOptions?: string | QuestionOption[],
  maybeOptions?: QuestionOption[]
): string {
  const stemEnglish = typeof stemEnglishOrOptions === 'string' ? stemEnglishOrOptions : '';
  const options = Array.isArray(stemEnglishOrOptions) ? stemEnglishOrOptions : (maybeOptions || []);
  const normStemAr = normalizeMedicalText(stemArabic);
  const normStemEn = normalizeMedicalText(stemEnglish);
  const normOpts = options
    .map(o => normalizeMedicalText(o.textArabic || o.textEnglish || ''))
    .filter(Boolean)
    .join('|');
  const canonical = `${normStemAr}::${normStemEn}::${normOpts}`;
  return computeDeterministicHash(canonical);
}

/**
 * Maps any Arabic/English letter, number, or option text to canonical option ID ('opt-a', 'opt-b', ...).
 * Also maps True/False tokens ('صح', 'خطأ', 'True', 'False') reliably.
 */
export function resolveCanonicalOptionId(
  rawToken: string,
  options: QuestionOption[] = []
): string {
  if (!rawToken) return '';
  const cleaned = rawToken.trim();
  const lower = cleaned.toLowerCase();

  // True / False detection
  if (
    lower === 'true' ||
    cleaned === 'صح' ||
    cleaned === 'صواب' ||
    cleaned === 'صحيح' ||
    lower === 't' ||
    cleaned === 'صح (صواب)'
  ) {
    const trueOpt = options.find(
      o => o.id === 'opt-a' || /صح|صواب|true/i.test(o.textArabic) || /true/i.test(o.textEnglish || '')
    );
    return trueOpt ? trueOpt.id : (options[0]?.id || 'opt-a');
  }

  if (
    lower === 'false' ||
    cleaned === 'خطأ' ||
    cleaned === 'خاطئ' ||
    cleaned === 'غلط' ||
    lower === 'f'
  ) {
    const falseOpt = options.find(
      o => o.id === 'opt-b' || /خطأ|خاطئ|غلط|false/i.test(o.textArabic) || /false/i.test(o.textEnglish || '')
    );
    return falseOpt ? falseOpt.id : (options[1]?.id || 'opt-b');
  }

  // Letters A through H and Arabic alphabet mappings
  if (lower === 'opt-a' || lower === 'a' || cleaned === 'أ' || cleaned === 'ا' || lower === '1' || lower === 'option a' || cleaned === 'خيار أ' || cleaned === 'الخيار أ') {
    return options[0]?.id || 'opt-a';
  }
  if (lower === 'opt-b' || lower === 'b' || cleaned === 'ب' || lower === '2' || lower === 'option b' || cleaned === 'خيار ب' || cleaned === 'الخيار ب') {
    return options[1]?.id || 'opt-b';
  }
  if (lower === 'opt-c' || lower === 'c' || cleaned === 'ج' || cleaned === 'ت' || lower === '3' || lower === 'option c' || cleaned === 'خيار ج' || cleaned === 'الخيار ج') {
    return options[2]?.id || 'opt-c';
  }
  if (lower === 'opt-d' || lower === 'd' || cleaned === 'د' || cleaned === 'ث' || lower === '4' || lower === 'option d' || cleaned === 'خيار د' || cleaned === 'الخيار د') {
    return options[3]?.id || 'opt-d';
  }
  if (lower === 'opt-e' || lower === 'e' || cleaned === 'هـ' || cleaned === 'ه' || lower === '5' || lower === 'option e' || cleaned === 'خيار هـ' || cleaned === 'الخيار هـ' || cleaned === 'خيار ه') {
    return options[4]?.id || 'opt-e';
  }
  if (lower === 'opt-f' || lower === 'f' || cleaned === 'و' || lower === '6' || lower === 'option f' || cleaned === 'خيار و' || cleaned === 'الخيار و') {
    return options[5]?.id || 'opt-f';
  }
  if (lower === 'opt-g' || lower === 'g' || cleaned === 'ز' || lower === '7' || lower === 'option g' || cleaned === 'خيار ز') {
    return options[6]?.id || 'opt-g';
  }
  if (lower === 'opt-h' || lower === 'h' || cleaned === 'ح' || lower === '8' || lower === 'option h' || cleaned === 'خيار ح') {
    return options[7]?.id || 'opt-h';
  }

  // Extract leading letter/number from patterns like "A) ...", "ب - ...", "(ج)", "هـ."
  const prefixMatch = cleaned.match(/^[([\s]*([A-Ha-hأابجدتثهـهو1-8])[)\].\-:\s]*$/u);
  if (prefixMatch) {
    return resolveCanonicalOptionId(prefixMatch[1], options);
  }

  const leadingTokenMatch = cleaned.match(/^(?:خيار|الخيار|option)?\s*[\(\[]?([A-Ha-hأابجدتثهـهو1-8])[\)\]]?(?:\s|$)/iu);
  if (leadingTokenMatch) {
    return resolveCanonicalOptionId(leadingTokenMatch[1], options);
  }

  // Fallback: match against option text content
  const normTarget = normalizeMedicalText(cleaned);
  if (normTarget) {
    const exactMatch = options.find(
      o => normalizeMedicalText(o.textArabic) === normTarget || normalizeMedicalText(o.textEnglish) === normTarget
    );
    if (exactMatch) return exactMatch.id;

    const partialMatch = options.find(o => {
      const normOpt = normalizeMedicalText(o.textArabic);
      return normOpt && (normOpt.includes(normTarget) || normTarget.includes(normOpt));
    });
    if (partialMatch) return partialMatch.id;
  }

  return '';
}

/**
 * Parses inline explanation / rationale embedded within an option line
 * Example: "الشريان التاجي الأيمن (التعليل: صحيح لأنه يغذي الجدار السفلي)"
 * Example: "المثيل دوبا - تعليل: غير صحيح لأنه دواء آمن في الحمل"
 */
export function extractOptionAndExplanation(rawText: string): {
  text: string;
  explanation?: string;
  isCorrect?: boolean;
} {
  let text = rawText.trim();
  let explanation: string | undefined = undefined;
  let isCorrect: boolean | undefined = undefined;

  // Check parenthesized or bracketed explanation: (التعليل: ...) or [التعليل: ...]
  const bracketExpMatch = text.match(/[\(\[]\s*(?:التعليل|تعليل|السبب|سبب|تفسير|Explanation|Rationale)\s*[:\-]?\s*([^\]\)]+)[\)\]]\s*$/iu);
  if (bracketExpMatch) {
    explanation = bracketExpMatch[1].trim();
    text = text.replace(bracketExpMatch[0], '').trim();
  }

  // Check dashed or pipe explanation: " - تعليل: ..." or " | التعليل: ..."
  if (!explanation) {
    const dashExpMatch = text.match(/\s+[\-|]\s*(?:التعليل|تعليل|السبب|تفسير|Explanation|Rationale)\s*[:\-]?\s*(.+)$/iu);
    if (dashExpMatch) {
      explanation = dashExpMatch[1].trim();
      text = text.slice(0, dashExpMatch.index).trim();
    }
  }

  // Check if explanation indicates correctness
  if (explanation) {
    if (/^(?:صحيح|صح|إجابة صحيحة|correct|true)/iu.test(explanation)) {
      isCorrect = true;
    } else if (/^(?:خطأ|خاطئ|غير صحيح|غلط|incorrect|false)/iu.test(explanation)) {
      isCorrect = false;
    }
  }

  return { text, explanation, isCorrect };
}

/**
 * Extracts Assessment Metadata from the top of the text/file if present:
 * Title, Assessment Type, Study Level, Batch, Subject/Block, Duration, Question Timer
 */
export function extractAssessmentMetadataFromText(rawText: string): {
  detectedMetadata: DetectedAssessmentMetadata;
  cleanedText: string;
} {
  const lines = rawText.split(/\r?\n/);
  const metadata: DetectedAssessmentMetadata = {};
  const remainingLines: string[] = [];
  let headerFinished = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Stop inspecting header once we hit an actual question start (e.g. "1. ", "س1:", "[سؤال مقالي]")
    const isQuestionStart = /^\s*(?:(?:س|سؤال|السؤال|Q|Question)\s*\d*\s*[.:\-)]|\d+\s*[.\-)]|\[(?:سؤال مقالي|صح وخطأ|مقالي)\])/iu.test(trimmed);
    if (isQuestionStart) {
      headerFinished = true;
    }

    if (headerFinished) {
      remainingLines.push(line);
      continue;
    }

    // Title: العنوان: ... or اسم الاختبار: ... or Title: ...
    const titleMatch = trimmed.match(/^(?:العنوان|عنوان الاختبار|عنوان التقييم|اسم الاختبار|اسم المسابقة|Title|Assessment\s*Title)\s*[:\-]\s*(.+)$/iu);
    if (titleMatch) {
      metadata.titleArabic = titleMatch[1].trim();
      continue;
    }

    // Assessment Type: النوع: ... or نوع التقييم: مسابقة / اختبار
    const typeMatch = trimmed.match(/^(?:النوع|نوع التقييم|نوع الاختبار|التصنيف|Type|Category)\s*[:\-]\s*(.+)$/iu);
    if (typeMatch) {
      const val = typeMatch[1].trim().toLowerCase();
      metadata.assessmentType = /مسابقة|تنافسي|competition|contest/i.test(val) ? 'competition' : 'exam';
      continue;
    }

    // Study Level: المستوى: المستوى الرابع / Level 4
    const levelMatch = trimmed.match(/^(?:المستوى|المستوى الدراسي|السنة الدراسية|Level|Study\s*Level)\s*[:\-]\s*(.+)$/iu);
    if (levelMatch) {
      const val = levelMatch[1].trim();
      metadata.studyLevelName = val;
      const numMatch = val.match(/(\d+)/);
      if (numMatch) {
        metadata.studyLevelId = `lvl-${numMatch[1]}`;
      } else if (/امتياز|internship/i.test(val)) {
        metadata.studyLevelId = 'lvl-internship';
      }
      continue;
    }

    // Batch: الدفعة: الدفعة السادسة / دفعة 28 / Batch 6
    const batchMatch = trimmed.match(/^(?:الدفعة|دفعة|اسم الدفعة|Batch)\s*[:\-]\s*(.+)$/iu);
    if (batchMatch) {
      metadata.batchName = batchMatch[1].trim();
      const bNum = batchMatch[1].match(/(\d+)/);
      if (bNum) metadata.batchNumber = bNum[1];
      continue;
    }

    // Subject / Block: المادة: باطنة / البلوك: CVS
    const courseMatch = trimmed.match(/^(?:المادة|البلوك|المقرر|الكورس|الموضوع|Subject|Block|Course)\s*[:\-]\s*(.+)$/iu);
    if (courseMatch) {
      metadata.courseName = courseMatch[1].trim();
      continue;
    }

    // Exam Duration: المدة: 30 دقيقة / Duration: 45 min
    const durationMatch = trimmed.match(/^(?:المدة|مدة الاختبار|وقت الاختبار|Duration|Time\s*Limit)\s*[:\-]\s*(\d+)\s*(?:دقيقة|دقائق|د|min|mins|minutes)?/iu);
    if (durationMatch) {
      metadata.durationMinutes = parseInt(durationMatch[1], 10);
      continue;
    }

    // Question Timer: مؤقت السؤال: 45 ثانية / Question Timer: 60s
    const qTimerMatch = trimmed.match(/^(?:مؤقت السؤال|مدة السؤال|مؤقت لكل سؤال|Question\s*Timer|Per\s*Question)\s*[:\-]\s*(\d+)\s*(?:ثانية|ثواني|ث|sec|secs|seconds)?/iu);
    if (qTimerMatch) {
      metadata.questionDurationSeconds = parseInt(qTimerMatch[1], 10);
      continue;
    }

    // If it's a completely blank line before questions, skip it
    if (!trimmed) {
      continue;
    }

    remainingLines.push(line);
  }

  return {
    detectedMetadata: metadata,
    cleanedText: remainingLines.join('\n').trim()
  };
}

/**
 * Validates a parsed question draft and populates its `issues`, `isValid`, and duplicate flags.
 * Dynamically supports MCQ (2 to 8 options), True/False (2 options), and Essay/Short Answer questions.
 */
export function validateAndAnnotateDrafts(
  drafts: Omit<
    ParsedQuestionDraft,
    'issues' | 'isValid' | 'isDuplicateInBatch' | 'isDuplicateInBank' | 'existingQuestionId' | 'contentHash' | 'deterministicId'
  >[],
  bankId: string,
  existingBankQuestions: QuestionItemFull[] = []
): ParsedQuestionDraft[] {
  // Build lookup of existing bank questions by normalized stem and full fingerprint
  const existingByHash = new Map<string, string>();
  const existingByStem = new Map<string, string>();

  for (const eq of existingBankQuestions) {
    const hash = eq.contentHash || computeQuestionFingerprint(eq.stemArabic, eq.stemEnglish, eq.options);
    existingByHash.set(hash, eq.id);
    const normStem = normalizeMedicalText(eq.stemArabic);
    if (normStem.length >= 6) {
      existingByStem.set(normStem, eq.id);
    }
  }

  const seenBatchHashes = new Map<string, number>();
  const seenBatchStems = new Map<string, number>();

  return drafts.map((draft, idx) => {
    const issues: QuestionValidationIssue[] = [];
    const stemAr = (draft.stemArabic || '').trim();
    const stemEn = (draft.stemEnglish || '').trim();
    const qType: QuestionType = draft.questionType || 'mcq';

    // 1. Validate Stem
    if (!stemAr || stemAr.length < 4) {
      issues.push({
        code: 'MISSING_STEM',
        severity: 'error',
        messageArabic: 'نص السؤال مفقود أو قصير جداً'
      });
    }

    let normalizedOptions: QuestionOption[] = [];
    let validCorrectId = '';

    if (qType === 'essay') {
      // Essay question validation: no options needed, but should have model answer or rubric
      normalizedOptions = [];
      validCorrectId = 'essay';
      if (!draft.modelAnswerArabic && !draft.explanationArabic) {
        issues.push({
          code: 'MISSING_MODEL_ANSWER',
          severity: 'warning',
          messageArabic: 'يفضل كتابة إجابة نموذجية أو معايير تصحيح للسؤال المقالي'
        });
      }
    } else if (qType === 'true_false') {
      // True / False question: exactly 2 options (صح / خطأ)
      normalizedOptions = [
        {
          id: 'opt-a',
          textArabic: draft.options[0]?.textArabic || 'صح (صواب)',
          textEnglish: draft.options[0]?.textEnglish || 'True',
          explanationArabic: draft.options[0]?.explanationArabic
        },
        {
          id: 'opt-b',
          textArabic: draft.options[1]?.textArabic || 'خطأ',
          textEnglish: draft.options[1]?.textEnglish || 'False',
          explanationArabic: draft.options[1]?.explanationArabic
        }
      ];

      validCorrectId = draft.correctOptionId === 'opt-b' ? 'opt-b' : 'opt-a';
      if (!draft.correctOptionId) {
        issues.push({
          code: 'MISSING_CORRECT_ANSWER',
          severity: 'error',
          messageArabic: 'لم يتم تحديد ما إذا كانت العبارة صحيحة أم خاطئة'
        });
      }
    } else {
      // Multiple Choice Question (MCQ): dynamic options count (2, 3, 4, 5, 6, etc.)
      const rawNonEmpty = draft.options.filter(
        o => o && o.textArabic && o.textArabic.trim().length > 0 && o.textArabic !== 'غير محدد'
      );

      // Preserve all provided options dynamically, mapping to canonical IDs
      normalizedOptions = rawNonEmpty.map((opt, optIdx) => ({
        id: opt.id || getOptionIdByIndex(optIdx),
        textArabic: opt.textArabic.trim(),
        ...(opt.textEnglish ? { textEnglish: opt.textEnglish.trim() } : {}),
        ...(opt.explanationArabic ? { explanationArabic: opt.explanationArabic.trim() } : {}),
        ...(opt.isCorrect !== undefined ? { isCorrect: opt.isCorrect } : {})
      }));

      // If user had less than 2 options
      if (normalizedOptions.length < 2) {
        issues.push({
          code: 'INSUFFICIENT_OPTIONS',
          severity: 'error',
          messageArabic: 'يجب توفير خيارين على الأقل للسؤال (مثال: أ، ب)'
        });
      }

      // Check identical options within the same question
      const optionNormSet = new Set<string>();
      let hasIdenticalOpts = false;
      for (const o of normalizedOptions) {
        const n = normalizeMedicalText(o.textArabic);
        if (n && optionNormSet.has(n)) {
          hasIdenticalOpts = true;
          break;
        }
        if (n) optionNormSet.add(n);
      }
      if (hasIdenticalOpts) {
        issues.push({
          code: 'IDENTICAL_OPTIONS',
          severity: 'error',
          messageArabic: 'يوجد خياران متطابقان في النص داخل نفس السؤال'
        });
      }

      // Check Correct Answer
      const matchedOpt = normalizedOptions.find(o => o.id === draft.correctOptionId);
      if (matchedOpt) {
        validCorrectId = matchedOpt.id;
      } else {
        issues.push({
          code: 'MISSING_CORRECT_ANSWER',
          severity: 'error',
          messageArabic: `لم يتم تحديد الإجابة الصحيحة من بين الخيارات المتاحة (${normalizedOptions.length} خيارات)`
        });
      }
    }

    const contentHash = computeQuestionFingerprint(stemAr, stemEn, normalizedOptions);
    const normStem = normalizeMedicalText(stemAr);

    // Duplicate Detection (Batch & Existing Bank)
    let isDuplicateInBatch = false;
    let isDuplicateInBank = false;
    let existingQuestionId: string | undefined = undefined;

    if (stemAr.length >= 4) {
      if (seenBatchHashes.has(contentHash) || (normStem.length >= 8 && seenBatchStems.has(normStem))) {
        isDuplicateInBatch = true;
        const firstIdx = seenBatchHashes.get(contentHash) ?? seenBatchStems.get(normStem) ?? 0;
        issues.push({
          code: 'DUPLICATE_IN_BATCH',
          severity: 'warning',
          messageArabic: `مكرر داخل هذه الدفعة (يطابق السؤال رقم ${firstIdx + 1})`
        });
      } else {
        seenBatchHashes.set(contentHash, idx);
        if (normStem.length >= 8) {
          seenBatchStems.set(normStem, idx);
        }
      }

      const bankMatchId = existingByHash.get(contentHash) || (normStem.length >= 8 ? existingByStem.get(normStem) : undefined);
      if (bankMatchId) {
        isDuplicateInBank = true;
        existingQuestionId = bankMatchId;
        issues.push({
          code: 'DUPLICATE_IN_BANK',
          severity: 'warning',
          messageArabic: 'موجود مسبقاً في بنك الأسئلة الحالي (سيتم تحديثه دون تكرار عند الحفظ)'
        });
      }
    }

    const hasBlockingError = issues.some(i => i.severity === 'error');
    const deterministicId = existingQuestionId || `q-${bankId}-${contentHash.slice(0, 12)}`;

    return {
      ...draft,
      questionType: qType,
      stemArabic: stemAr,
      stemEnglish: stemEn || undefined,
      options: normalizedOptions,
      correctOptionId: validCorrectId,
      points: Number(draft.points) > 0 ? Number(draft.points) : 5,
      contentHash,
      deterministicId,
      issues,
      isValid: !hasBlockingError,
      isDuplicateInBatch,
      isDuplicateInBank,
      existingQuestionId,
      selectedForImport: draft.selectedForImport !== undefined
        ? draft.selectedForImport && !hasBlockingError
        : !hasBlockingError && !isDuplicateInBatch
    };
  });
}

// ---------------------------------------------------------------------------
// 1. Structured / Free-Form Text Parser (Aiken, Numbered Blocks, Answer Keys, True/False, Essay)
// ---------------------------------------------------------------------------

interface RawOptionCandidate {
  marker: string;
  text: string;
  isMarkedCorrect: boolean;
  explanation?: string;
}

function parseInlineCorrectMarker(line: string): { cleanedText: string; isCorrect: boolean } {
  let text = line.trim();
  let isCorrect = false;

  const correctPatterns = [
    /\s*[\(\[]\s*(?:صحيح|الإجابة الصحيحة|اجابة صحيحة|صح|correct|right|true)\s*[\)\]]\s*$/iu,
    /\s*(?:✓|✔|☑|✅)\s*$/u,
    /^\s*(?:✓|✔|☑|✅|\*+)\s+/u,
    /\s*\*+\s*$/u
  ];

  for (const pat of correctPatterns) {
    if (pat.test(text)) {
      isCorrect = true;
      text = text.replace(pat, '').trim();
    }
  }

  return { cleanedText: text, isCorrect };
}

/**
 * Extracts bottom answer key maps like:
 * "الإجابات: 1-أ ، 2-ب ، 3-ج" or "Answer Key:\n1. B\n2. A"
 */
function extractTrailingAnswerKeyMap(rawText: string): {
  cleanedBody: string;
  answerKeyByNumber: Map<number, string>;
} {
  const answerKeyByNumber = new Map<number, string>();
  const keySectionRegex = /\n\s*(?:مفتاح الإجابات|مفتاح الاجابات|الإجابات الصحيحة|الاجابات|Answer\s*Key|Answers)\s*[:\-]?\s*\n([\s\S]+)$/iu;
  const match = rawText.match(keySectionRegex);
  if (!match) {
    return { cleanedBody: rawText, answerKeyByNumber };
  }

  const keyBlock = match[1];
  const pairRegex = /(\d+)\s*[\-.:)\s]\s*([A-Ha-hأابجدتثهـهو1-8]|صح|خطأ|true|false)/giu;
  let pairMatch: RegExpExecArray | null;
  let count = 0;
  while ((pairMatch = pairRegex.exec(keyBlock)) !== null) {
    const qNum = parseInt(pairMatch[1], 10);
    const ansToken = pairMatch[2];
    if (qNum > 0 && ansToken) {
      answerKeyByNumber.set(qNum, ansToken);
      count++;
    }
  }

  if (count === 0) {
    return { cleanedBody: rawText, answerKeyByNumber };
  }

  const cleanedBody = rawText.slice(0, match.index).trim();
  return { cleanedBody, answerKeyByNumber };
}

export function parseStructuredTextMCQs(
  rawText: string,
  defaultPoints: number = 5
): Omit<
  ParsedQuestionDraft,
  'issues' | 'isValid' | 'isDuplicateInBatch' | 'isDuplicateInBank' | 'existingQuestionId' | 'contentHash' | 'deterministicId'
>[] {
  const normalizedNewlines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalizedNewlines) return [];

  // Extract metadata header first so it doesn't pollute questions
  const { cleanedText: textWithoutHeader } = extractAssessmentMetadataFromText(normalizedNewlines);
  const { cleanedBody, answerKeyByNumber } = extractTrailingAnswerKeyMap(textWithoutHeader);

  // Split into question blocks:
  // Either separated by blank lines, OR starting with a question header
  const lines = cleanedBody.split('\n');
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  let currentBlockHasOptions = 0;
  let currentBlockHasAnswerLine = false;
  let currentBlockHasModelAnswer = false;

  const questionStartRegex = /^\s*(?:(?:س|سؤال|السؤال|Q|Question)\s*\d*\s*[.:\-)]|\d+\s*[.\-)]|\[(?:سؤال مقالي|صح وخطأ|مقالي)\])\s+\S+/iu;
  const optionLineTestRegex = /^\s*[([]?([A-Ha-hأابجدتثهـهو])[)\].\-:]\s+\S+/u;
  const answerLineTestRegex = /^\s*(?:الإجابة الصحيحة|الاجابة الصحيحة|الإجابة|الاجابة|الجواب الصحيح|الجواب|الحل|Answer|Correct\s*Answer|Correct|ANS)\s*[:\-=]\s*\S+/iu;
  const modelAnswerLineTestRegex = /^\s*(?:الإجابة النموذجية|الاجابة النموذجية|إجابة نموذجية|اجابة نموذجية|نموذج الإجابة|Model\s*Answer|Rubric)\s*[:\-=]\s*\S+/iu;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (currentBlock.length > 0 && (currentBlockHasOptions >= 1 || currentBlockHasAnswerLine || currentBlockHasModelAnswer || currentBlock.length >= 2)) {
        blocks.push(currentBlock);
        currentBlock = [];
        currentBlockHasOptions = 0;
        currentBlockHasAnswerLine = false;
        currentBlockHasModelAnswer = false;
      }
      continue;
    }

    // Check if this line starts a brand new numbered question while the previous block has content
    if (
      questionStartRegex.test(trimmed) &&
      !optionLineTestRegex.test(trimmed) &&
      currentBlock.length > 0 &&
      (currentBlockHasOptions >= 1 || currentBlockHasAnswerLine || currentBlockHasModelAnswer || currentBlock.length >= 2)
    ) {
      blocks.push(currentBlock);
      currentBlock = [trimmed];
      currentBlockHasOptions = 0;
      currentBlockHasAnswerLine = false;
      currentBlockHasModelAnswer = false;
      continue;
    }

    if (optionLineTestRegex.test(trimmed)) {
      currentBlockHasOptions++;
    } else if (modelAnswerLineTestRegex.test(trimmed)) {
      currentBlockHasModelAnswer = true;
    } else if (answerLineTestRegex.test(trimmed)) {
      currentBlockHasAnswerLine = true;
    }

    currentBlock.push(trimmed);
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks.map((blockLines, idx) => {
    const stemArabicLines: string[] = [];
    const stemEnglishLines: string[] = [];
    const rawOptions: RawOptionCandidate[] = [];
    let explicitAnswerToken = '';
    let explanationLines: string[] = [];
    let modelAnswerLines: string[] = [];
    let points = defaultPoints;
    let detectedQuestionNumber: number | null = null;
    let explicitQuestionType: QuestionType | undefined = undefined;

    const optionRegex = /^\s*(?:([✓✔☑✅*]+)\s*)?[([]?([A-Ha-hأابجدتثهـهو1-8])[)\].\-:]\s*(.+)$/u;
    const inlineMultiOptionRegex = /(?:^|\s+)[([]?([A-Ha-hأابجدتثهـهو])[)\].\-:]\s*([^([\n]+?)(?=\s+[([]?[A-Ha-hأابجدتثهـهو][)\].\-:]|$)/gu;
    const answerRegex = /^\s*(?:الإجابة الصحيحة|الاجابة الصحيحة|الإجابة|الاجابة|الجواب الصحيح|الجواب|الحل|Answer|Correct\s*Answer|Correct|ANS)\s*[:\-=]?\s*(.+)$/iu;
    const modelAnswerRegex = /^\s*(?:الإجابة النموذجية|الاجابة النموذجية|الجواب النموذجي|معايير التصحيح|سلم التصحيح|Model\s*Answer|Rubric)\s*[:\-=]?\s*(.+)$/iu;
    const explanationRegex = /^\s*(?:التعليل الطبي|التعليل العام|التعليل|الشرح|التفسير|توضيح|السبب|Explanation|Rationale|Reason)\s*[:\-=]\s*(.+)$/iu;
    const pointsRegex = /^\s*(?:الدرجة|النقاط|درجة السؤال|Points|Score|Marks)\s*[:\-=]\s*(\d+(?:\.\d+)?)/iu;
    const typeIndicatorRegex = /^\s*(?:نوع السؤال|النوع|Question\s*Type)\s*[:\-=]\s*(.+)$/iu;

    let inExplanation = false;
    let inModelAnswer = false;

    for (let i = 0; i < blockLines.length; i++) {
      let line = blockLines[i];

      // Check points line
      const ptsMatch = line.match(pointsRegex);
      if (ptsMatch) {
        points = Number(ptsMatch[1]) || defaultPoints;
        continue;
      }

      // Check explicit question type line
      const typeMatch = line.match(typeIndicatorRegex);
      if (typeMatch) {
        const val = typeMatch[1].toLowerCase();
        if (/مقالي|essay|short/i.test(val)) explicitQuestionType = 'essay';
        else if (/صح|خطأ|true|false/i.test(val)) explicitQuestionType = 'true_false';
        else explicitQuestionType = 'mcq';
        continue;
      }

      // Check Model Answer line (for essay questions)
      const modelMatch = line.match(modelAnswerRegex);
      if (modelMatch) {
        inModelAnswer = true;
        inExplanation = false;
        explicitQuestionType = 'essay';
        modelAnswerLines.push(modelMatch[1].trim());
        continue;
      }

      // Check explanation line
      const expMatch = line.match(explanationRegex);
      if (expMatch) {
        inExplanation = true;
        inModelAnswer = false;
        explanationLines.push(expMatch[1].trim());
        continue;
      }

      // Check explicit answer line
      const ansMatch = line.match(answerRegex);
      if (ansMatch) {
        inExplanation = false;
        inModelAnswer = false;
        const rawAns = ansMatch[1].trim();
        // Check if inline explanation is appended on the same line after " - التعليل: ..."
        const inlineExpSplit = rawAns.split(/\s+(?:[\-|]|التعليل|الشرح|Explanation)\s*[:\-]?\s*/iu);
        explicitAnswerToken = inlineExpSplit[0].trim();
        if (inlineExpSplit.length > 1 && inlineExpSplit.slice(1).join(' ').trim()) {
          explanationLines.push(inlineExpSplit.slice(1).join(' ').trim());
        }
        continue;
      }

      // Check sub-option explanation line: e.g. "تعليل أ: صحيح لأنه..." or "تعليل الخيار أ: ..."
      const optionSpecificExpMatch = line.match(/^\s*(?:تعليل|التعليل الخاص بـ|تفسير)\s*(?:الخيار\s*)?([A-Ha-hأابجدتثهـهو1-8])\s*[:\-]\s*(.+)$/iu);
      if (optionSpecificExpMatch) {
        const targetMarker = optionSpecificExpMatch[1].trim();
        const expBody = optionSpecificExpMatch[2].trim();
        const matchedCandidate = rawOptions.find(o => o.marker.toLowerCase() === targetMarker.toLowerCase());
        if (matchedCandidate) {
          matchedCandidate.explanation = expBody;
        }
        continue;
      }

      // Check if multiple options are on a single line (e.g. "أ) خيار 1   ب) خيار 2   ج) خيار 3")
      const inlineMatches = Array.from(line.matchAll(inlineMultiOptionRegex));
      if (inlineMatches.length >= 2) {
        inExplanation = false;
        inModelAnswer = false;
        for (const m of inlineMatches) {
          const marker = m[1];
          const { cleanedText, isCorrect } = parseInlineCorrectMarker(m[2]);
          const { text: optText, explanation: optExp, isCorrect: expIsCorrect } = extractOptionAndExplanation(cleanedText);
          rawOptions.push({
            marker,
            text: optText,
            isMarkedCorrect: isCorrect || Boolean(expIsCorrect),
            explanation: optExp
          });
        }
        continue;
      }

      // Check single option line
      const optMatch = line.match(optionRegex);
      if (optMatch) {
        const leadingCheck = Boolean(optMatch[1]);
        const markerChar = optMatch[2];
        const isNumericMarker = /^[1-8]$/.test(markerChar);

        if (!isNumericMarker || stemArabicLines.length > 0 || stemEnglishLines.length > 0) {
          inExplanation = false;
          inModelAnswer = false;
          const { cleanedText, isCorrect } = parseInlineCorrectMarker(optMatch[3]);
          const { text: optText, explanation: optExp, isCorrect: expIsCorrect } = extractOptionAndExplanation(cleanedText);
          rawOptions.push({
            marker: markerChar,
            text: optText,
            isMarkedCorrect: leadingCheck || isCorrect || Boolean(expIsCorrect),
            explanation: optExp
          });
          continue;
        }
      }

      if (inModelAnswer) {
        modelAnswerLines.push(line);
        continue;
      }

      if (inExplanation) {
        explanationLines.push(line);
        continue;
      }

      // Otherwise it is part of the question stem
      if (stemArabicLines.length === 0 && stemEnglishLines.length === 0) {
        // Detect question type tag in stem (e.g. "[صح وخطأ]", "[سؤال مقالي]")
        if (/\[\s*(?:صح\s*و\s*خطأ|صواب\s*\/\s*خطأ|true\s*\/\s*false)\s*\]/iu.test(line)) {
          explicitQuestionType = 'true_false';
          line = line.replace(/\[\s*(?:صح\s*و\s*خطأ|صواب\s*\/\s*خطأ|true\s*\/\s*false)\s*\]/iu, '').trim();
        } else if (/\[\s*(?:سؤال\s*مقالي|مقالي|essay|short\s*answer)\s*\]/iu.test(line)) {
          explicitQuestionType = 'essay';
          line = line.replace(/\[\s*(?:سؤال\s*مقالي|مقالي|essay|short\s*answer)\s*\]/iu, '').trim();
        }

        // Strip leading question number (e.g. "1. ", "س1: ", "Q1) ")
        const qNumMatch = line.match(/^\s*(?:(?:س|سؤال|السؤال|Q|Question)\s*(\d+)\s*[.:\-)]?|(\d+)\s*[.\-)])\s*(.+)$/iu);
        if (qNumMatch) {
          const numStr = qNumMatch[1] || qNumMatch[2];
          if (numStr) detectedQuestionNumber = parseInt(numStr, 10);
          line = qNumMatch[3].trim();
        }
        // Extract inline points like "(5 نقاط)" or "[5 pts]" at the end of the stem
        const inlinePts = line.match(/\s*[\(\[]\s*(\d+)\s*(?:نقاط|نقطة|درجات|درجة|pts|points|marks)\s*[\)\]]\s*$/iu);
        if (inlinePts) {
          points = Number(inlinePts[1]) || defaultPoints;
          line = line.replace(inlinePts[0], '').trim();
        }
      }

      // Detect if line is purely English vs Arabic/bilingual
      const hasArabicChars = /[\u0600-\u06FF]/.test(line);
      if (!hasArabicChars && stemArabicLines.length > 0) {
        stemEnglishLines.push(line);
      } else {
        stemArabicLines.push(line);
      }
    }

    const stemArabic = stemArabicLines.join(' ').trim() || stemEnglishLines.join(' ').trim();
    const stemEnglish = stemArabicLines.length > 0 && stemEnglishLines.length > 0
      ? stemEnglishLines.join(' ').trim()
      : undefined;

    // Determine Final Question Type
    let questionType: QuestionType = explicitQuestionType || 'mcq';
    if (!explicitQuestionType) {
      if (modelAnswerLines.length > 0 && rawOptions.length === 0) {
        questionType = 'essay';
      } else if (
        rawOptions.length === 2 &&
        /صح|صواب|true/i.test(rawOptions[0]?.text) &&
        /خطأ|خاطئ|false/i.test(rawOptions[1]?.text)
      ) {
        questionType = 'true_false';
      } else if (rawOptions.length === 0 && /^(?:صح|صواب|خطأ|true|false)$/i.test(explicitAnswerToken)) {
        questionType = 'true_false';
      }
    }

    // Build Options dynamically based on Question Type
    let options: QuestionOption[] = [];
    let correctOptionId = '';

    if (questionType === 'essay') {
      options = [];
      correctOptionId = 'essay';
    } else if (questionType === 'true_false') {
      const optAExp = rawOptions.find(o => /^(opt-a|a|أ|1)/i.test(o.marker) || /صح/i.test(o.text))?.explanation;
      const optBExp = rawOptions.find(o => /^(opt-b|b|ب|2)/i.test(o.marker) || /خطأ/i.test(o.text))?.explanation;

      options = [
        { id: 'opt-a', textArabic: 'صح (صواب)', textEnglish: 'True', ...(optAExp ? { explanationArabic: optAExp } : {}) },
        { id: 'opt-b', textArabic: 'خطأ', textEnglish: 'False', ...(optBExp ? { explanationArabic: optBExp } : {}) }
      ];

      if (explicitAnswerToken) {
        correctOptionId = resolveCanonicalOptionId(explicitAnswerToken, options);
      } else {
        const markedTrue = rawOptions.find(o => o.isMarkedCorrect && /صح|صواب/i.test(o.text));
        const markedFalse = rawOptions.find(o => o.isMarkedCorrect && /خطأ/i.test(o.text));
        if (markedFalse) correctOptionId = 'opt-b';
        else if (markedTrue) correctOptionId = 'opt-a';
      }
    } else {
      // Multiple Choice Question (MCQ): Dynamic options (2, 3, 4, 5, 6, etc.)
      const totalRaw = rawOptions.length;
      const count = totalRaw >= 2 ? totalRaw : 4;

      options = Array.from({ length: count }).map((_, optIdx) => {
        const candidate = rawOptions[optIdx];
        const optId = getOptionIdByIndex(optIdx);
        return {
          id: optId,
          textArabic: candidate ? candidate.text : '',
          ...(candidate?.explanation ? { explanationArabic: candidate.explanation } : {}),
          ...(candidate?.isMarkedCorrect !== undefined ? { isCorrect: candidate.isMarkedCorrect } : {})
        };
      });

      const inlineMarkedIdx = rawOptions.findIndex(o => o.isMarkedCorrect);
      if (inlineMarkedIdx >= 0 && inlineMarkedIdx < options.length) {
        correctOptionId = options[inlineMarkedIdx].id;
      }
      if (!correctOptionId && explicitAnswerToken) {
        correctOptionId = resolveCanonicalOptionId(explicitAnswerToken, options);
      }
    }

    if (!correctOptionId && detectedQuestionNumber && answerKeyByNumber.has(detectedQuestionNumber)) {
      correctOptionId = resolveCanonicalOptionId(answerKeyByNumber.get(detectedQuestionNumber)!, options);
    }
    if (!correctOptionId && answerKeyByNumber.has(idx + 1)) {
      correctOptionId = resolveCanonicalOptionId(answerKeyByNumber.get(idx + 1)!, options);
    }

    return {
      tempId: `draft-${idx}-${Date.now()}`,
      sourceIndex: idx + 1,
      questionType,
      stemArabic,
      stemEnglish,
      options,
      correctOptionId,
      modelAnswerArabic: modelAnswerLines.join('\n').trim() || undefined,
      explanationArabic: explanationLines.join(' ').trim() || undefined,
      points,
      selectedForImport: true
    };
  });
}

// ---------------------------------------------------------------------------
// 2. CSV / TSV Spreadsheet Parser (RFC-4180 compliant, dynamic options & explanations)
// ---------------------------------------------------------------------------

function parseDelimitedRows(raw: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else if (ch === '\r') {
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some(cell => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

export function parseCsvMCQs(
  rawCsv: string,
  defaultPoints: number = 5
): Omit<
  ParsedQuestionDraft,
  'issues' | 'isValid' | 'isDuplicateInBatch' | 'isDuplicateInBank' | 'existingQuestionId' | 'contentHash' | 'deterministicId'
>[] {
  const cleaned = rawCsv.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  const firstLine = cleaned.split(/\r?\n/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : semicolonCount > commaCount ? ';' : ',';

  const rows = parseDelimitedRows(cleaned, delimiter);
  if (rows.length === 0) return [];

  const headerCandidate = rows[0].map(h => h.toLowerCase().trim());
  const isHeaderRow = headerCandidate.some(h =>
    /^(question|stem|stemarabic|سؤال|السؤال|نص السؤال|opt|option|خيار|answer|correct|الإجابة|الاجابة)$/i.test(h)
  );

  const dataRows = isHeaderRow ? rows.slice(1) : rows;
  if (dataRows.length === 0) return [];

  const findCol = (patterns: RegExp[], fallbackIdx: number): number => {
    if (!isHeaderRow) return fallbackIdx;
    const foundIdx = headerCandidate.findIndex(h => patterns.some(p => p.test(h)));
    return foundIdx >= 0 ? foundIdx : fallbackIdx;
  };

  const colStemAr = findCol([/^(question|stem|stem_ar|stemarabic|سؤال|السؤال|نص السؤال)$/i], 0);
  const colStemEn = isHeaderRow
    ? headerCandidate.findIndex(h => /^(stem_en|stemenglish|english|النص الإنجليزي|انجليزي)$/i.test(h))
    : -1;
  const colType = findCol([/^(type|question_type|نوع السؤال|النوع)$/i], -1);
  const colOptA = findCol([/^(a|opt_a|opta|option_a|option a|أ|ا|خيار أ|الخيار أ|1)$/i], 1);
  const colOptB = findCol([/^(b|opt_b|optb|option_b|option b|ب|خيار ب|الخيار ب|2)$/i], 2);
  const colOptC = findCol([/^(c|opt_c|optc|option_c|option c|ج|خيار ج|الخيار ج|3)$/i], 3);
  const colOptD = findCol([/^(d|opt_d|optd|option_d|option d|د|خيار د|الخيار د|4)$/i], 4);
  const colOptE = findCol([/^(e|opt_e|opte|option_e|option e|هـ|ه|خيار هـ|الخيار هـ|5)$/i], -1);

  const colExpA = findCol([/^(exp_a|تعليل أ|التعليل أ|تعليل الخيار أ)$/i], -1);
  const colExpB = findCol([/^(exp_b|تعليل ب|التعليل ب|تعليل الخيار ب)$/i], -1);
  const colExpC = findCol([/^(exp_c|تعليل ج|التعليل ج|تعليل الخيار ج)$/i], -1);
  const colExpD = findCol([/^(exp_d|تعليل د|التعليل د|تعليل الخيار د)$/i], -1);
  const colExpE = findCol([/^(exp_e|تعليل هـ|التعليل هـ|تعليل الخيار هـ)$/i], -1);

  const colAns = findCol([/^(answer|correct|correctoptionid|correct_answer|الإجابة|الاجابة|الإجابة الصحيحة|الجواب|الحل)$/i], 5);
  const colModelAns = findCol([/^(model_answer|rubric|الإجابة النموذجية|الجواب النموذجي|سلم التصحيح)$/i], -1);
  const colExp = findCol([/^(explanation|explanationarabic|rationale|التعليل|التعليل العام|الشرح|التفسير)$/i], 6);
  const colPts = findCol([/^(points|score|marks|النقاط|الدرجة)$/i], 7);

  return dataRows.map((row, idx) => {
    const stemArabic = (row[colStemAr] || '').trim();
    const stemEnglish = colStemEn >= 0 ? (row[colStemEn] || '').trim() : undefined;
    const rawTypeVal = colType >= 0 ? (row[colType] || '').trim().toLowerCase() : '';

    let questionType: QuestionType = 'mcq';
    if (/مقالي|essay/i.test(rawTypeVal)) questionType = 'essay';
    else if (/صح|خطأ|true|false/i.test(rawTypeVal)) questionType = 'true_false';

    const rawA = parseInlineCorrectMarker(row[colOptA] || '');
    const rawB = parseInlineCorrectMarker(row[colOptB] || '');
    const rawC = colOptC >= 0 ? parseInlineCorrectMarker(row[colOptC] || '') : { cleanedText: '', isCorrect: false };
    const rawD = colOptD >= 0 ? parseInlineCorrectMarker(row[colOptD] || '') : { cleanedText: '', isCorrect: false };
    const rawE = colOptE >= 0 ? parseInlineCorrectMarker(row[colOptE] || '') : { cleanedText: '', isCorrect: false };

    let options: QuestionOption[] = [];
    let correctOptionId = '';

    if (questionType === 'essay') {
      options = [];
      correctOptionId = 'essay';
    } else if (questionType === 'true_false') {
      options = [
        { id: 'opt-a', textArabic: rawA.cleanedText || 'صح (صواب)', textEnglish: 'True' },
        { id: 'opt-b', textArabic: rawB.cleanedText || 'خطأ', textEnglish: 'False' }
      ];
      if (rawA.isCorrect) correctOptionId = 'opt-a';
      else if (rawB.isCorrect) correctOptionId = 'opt-b';
      else if (row[colAns]) correctOptionId = resolveCanonicalOptionId(row[colAns], options);
    } else {
      const optionList: { id: string; text: string; exp?: string; isCorrect: boolean }[] = [
        { id: 'opt-a', text: rawA.cleanedText, exp: colExpA >= 0 ? row[colExpA] : undefined, isCorrect: rawA.isCorrect },
        { id: 'opt-b', text: rawB.cleanedText, exp: colExpB >= 0 ? row[colExpB] : undefined, isCorrect: rawB.isCorrect }
      ];
      if (rawC.cleanedText) {
        optionList.push({ id: 'opt-c', text: rawC.cleanedText, exp: colExpC >= 0 ? row[colExpC] : undefined, isCorrect: rawC.isCorrect });
      }
      if (rawD.cleanedText) {
        optionList.push({ id: 'opt-d', text: rawD.cleanedText, exp: colExpD >= 0 ? row[colExpD] : undefined, isCorrect: rawD.isCorrect });
      }
      if (rawE.cleanedText) {
        optionList.push({ id: 'opt-e', text: rawE.cleanedText, exp: colExpE >= 0 ? row[colExpE] : undefined, isCorrect: rawE.isCorrect });
      }

      options = optionList.map(o => ({
        id: o.id,
        textArabic: o.text,
        ...(o.exp ? { explanationArabic: o.exp.trim() } : {})
      }));

      const marked = optionList.find(o => o.isCorrect);
      if (marked) correctOptionId = marked.id;
      else if (row[colAns]) correctOptionId = resolveCanonicalOptionId(row[colAns], options);
    }

    const explanationArabic = (row[colExp] || '').trim() || undefined;
    const modelAnswerArabic = colModelAns >= 0 ? (row[colModelAns] || '').trim() || undefined : undefined;
    const ptsVal = Number(row[colPts]);
    const points = !Number.isNaN(ptsVal) && ptsVal > 0 ? ptsVal : defaultPoints;

    return {
      tempId: `csv-draft-${idx}-${Date.now()}`,
      sourceIndex: idx + 1,
      questionType,
      stemArabic,
      stemEnglish: stemEnglish || undefined,
      options,
      correctOptionId,
      modelAnswerArabic,
      explanationArabic,
      points,
      selectedForImport: true
    };
  });
}

// ---------------------------------------------------------------------------
// 3. JSON Parser (Dynamic options count, True/False, Essay, Rationale)
// ---------------------------------------------------------------------------

export function parseJsonMCQs(
  rawJson: string,
  defaultPoints: number = 5
): Omit<
  ParsedQuestionDraft,
  'issues' | 'isValid' | 'isDuplicateInBatch' | 'isDuplicateInBank' | 'existingQuestionId' | 'contentHash' | 'deterministicId'
>[] {
  const parsed = JSON.parse(rawJson);
  const items: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.questions)
    ? parsed.questions
    : Array.isArray(parsed?.items)
    ? parsed.items
    : [];

  return items.map((item, idx) => {
    const stemArabic = String(
      item.stemArabic || item.questionArabic || item.question || item.stem || item['السؤال'] || ''
    ).trim();
    const stemEnglish = String(item.stemEnglish || item.questionEnglish || '').trim() || undefined;

    const rawType = String(item.questionType || item.type || item['نوع السؤال'] || '').toLowerCase();
    let questionType: QuestionType = 'mcq';
    if (/مقالي|essay/i.test(rawType)) questionType = 'essay';
    else if (/صح|خطأ|true|false/i.test(rawType)) questionType = 'true_false';

    let options: QuestionOption[] = [];
    if (questionType === 'essay') {
      options = [];
    } else if (Array.isArray(item.options)) {
      options = item.options.map((rawOpt: any, optIdx: number) => {
        const optId = String(rawOpt?.id || getOptionIdByIndex(optIdx));
        if (typeof rawOpt === 'string') {
          return { id: optId, textArabic: rawOpt.trim() };
        }
        return {
          id: optId,
          textArabic: String(rawOpt?.textArabic || rawOpt?.text || rawOpt?.label || '').trim(),
          ...(rawOpt?.textEnglish ? { textEnglish: String(rawOpt.textEnglish).trim() } : {}),
          ...(rawOpt?.explanationArabic || rawOpt?.explanation
            ? { explanationArabic: String(rawOpt.explanationArabic || rawOpt.explanation).trim() }
            : {}),
          ...(rawOpt?.isCorrect !== undefined ? { isCorrect: Boolean(rawOpt.isCorrect) } : {})
        };
      });
    } else {
      const explicitOpts: QuestionOption[] = [];
      const optKeys = [
        { key: ['optA', 'a', 'A', 'أ'], id: 'opt-a' },
        { key: ['optB', 'b', 'B', 'ب'], id: 'opt-b' },
        { key: ['optC', 'c', 'C', 'ج'], id: 'opt-c' },
        { key: ['optD', 'd', 'D', 'د'], id: 'opt-d' },
        { key: ['optE', 'e', 'E', 'هـ', 'ه'], id: 'opt-e' }
      ];

      for (const ok of optKeys) {
        const val = ok.key.map(k => item[k]).find(v => v !== undefined && String(v).trim().length > 0);
        if (val !== undefined) {
          explicitOpts.push({ id: ok.id, textArabic: String(val).trim() });
        }
      }
      options = explicitOpts;
    }

    const rawAnswer = String(
      item.correctOptionId || item.correctAnswer || item.answer || item.correct || item['الإجابة'] || ''
    ).trim();

    let correctOptionId = '';
    if (questionType === 'essay') {
      correctOptionId = 'essay';
    } else {
      correctOptionId = resolveCanonicalOptionId(rawAnswer, options);
      if (!correctOptionId) {
        const foundCorrect = options.find(o => o.isCorrect);
        if (foundCorrect) correctOptionId = foundCorrect.id;
      }
    }

    const modelAnswerArabic = String(
      item.modelAnswerArabic || item.modelAnswer || item['الإجابة النموذجية'] || ''
    ).trim() || undefined;

    const explanationArabic = String(
      item.explanationArabic || item.explanation || item.rationale || item['التعليل'] || ''
    ).trim() || undefined;

    const points = Number(item.points || item.score || item['النقاط']) || defaultPoints;

    return {
      tempId: `json-draft-${idx}-${Date.now()}`,
      sourceIndex: idx + 1,
      questionType,
      stemArabic,
      stemEnglish,
      options,
      correctOptionId,
      modelAnswerArabic,
      explanationArabic,
      points,
      selectedForImport: true
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Unified Auto-Detect Entry Point
// ---------------------------------------------------------------------------

export function parseBulkQuestionsInput(params: {
  rawInput: string;
  formatHint?: 'auto' | 'text' | 'csv' | 'json';
  fileName?: string;
  bankId: string;
  defaultPoints?: number;
  existingBankQuestions?: QuestionItemFull[];
}): {
  detectedFormat: 'text' | 'csv' | 'json';
  drafts: ParsedQuestionDraft[];
  detectedMetadata: DetectedAssessmentMetadata;
} {
  const {
    rawInput,
    formatHint = 'auto',
    fileName = '',
    bankId,
    defaultPoints = 5,
    existingBankQuestions = []
  } = params;

  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return { detectedFormat: 'text', drafts: [], detectedMetadata: {} };
  }

  // Extract Metadata Header (Title, Type, Level, Batch, Duration)
  const { detectedMetadata, cleanedText } = extractAssessmentMetadataFromText(trimmed);

  const lowerFile = fileName.toLowerCase();
  let detectedFormat: 'text' | 'csv' | 'json' = 'text';

  if (formatHint !== 'auto') {
    detectedFormat = formatHint;
  } else if (lowerFile.endsWith('.json') || ((cleanedText.startsWith('[') || cleanedText.startsWith('{')) && (cleanedText.endsWith(']') || cleanedText.endsWith('}')))) {
    detectedFormat = 'json';
  } else if (lowerFile.endsWith('.csv') || lowerFile.endsWith('.tsv')) {
    detectedFormat = 'csv';
  } else {
    // Check if first line looks like a CSV header with >= 3 commas/tabs
    const firstLine = cleanedText.split(/\r?\n/)[0] || '';
    const commaOrTabCount = (firstLine.match(/[,\t;]/g) || []).length;
    const hasOptionLines = /^\s*[([]?[A-Ha-hأابجدتثهـهو][)\].\-:]\s+/mu.test(cleanedText);
    if (commaOrTabCount >= 3 && !hasOptionLines) {
      detectedFormat = 'csv';
    }
  }

  let rawDrafts: Omit<
    ParsedQuestionDraft,
    'issues' | 'isValid' | 'isDuplicateInBatch' | 'isDuplicateInBank' | 'existingQuestionId' | 'contentHash' | 'deterministicId'
  >[] = [];

  try {
    if (detectedFormat === 'json') {
      rawDrafts = parseJsonMCQs(cleanedText, defaultPoints);
    } else if (detectedFormat === 'csv') {
      rawDrafts = parseCsvMCQs(cleanedText, defaultPoints);
    } else {
      rawDrafts = parseStructuredTextMCQs(cleanedText, defaultPoints);
    }
  } catch (e) {
    detectedFormat = 'text';
    rawDrafts = parseStructuredTextMCQs(cleanedText, defaultPoints);
  }

  const validated = validateAndAnnotateDrafts(rawDrafts, bankId, existingBankQuestions);
  return {
    detectedFormat,
    drafts: validated,
    detectedMetadata
  };
}

// ---------------------------------------------------------------------------
// 5. Ready-to-Use Medical Assessment Sample Templates (MCQ, True/False, Essay)
// ---------------------------------------------------------------------------

export const SAMPLE_BULK_TEXT_TEMPLATE = `العنوان: اختبار منتصف بلوك القلب والأوعية الدموية (CVS)
النوع: اختبار
المستوى: المستوى الرابع
الدفعة: الدفعة السادسة
المدة: 30 دقيقة
مؤقت السؤال: 45 ثانية

1. مريض يبلغ من العمر 58 عاماً حضر إلى الطوارئ بألم صدري ضاغط خلف القص مع ارتفاع القطعة ST في المساري II, III, aVF. أي الشرايين التاجية هو الأكثر احتمالاً للإصابة بالانسداد؟
أ) الشريان التاجي الأيسر الأمامي النازل (LAD) (التعليل: يغذي الجدار الأمامي للقلب وليس السفلي)
ب) الشريان التاجي الأيمن (Right Coronary Artery - RCA) * (التعليل: صحيح لأن المساري السفلية تتغذى بنسبة 85% من الشريان التاجي الأيمن)
ج) الشريان المنعطف الأيسر (Left Circumflex - LCx) (التعليل: يغذي الجدار الجانبي للبطين)
د) الجذع التاجي الأيسر الرئيسي (التعليل: انسداده يؤدي إلى احتشاء أمامي جانبي شامل)
الإجابة: ب
التعليل: المساري السفلية تعكس الجدار السفلي للبطين الأيسر والذي يتغذى بالشريان التاجي الأيمن RCA.

2. [صح وخطأ] يُمنع استخدام مثبطات الإنزيم المحول للأنجيوتنسين (ACE Inhibitors) منعاً باتاً أثناء فترة الحمل بسبب خطورة الفشل الكلوي الجنيني.
أ) صح (التعليل: صحيح لأنها تسبب قصوراً كلوياً جنينياً وقلة السائل الأمنيوسي)
ب) خطأ (التعليل: خطأ لأنها مصنفة ضمن الفئة D/X الممنوعة في الحمل)
الإجابة: صح
التعليل: أدوية ACEIs وARBs مسببة لتشوهات كلوية جنينية خطيرة وتستبدل بالمثيل دوبا أو اللابيتالول.

3. [سؤال مقالي] اذكر الخطوات العلاجية الإسعافية الثلاث الأولى لمريض يعاني من صدمة الحساسية المفرطة (Anaphylaxis) في قسم الطوارئ مع تحديد الجرعة ومكان الحقن.
الإجابة النموذجية: 1. حقن الأدرينالين (Epinephrine) عضلياً في العضلة المتسعة الوحشية للفخذ بجرعة 0.5 ملغ (1:1000). 2. تأمين مجرى التنفس وإعطاء الأكسجين عالي التدفق. 3. تركيب خطين وريديين واسعين وبدء السوائل الوريدية البلورية (Normal Saline).
التعليل: الأدرينالين هو العلاج المنقذ للحياة ويجب حقنه فوراً بدون أي تأخير لعكس التوسع الوعائي والتشنج القصبي.
النقاط: 10`;

export const SAMPLE_BULK_CSV_TEMPLATE = `السؤال,نوع السؤال,خيار أ,تعليل أ,خيار ب,تعليل ب,خيار ج,تعليل ج,خيار د,تعليل د,الإجابة الصحيحة,التعليل العام,النقاط
"ما هو الصمام القلبي الذي يُسمع في الورب الخامس الأيسر عند خط منتصف الترقوة؟","mcq","الصمام الأبهري","يسمع في الورب الثاني الأيمن","الصمام الرئوي","يسمع في الورب الثاني الأيسر","الصمام التاجي (الميترالي)","صحيح لأنه يقع في قمة القلب","الصمام ثلاثي الشرف","يسمع عند الحافة اليسرى لعظم القص","ج","بؤرة التسمع التاجية تقع في قمة القلب عند الورب الخامس الأيسر.",5
"البنسلين هو العلاج المعياري الأول لالتهاب البلعوم العقدي للوقاية من الحمى الروماتيزمية.","true_false","صح","صحيح لأنه يقضي على المكورات العقدية","خطأ","غير صحيح","","","","","أ","البنسلين هو الخيار الأول المثبت للوقاية من الحمى الروماتيزمية.",5`;

// ---------------------------------------------------------------------------
// 6. Universal Master AI Prompt for UMED (Arabic)
// ---------------------------------------------------------------------------

export const UMED_AI_UNIVERSAL_PROMPT_ARABIC = `أنت مساعد أكاديمي طبي مبرمج خصيصاً لإعداد وتنسيق بنوك الأسئلة والاختبارات الطبية لمنصة UMED.
مهمتك: تحويل أي ملف أو نص أسئلة أرسله لك (مهما كانت صيغته، ترتيبه، أو لغته)، أو إنشاء نموذج اختبار/مسابقة جديد حسب الموضوع الطبي المطلوب، وإخراج النتيجة بدقة تامة داخل مربع نص واحد (Code Block) جاهز للصق المباشر في UMED ويتعرف عليه النظام فوراً دون أي خطأ.

قواعد التنسيق الإلزامية في نظام UMED:
1. ترويسة الاختبار التلقائية (ضعها في بداية النص، سيتعرف عليها نظام UMED لضبط الإعدادات فوراً):
العنوان: [اسم الاختبار أو المسابقة الطبية]
النوع: [اختبار أو مسابقة]
المستوى: [المستوى الدراسي، مثال: المستوى الرابع]
الدفعة: [اسم أو رقم الدفعة، مثال: الدفعة السادسة]
المادة: [المادة أو البلوك، مثال: بلوك القلب والأوعية الدموية CVS]
المدة: [المدة بالدقائق، مثال: 30]
مؤقت السؤال: [مدة السؤال بالثواني، مثال: 45]

2. أنواع الأسئلة المدعومة وتنسيقها:
أ) أسئلة الاختيار من متعدد (MCQ) - عدد خيارات ديناميكي (3 أو 4 أو 5 خيارات):
1. [نص السؤال الطبي بالعربية]
[Optional English stem if bilingual]
أ) [نص الخيار الأول] (التعليل: سبب صحة أو خطأ هذا الخيار)
ب) [نص الخيار الثاني] (التعليل: سبب صحة أو خطأ هذا الخيار)
ج) [نص الخيار الثالث] (التعليل: سبب صحة أو خطأ هذا الخيار)
د) [نص الخيار الرابع] (التعليل: سبب صحة أو خطأ هذا الخيار)
الإجابة: [حرف الإجابة الصحيحة: أ أو ب أو ج أو د]
التعليل: [التعليل الطبي الشامل للسؤال في سطر واحد]

ب) أسئلة الصواب والخطأ (True / False):
2. [صح وخطأ] [نص العبارة الطبية]
أ) صح (التعليل: ...)
ب) خطأ (التعليل: ...)
الإجابة: [صح أو خطأ]
التعليل: [الشرح والتعليل الطبي للعبارة]

ج) الأسئلة المقالية والسريرية (Essay / Short Answer):
3. [سؤال مقالي] [نص السؤال السريري]
الإجابة النموذجية: [الإجابة النموذجية الكاملة وعناصر التقييم]
التعليل: [التعليل والشرح العلمي]
النقاط: [درجة السؤال، مثال: 10]

3. افصل بين كل سؤال والذي يليه بسطر فارغ واحد.
4. لا تكتب أي مقدمات أو خاتمة خارج إطار الأسئلة، بل أخرج المحتوى كاملاً داخل كود موحد (Code Block).

الآن طبّق هذه القواعد بدقة 100% على المحتوى أو الموضوع التالي:`;


