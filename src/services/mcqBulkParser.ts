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
  BankQuestionTypeMode,
  AssessmentLanguage,
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
 * Automatically detects whether a block of text is Arabic ('ar'), English ('en'), or Bilingual ('bilingual').
 */
export function detectLanguageFromText(text?: string | null): AssessmentLanguage {
  if (!text) return 'ar';
  const arabicMatches = text.match(/[\u0600-\u06FF]/g) || [];
  const latinMatches = text.match(/[A-Za-z]/g) || [];
  const arCount = arabicMatches.length;
  const enCount = latinMatches.length;

  if (arCount === 0 && enCount > 0) return 'en';
  if (enCount === 0 && arCount > 0) return 'ar';
  // If both exist in substantial proportions (e.g., bilingual lines)
  const total = arCount + enCount;
  if (total > 0 && arCount / total >= 0.2 && enCount / total >= 0.35) {
    return 'bilingual';
  }
  return arCount >= enCount ? 'ar' : 'en';
}

/**
 * Cleans and normalizes raw AI / LLM / Word / PDF text before parsing:
 * - Extracts content from markdown code fences (```text ... ```) if wrapped
 * - Strips markdown bold/italic wrappers (**...**, __...__) around headers, numbers, and option labels
 *   while preserving trailing * or ✓ correct answer markers!
 * - Normalizes Arabic-Indic digits (١٢٣٤٥٦٧٨٩٠) in question numbers and metadata
 */
export function preprocessRawAiText(rawInput: string): string {
  if (!rawInput) return '';
  let text = rawInput.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // Convert Arabic-Indic digits (٠-٩) to standard digits (0-9) when used in numbering/timers
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  text = text.replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)));

  // If the AI wrapped the output inside a markdown code fence ```...```, extract the fenced block(s)
  const codeBlockMatches = Array.from(text.matchAll(/```(?:[a-zA-Z0-9_\-]+)?\s*\n([\s\S]*?)```/g));
  if (codeBlockMatches.length > 0) {
    const combinedBlocks = codeBlockMatches.map((m) => m[1].trim()).filter(Boolean).join('\n\n');
    if (combinedBlocks.length >= 20) {
      text = combinedBlocks;
    }
  } else {
    // Strip stray opening/closing ``` lines
    text = text.replace(/^\s*```[a-zA-Z0-9_\-]*\s*$/gm, '');
  }

  const cleanedLines: string[] = [];
  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim();

    // Skip horizontal markdown dividers (---, ***, ___, ===)
    if (/^(?:[-=_]{3,}|\*{3,})$/.test(line)) {
      cleanedLines.push('');
      continue;
    }

    // Strip markdown heading hashes (e.g. "### Question 1:" -> "Question 1:")
    line = line.replace(/^#{1,6}\s+/, '');

    // Strip markdown bullet before option or metadata (e.g. "- **A)** Text" or "• A) Text")
    line = line.replace(/^(?:[-•‣◦])\s+(?=(?:\*\*|__)?[([]?[A-Ha-hأابجدتثهـهو][)\].\-:])/u, '');

    // Preserve trailing * correct marker before stripping markdown **bold**
    const hasTrailingSingleStar = /(?:^|[^*])\*\s*$/.test(line) && !/\*\*$/.test(line);
    const hasTrailingTripleStar = /\*\*\*\s*$/.test(line);

    // Strip **bold** and __bold__ wrappers
    line = line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1');

    if ((hasTrailingSingleStar || hasTrailingTripleStar) && !/\*\s*$/.test(line)) {
      line = `${line.trim()} *`;
    }

    cleanedLines.push(line);
  }

  return cleanedLines.join('\n').trim();
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
  const cleaned = rawToken.replace(/\*\*/g, '').trim();
  const lower = cleaned.toLowerCase();

  // True / False detection
  if (
    lower === 'true' ||
    cleaned === 'صح' ||
    cleaned === 'صواب' ||
    cleaned === 'صحيح' ||
    lower === 't' ||
    cleaned === 'صح (صواب)' ||
    cleaned === 'صح / true' ||
    lower === 'true (صح)'
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
    lower === 'f' ||
    cleaned === 'خطأ / false' ||
    lower === 'false (خطأ)'
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

  const leadingTokenMatch = cleaned.match(/^(?:خيار|الخيار|option)?\s*[\(\[]?([A-Ha-hأابجدتثهـهو1-8])[\)\].\-:](?:\s|$)/iu);
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
      const normOptEn = normalizeMedicalText(o.textEnglish);
      return (
        (normOpt && (normOpt.includes(normTarget) || normTarget.includes(normOpt))) ||
        (normOptEn && (normOptEn.includes(normTarget) || normTarget.includes(normOptEn)))
      );
    });
    if (partialMatch) return partialMatch.id;
  }

  return '';
}

/**
 * Parses inline explanation / rationale embedded within an option line
 * Example: "الشريان التاجي الأيمن (التعليل: صحيح لأنه يغذي الجدار السفلي)"
 * Example: "Right Coronary Artery (Rationale: Correct because it supplies the inferior wall)"
 */
export function extractOptionAndExplanation(rawText: string): {
  text: string;
  explanation?: string;
  isCorrect?: boolean;
} {
  let text = rawText.trim();
  let explanation: string | undefined = undefined;
  let isCorrect: boolean | undefined = undefined;

  // Check parenthesized or bracketed explanation: (التعليل: ...) or (Rationale: ...) or (Explanation: ...)
  const bracketExpMatch = text.match(/[\(\[]\s*(?:التعليل|تعليل|السبب|سبب|تفسير|Explanation|Rationale|Reason|Why)\s*[:\-]?\s*([^\]\)]+)[\)\]]\s*$/iu);
  if (bracketExpMatch) {
    explanation = bracketExpMatch[1].trim();
    text = text.replace(bracketExpMatch[0], '').trim();
  }

  // Check dashed or pipe explanation: " - تعليل: ..." or " | Rationale: ..." or " — Explanation: ..."
  if (!explanation) {
    const dashExpMatch = text.match(/\s+[\-|—–]\s*(?:التعليل|تعليل|السبب|تفسير|Explanation|Rationale|Reason)\s*[:\-]?\s*(.+)$/iu);
    if (dashExpMatch) {
      explanation = dashExpMatch[1].trim();
      text = text.slice(0, dashExpMatch.index).trim();
    }
  }

  // Re-check if there is a trailing * or ✓ left on `text` after stripping the parenthesized rationale!
  // Example: "ب) الشريان التاجي الأيمن * (التعليل: ...)"
  const trailingCheckAfterExp = parseInlineCorrectMarker(text);
  if (trailingCheckAfterExp.isCorrect) {
    text = trailingCheckAfterExp.cleanedText;
    isCorrect = true;
  }

  // Check if explanation itself indicates correctness
  if (explanation && isCorrect === undefined) {
    if (/^(?:صحيح|صح|إجابة صحيحة|correct|true|right)/iu.test(explanation)) {
      isCorrect = true;
    } else if (/^(?:خطأ|خاطئ|غير صحيح|غلط|incorrect|false|wrong)/iu.test(explanation)) {
      isCorrect = false;
    }
  }

  return { text, explanation, isCorrect };
}

/**
 * Extracts Assessment Metadata from the top of the text/file if present:
 * Language, Title, Assessment Type, Study Level, Batch, Subject/Block, Duration, Question Timer
 */
export function extractAssessmentMetadataFromText(rawText: string): {
  detectedMetadata: DetectedAssessmentMetadata;
  cleanedText: string;
} {
  const preprocessed = preprocessRawAiText(rawText);
  const lines = preprocessed.split(/\r?\n/);
  const metadata: DetectedAssessmentMetadata = {};
  const remainingLines: string[] = [];
  let headerFinished = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Stop inspecting header once we hit an actual question start (e.g. "1. ", "Q1:", "[Essay]", "[سؤال مقالي]", "[إكمال الفراغ]")
    const isQuestionStart = /^\s*(?:(?:س|سؤال|السؤال|Q|Question)\s*#?\d*\s*[.:\-)]|\[\d+\]|\(\d+\)|\d+\s*[.\-)]|\[(?:سؤال مقالي|صح وخطأ|مقالي|إكمال الفراغ|اكمل الفراغ|إكمال|أكمل الفراغ|True\s*\/\s*False|T\/F|Essay|Short\s*Answer|Fill\s*in\s*the\s*blank|Fill\s*Blank|Completion)\])/iu.test(trimmed);
    if (isQuestionStart) {
      headerFinished = true;
    }

    if (headerFinished) {
      remainingLines.push(line);
      continue;
    }

    // Language: اللغة: عربي / إنجليزي / ثنائي اللغة | Language: English / Arabic / Bilingual
    const langMatch = trimmed.match(/^(?:اللغة|لغة الاختبار|لغة البنك|لغة الأسئلة|Language|Exam\s*Language|Test\s*Language)\s*[:\-=]\s*(.+)$/iu);
    if (langMatch) {
      const val = langMatch[1].trim().toLowerCase();
      if (/ثنائي|مزدوج|bilingual|both|ar.*en|en.*ar|عربي.*إنجليزي|عربي.*انجليزي/i.test(val)) {
        metadata.language = 'bilingual';
      } else if (/إنجليز|انجليز|english|\ben\b/i.test(val)) {
        metadata.language = 'en';
      } else {
        metadata.language = 'ar';
      }
      continue;
    }

    // Title: العنوان: ... or اسم الاختبار: ... or Title: ...
    const titleMatch = trimmed.match(/^(?:العنوان|عنوان الاختبار|عنوان التقييم|اسم الاختبار|اسم المسابقة|Title|Exam\s*Title|Assessment\s*Title|Quiz\s*Title)\s*[:\-=]\s*(.+)$/iu);
    if (titleMatch) {
      const titleVal = titleMatch[1].trim();
      metadata.titleArabic = titleVal;
      if (!/[\u0600-\u06FF]/.test(titleVal)) {
        metadata.titleEnglish = titleVal;
      }
      continue;
    }

    // Assessment Type: النوع: ... or نوع التقييم: مسابقة / اختبار
    const typeMatch = trimmed.match(/^(?:النوع|نوع التقييم|نوع الاختبار|التصنيف|Type|Assessment\s*Type|Category|Mode)\s*[:\-=]\s*(.+)$/iu);
    if (typeMatch) {
      const val = typeMatch[1].trim().toLowerCase();
      metadata.assessmentType = /مسابقة|تنافسي|competition|contest|challenge/i.test(val) ? 'competition' : 'exam';
      continue;
    }

    // Study Level: المستوى: المستوى الرابع / Level 4
    const levelMatch = trimmed.match(/^(?:المستوى|المستوى الدراسي|المرحلة|المرحلة الدراسية|السنة الدراسية|Level|Study\s*Level|Academic\s*Level|Year)\s*[:\-=]\s*(.+)$/iu);
    if (levelMatch) {
      const val = levelMatch[1].trim();
      metadata.studyLevelName = val;
      const numMatch = val.match(/(\d+)/);
      if (numMatch) {
        metadata.studyLevelId = `lvl-${numMatch[1]}`;
      } else if (/امتياز|internship|intern/i.test(val)) {
        metadata.studyLevelId = 'lvl-internship';
      } else if (/الأول|الاول|أولى|اولى|first/i.test(val)) {
        metadata.studyLevelId = 'lvl-1';
      } else if (/الثاني|ثانية|ثانيه|second/i.test(val)) {
        metadata.studyLevelId = 'lvl-2';
      } else if (/الثالث|ثالثة|ثالثه|third/i.test(val)) {
        metadata.studyLevelId = 'lvl-3';
      } else if (/الرابع|رابعة|رابعه|fourth/i.test(val)) {
        metadata.studyLevelId = 'lvl-4';
      } else if (/الخامس|خامسة|خامسه|fifth/i.test(val)) {
        metadata.studyLevelId = 'lvl-5';
      } else if (/السادس|سادسة|سادسه|sixth/i.test(val)) {
        metadata.studyLevelId = 'lvl-6';
      } else if (/السابع|سابعة|سابعه|seventh/i.test(val)) {
        metadata.studyLevelId = 'lvl-7';
      }
      continue;
    }

    // Batch: الدفعة: الدفعة السادسة / دفعة 28 / Batch 6
    const batchMatch = trimmed.match(/^(?:الدفعة|دفعة|اسم الدفعة|رقم الدفعة|Batch|Cohort)\s*[:\-=]\s*(.+)$/iu);
    if (batchMatch) {
      metadata.batchName = batchMatch[1].trim();
      const bNum = batchMatch[1].match(/(\d+)/);
      if (bNum) metadata.batchNumber = bNum[1];
      continue;
    }

    // Subject / Block: المادة: باطنة / البلوك: CVS
    const courseMatch = trimmed.match(/^(?:المادة|البلوك|المقرر|الكورس|الموضوع|Subject|Block|Course|Module|Topic)\s*[:\-=]\s*(.+)$/iu);
    if (courseMatch) {
      metadata.courseName = courseMatch[1].trim();
      continue;
    }

    // Exam Duration: المدة: 30 دقيقة / Duration: 45 min
    const durationMatch = trimmed.match(/^(?:المدة|مدة الاختبار|زمن الاختبار|وقت الاختبار|Duration|Exam\s*Duration|Time\s*Limit)\s*[:\-=]\s*(\d+)\s*(?:دقيقة|دقائق|د|min|mins|minutes)?/iu);
    if (durationMatch) {
      metadata.durationMinutes = parseInt(durationMatch[1], 10);
      continue;
    }

    // Question Timer: مؤقت السؤال: 45 ثانية / Question Timer: 60s
    const qTimerMatch = trimmed.match(/^(?:مؤقت السؤال|مدة السؤال|زمن السؤال|مؤقت لكل سؤال|Question\s*Timer|Time\s*Per\s*Question|Per\s*Question)\s*[:\-=]\s*(\d+)\s*(?:ثانية|ثواني|ث|sec|secs|seconds|s)?/iu);
    if (qTimerMatch) {
      metadata.questionDurationSeconds = parseInt(qTimerMatch[1], 10);
      continue;
    }

    // Skip conversational AI intro lines before the first question (e.g. "بالتأكيد، إليك الأسئلة..." or "Sure, here are the questions:")
    if (/^(?:بالتأكيد|طبعاً|إليك|فيما يلي|هذا نموذج|sure|certainly|here\s+are|below\s+are)/iu.test(trimmed)) {
      continue;
    }

    // If it's a completely blank line before questions, skip it
    if (!trimmed) {
      continue;
    }

    remainingLines.push(line);
  }

  const cleanedBodyText = remainingLines.join('\n').trim();
  if (!metadata.language && cleanedBodyText) {
    metadata.language = detectLanguageFromText(cleanedBodyText);
  }

  return {
    detectedMetadata: metadata,
    cleanedText: cleanedBodyText
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
    } else if (qType === 'fill_blank') {
      // Fill-in-the-blank question validation: requires the expected answer in modelAnswerArabic
      normalizedOptions = [];
      validCorrectId = 'fill_blank';
      if (!draft.modelAnswerArabic || !draft.modelAnswerArabic.trim()) {
        issues.push({
          code: 'MISSING_FILL_BLANK_ANSWER',
          severity: 'error',
          messageArabic: 'يرجى كتابة الإجابة الصحيحة المطلوبة لإكمال الفراغ'
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
  defaultPoints: number = 5,
  languageHint?: AssessmentLanguage
): Omit<
  ParsedQuestionDraft,
  'issues' | 'isValid' | 'isDuplicateInBatch' | 'isDuplicateInBank' | 'existingQuestionId' | 'contentHash' | 'deterministicId'
>[] {
  const preprocessed = preprocessRawAiText(rawText);
  if (!preprocessed) return [];

  // Extract metadata header first so it doesn't pollute questions
  const { detectedMetadata, cleanedText: textWithoutHeader } = extractAssessmentMetadataFromText(preprocessed);
  const effectiveLangHint = languageHint || detectedMetadata.language;
  const { cleanedBody, answerKeyByNumber } = extractTrailingAnswerKeyMap(textWithoutHeader);

  // Split into question blocks:
  // Either separated by blank lines, OR starting with a question header
  const lines = cleanedBody.split('\n');
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  let currentBlockHasOptions = 0;
  let currentBlockHasAnswerLine = false;
  let currentBlockHasModelAnswer = false;

  const questionStartRegex = /^\s*(?:(?:س|سؤال|السؤال|Q|Question)\s*#?\d*\s*[.:\-)]|\[\d+\]|\(\d+\)|\d+\s*[.\-)]|\[(?:سؤال مقالي|صح وخطأ|مقالي|إكمال الفراغ|اكمل الفراغ|إكمال|أكمل الفراغ|True\s*\/\s*False|T\/F|Essay|Short\s*Answer|Fill\s*in\s*the\s*blank|Fill\s*Blank|Completion)\])\s*\S+/iu;
  const optionLineTestRegex = /^\s*(?:[✓✔☑✅*]+\s*)?[([]?([A-Ha-hأابجدتثهـهو])[)\].\-:]\s+\S+/u;
  const answerLineTestRegex = /^\s*(?:الإجابة الصحيحة|الاجابة الصحيحة|الإجابة|الاجابة|الجواب الصحيح|الجواب|الحل|Answer|Correct\s*Answer|Correct\s*Option|Correct|Key|ANS)\s*[:\-=]\s*\S+/iu;
  const modelAnswerLineTestRegex = /^\s*(?:الإجابة النموذجية|الاجابة النموذجية|إجابة نموذجية|اجابة نموذجية|نموذج الإجابة|الجواب النموذجي|معايير التقييم|معايير التصحيح|Model\s*Answer|Ideal\s*Answer|Expected\s*Answer|Scoring\s*Rubric|Rubric)\s*[:\-=]\s*\S*/iu;

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
    const rawStemLines: string[] = [];
    const explicitEnglishStemLines: string[] = [];
    const rawOptions: RawOptionCandidate[] = [];
    let explicitAnswerToken = '';
    let explanationLines: string[] = [];
    let modelAnswerLines: string[] = [];
    let points = defaultPoints;
    let detectedQuestionNumber: number | null = null;
    let explicitQuestionType: QuestionType | undefined = undefined;

    const optionRegex = /^\s*(?:([✓✔☑✅*]+)\s*)?[([]?([A-Ha-hأابجدتثهـهو1-8])[)\].\-:]\s*(.+)$/u;
    const inlineMultiOptionRegex = /(?:^|\s+)[([]?([A-Ha-hأابجدتثهـهو])[)\].\-:]\s*([^([\n]+?)(?=\s+[([]?[A-Ha-hأابجدتثهـهو][)\].\-:]|$)/gu;
    const answerRegex = /^\s*(?:الإجابة الصحيحة|الاجابة الصحيحة|الإجابة|الاجابة|الجواب الصحيح|الجواب|الحل|Answer|Correct\s*Answer|Correct\s*Option|Correct|Key|ANS)\s*[:\-=]?\s*(.+)$/iu;
    const modelAnswerRegex = /^\s*(?:الإجابة النموذجية|الاجابة النموذجية|الجواب النموذجي|نموذج الإجابة|معايير التصحيح|معايير التقييم|سلم التصحيح|Model\s*Answer|Ideal\s*Answer|Expected\s*Answer|Scoring\s*Rubric|Rubric)\s*[:\-=]?\s*(.*)$/iu;
    const explanationRegex = /^\s*(?:التعليل الطبي|التعليل العام|التعليل العلمي|التعليل|الشرح|التفسير|توضيح|السبب|Explanation|Clinical\s*Rationale|Rationale|Reason)\s*[:\-=]\s*(.+)$/iu;
    const pointsRegex = /^\s*(?:الدرجة|النقاط|درجة السؤال|Points|Score|Marks|Grade)\s*[:\-=]\s*(\d+(?:\.\d+)?)/iu;
    const typeIndicatorRegex = /^\s*(?:نوع السؤال|النوع|Question\s*Type)\s*[:\-=]\s*(.+)$/iu;
    const explicitEnStemPrefixRegex = /^\s*(?:EN|English|الترجمة|النص الإنجليزي)\s*[:\-]\s*(.+)$/iu;

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
        if (/إكمال|اكمل|فراغ|fill|blank|completion/i.test(val)) explicitQuestionType = 'fill_blank';
        else if (/مقالي|essay|short/i.test(val)) explicitQuestionType = 'essay';
        else if (/صح|خطأ|true|false|t\/f/i.test(val)) explicitQuestionType = 'true_false';
        else explicitQuestionType = 'mcq';
        continue;
      }

      // Check Model Answer line (for essay questions)
      const modelMatch = line.match(modelAnswerRegex);
      if (modelMatch) {
        inModelAnswer = true;
        inExplanation = false;
        explicitQuestionType = 'essay';
        if (modelMatch[1].trim()) {
          modelAnswerLines.push(modelMatch[1].trim());
        }
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
        // Check if inline explanation is appended on the same line after " - التعليل: ..." or " - Rationale: ..."
        const inlineExpSplit = rawAns.split(/\s+(?:[\-|—–]\s*(?:التعليل|الشرح|Explanation|Rationale)?|(?:التعليل|الشرح|Explanation|Rationale))\s*[:\-]\s*/iu);
        explicitAnswerToken = inlineExpSplit[0].trim();
        if (inlineExpSplit.length > 1 && inlineExpSplit.slice(1).join(' ').trim()) {
          explanationLines.push(inlineExpSplit.slice(1).join(' ').trim());
        }
        continue;
      }

      // Check sub-option explanation line in Arabic or English:
      // e.g. "تعليل أ: صحيح لأنه..." or "Rationale A: Correct because..." or "Option B Explanation: ..."
      const optionSpecificExpMatch = line.match(/^\s*(?:تعليل|التعليل الخاص بـ|تفسير|Rationale|Explanation|Option)\s*(?:الخيار\s*|for\s*|of\s*)?[([]?([A-Ha-hأابجدتثهـهو1-8])[)\]]?\s*(?:Rationale|Explanation)?\s*[:\-]\s*(.+)$/iu);
      if (optionSpecificExpMatch) {
        const targetMarker = optionSpecificExpMatch[1].trim();
        const expBody = optionSpecificExpMatch[2].trim();
        const matchedCandidate = rawOptions.find(o => o.marker.toLowerCase() === targetMarker.toLowerCase());
        if (matchedCandidate) {
          matchedCandidate.explanation = expBody;
        }
        continue;
      }

      // Check if multiple options are on a single line (e.g. "أ) خيار 1   ب) خيار 2   ج) خيار 3" or "A) Opt 1   B) Opt 2 *   C) Opt 3")
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

        if (!isNumericMarker || rawStemLines.length > 0 || explicitEnglishStemLines.length > 0) {
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

      // Check explicit "EN: ..." stem line
      const explicitEnMatch = line.match(explicitEnStemPrefixRegex);
      if (explicitEnMatch) {
        explicitEnglishStemLines.push(explicitEnMatch[1].trim());
        continue;
      }

      // Otherwise it is part of the question stem
      if (rawStemLines.length === 0 && explicitEnglishStemLines.length === 0) {
        // Detect question type tag anywhere in first stem line (e.g. "2. [صح وخطأ] ...", "[True/False] 2. ...", "[Essay]", "[إكمال الفراغ]")
        const tfTagRegex = /\[\s*(?:صح\s*و\s*خطأ|صواب\s*و\s*خطأ|صواب\s*\/\s*خطأ|صح\s*\/\s*خطأ|true\s*\/\s*false|true\s*or\s*false|t\/f)\s*\]|\(\s*(?:صح\s*أم\s*خطأ|true\s*or\s*false)\s*\)/iu;
        const essayTagRegex = /\[\s*(?:سؤال\s*مقالي|مقالي|سؤال\s*سريري\s*مقالي|essay|short\s*answer|clinical\s*essay)\s*\]/iu;
        const fillBlankTagRegex = /\[\s*(?:إكمال\s*الفراغ|اكمل\s*الفراغ|أكمل\s*الفراغ|سؤال\s*إكمال|إكمال|اكمل|fill\s*in\s*the\s*blank|fill\s*blank|completion)\s*\]/iu;

        // Strip leading question number first or after tag
        const qNumMatch = line.match(/^\s*(?:(?:س|سؤال|السؤال|Q|Question)\s*#?(\d+)\s*[.:\-)]?|\[\s*(\d+)\s*\]|\(\s*(\d+)\s*\)|(\d+)\s*[.\-):])\s*(.+)$/iu);
        if (qNumMatch) {
          const numStr = qNumMatch[1] || qNumMatch[2] || qNumMatch[3] || qNumMatch[4];
          if (numStr) detectedQuestionNumber = parseInt(numStr, 10);
          line = qNumMatch[5].trim();
        }

        if (tfTagRegex.test(line)) {
          explicitQuestionType = 'true_false';
          line = line.replace(tfTagRegex, '').trim();
        } else if (fillBlankTagRegex.test(line)) {
          explicitQuestionType = 'fill_blank';
          line = line.replace(fillBlankTagRegex, '').trim();
        } else if (essayTagRegex.test(line)) {
          explicitQuestionType = 'essay';
          line = line.replace(essayTagRegex, '').trim();
        }

        // Strip question number if it appeared AFTER the type tag (e.g. "[True/False] 1. Question...")
        const qNumAfterTag = line.match(/^\s*(?:(?:س|سؤال|السؤال|Q|Question)\s*#?(\d+)\s*[.:\-)]?|(\d+)\s*[.\-):])\s*(.+)$/iu);
        if (qNumAfterTag) {
          const numStr = qNumAfterTag[1] || qNumAfterTag[2];
          if (numStr && !detectedQuestionNumber) detectedQuestionNumber = parseInt(numStr, 10);
          line = qNumAfterTag[3].trim();
        }

        // Extract inline points like "(5 نقاط)" or "[5 pts]" at the end of the stem
        const inlinePts = line.match(/\s*[\(\[]\s*(\d+)\s*(?:نقاط|نقطة|درجات|درجة|pts|points|marks)\s*[\)\]]\s*$/iu);
        if (inlinePts) {
          points = Number(inlinePts[1]) || defaultPoints;
          line = line.replace(inlinePts[0], '').trim();
        }
      } else {
        // Also check inline points on subsequent stem lines
        const inlinePts = line.match(/\s*[\(\[]\s*(\d+)\s*(?:نقاط|نقطة|درجات|درجة|pts|points|marks)\s*[\)\]]\s*$/iu);
        if (inlinePts) {
          points = Number(inlinePts[1]) || defaultPoints;
          line = line.replace(inlinePts[0], '').trim();
        }
      }

      if (line) {
        rawStemLines.push(line);
      }
    }

    // Intelligently separate or combine Arabic & English stem lines without splitting multi-line English vignettes!
    const arabicStemLines = rawStemLines.filter(l => /[\u0600-\u06FF]/.test(l));
    const pureEnglishStemLines = [
      ...rawStemLines.filter(l => !/[\u0600-\u06FF]/.test(l) && /[A-Za-z]/.test(l)),
      ...explicitEnglishStemLines
    ];

    let stemArabic = '';
    let stemEnglish: string | undefined = undefined;
    let questionLanguage: AssessmentLanguage = effectiveLangHint || 'ar';

    if (arabicStemLines.length > 0 && pureEnglishStemLines.length > 0) {
      // Bilingual stem (has both Arabic lines and pure English lines)
      stemArabic = arabicStemLines.join(' ').trim();
      stemEnglish = pureEnglishStemLines.join(' ').trim();
      questionLanguage = 'bilingual';
    } else if (arabicStemLines.length === 0 && pureEnglishStemLines.length > 0) {
      // Pure English stem (even if multi-line clinical vignette!)
      stemArabic = pureEnglishStemLines.join(' ').trim();
      stemEnglish = pureEnglishStemLines.join(' ').trim();
      questionLanguage = 'en';
    } else {
      // Pure Arabic stem (may contain inline English terms)
      stemArabic = rawStemLines.join(' ').trim();
      stemEnglish = explicitEnglishStemLines.length > 0 ? explicitEnglishStemLines.join(' ').trim() : undefined;
      questionLanguage = effectiveLangHint === 'bilingual' ? 'bilingual' : 'ar';
    }

    // Determine Final Question Type
    let questionType: QuestionType = explicitQuestionType || 'mcq';
    if (!explicitQuestionType) {
      if (rawOptions.length === 0 && /(?:_{3,}|\.{4,})/.test(stemArabic) && (explicitAnswerToken || modelAnswerLines.length > 0)) {
        questionType = 'fill_blank';
      } else if (modelAnswerLines.length > 0 && rawOptions.length === 0) {
        questionType = 'essay';
      } else if (
        rawOptions.length === 2 &&
        /^(?:صح|صواب|صحيح|صح \(صواب\)|صح \/ true|true|t)$/i.test(rawOptions[0]?.text.trim()) &&
        /^(?:خطأ|خاطئ|غلط|خطأ \/ false|false|f)$/i.test(rawOptions[1]?.text.trim())
      ) {
        questionType = 'true_false';
      } else if (rawOptions.length === 0 && /^(?:صح|صواب|صحيح|خطأ|خاطئ|true|false|t|f)$/i.test(explicitAnswerToken)) {
        questionType = 'true_false';
      } else if (rawOptions.length === 0 && explicitAnswerToken && explicitAnswerToken.length > 1) {
        questionType = 'fill_blank';
      }
    }

    // Build Options dynamically based on Question Type and Language
    let options: QuestionOption[] = [];
    let correctOptionId = '';

    if (questionType === 'essay') {
      options = [];
      correctOptionId = 'essay';
      if (modelAnswerLines.length === 0 && explicitAnswerToken) {
        modelAnswerLines.push(explicitAnswerToken);
      }
    } else if (questionType === 'fill_blank') {
      options = [];
      correctOptionId = 'fill_blank';
      if (explicitAnswerToken && modelAnswerLines.length === 0) {
        modelAnswerLines.push(explicitAnswerToken);
      }
    } else if (questionType === 'true_false') {
      const optAExp = rawOptions.find(o => /^(opt-a|a|أ|1)/i.test(o.marker) || /صح|صواب|true/i.test(o.text))?.explanation;
      const optBExp = rawOptions.find(o => /^(opt-b|b|ب|2)/i.test(o.marker) || /خطأ|خاطئ|false/i.test(o.text))?.explanation;

      const trueLabel =
        questionLanguage === 'en'
          ? 'True'
          : questionLanguage === 'bilingual'
          ? 'صح / True'
          : 'صح (صواب)';
      const falseLabel =
        questionLanguage === 'en'
          ? 'False'
          : questionLanguage === 'bilingual'
          ? 'خطأ / False'
          : 'خطأ';

      options = [
        { id: 'opt-a', textArabic: trueLabel, textEnglish: 'True', ...(optAExp ? { explanationArabic: optAExp } : {}) },
        { id: 'opt-b', textArabic: falseLabel, textEnglish: 'False', ...(optBExp ? { explanationArabic: optBExp } : {}) }
      ];

      if (explicitAnswerToken) {
        correctOptionId = resolveCanonicalOptionId(explicitAnswerToken, options);
      } else {
        const markedTrue = rawOptions.find(o => o.isMarkedCorrect && /صح|صواب|true/i.test(o.text));
        const markedFalse = rawOptions.find(o => o.isMarkedCorrect && /خطأ|خاطئ|false/i.test(o.text));
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
        const optText = candidate ? candidate.text : '';
        const isPureEnOpt = optText && !/[\u0600-\u06FF]/.test(optText) && /[A-Za-z]/.test(optText);
        return {
          id: optId,
          textArabic: optText,
          ...(isPureEnOpt ? { textEnglish: optText } : {}),
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
      language: questionLanguage,
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
  defaultPoints: number = 5,
  languageHint?: AssessmentLanguage
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

  const colExpA = findCol([/^(exp_a|rationale_a|تعليل أ|التعليل أ|تعليل الخيار أ)$/i], -1);
  const colExpB = findCol([/^(exp_b|rationale_b|تعليل ب|التعليل ب|تعليل الخيار ب)$/i], -1);
  const colExpC = findCol([/^(exp_c|rationale_c|تعليل ج|التعليل ج|تعليل الخيار ج)$/i], -1);
  const colExpD = findCol([/^(exp_d|rationale_d|تعليل د|التعليل د|تعليل الخيار د)$/i], -1);
  const colExpE = findCol([/^(exp_e|rationale_e|تعليل هـ|التعليل هـ|تعليل الخيار هـ)$/i], -1);

  const colAns = findCol([/^(answer|correct|correctoptionid|correct_answer|الإجابة|الاجابة|الإجابة الصحيحة|الجواب|الحل)$/i], 5);
  const colModelAns = findCol([/^(model_answer|rubric|الإجابة النموذجية|الجواب النموذجي|سلم التصحيح)$/i], -1);
  const colExp = findCol([/^(explanation|explanationarabic|rationale|التعليل|التعليل العام|الشرح|التفسير)$/i], 6);
  const colPts = findCol([/^(points|score|marks|النقاط|الدرجة)$/i], 7);

  return dataRows.map((row, idx) => {
    const stemArabic = (row[colStemAr] || '').trim();
    const stemEnglish = colStemEn >= 0 ? (row[colStemEn] || '').trim() : undefined;
    const rawTypeVal = colType >= 0 ? (row[colType] || '').trim().toLowerCase() : '';
    const detectedLang = languageHint || (stemEnglish ? 'bilingual' : detectLanguageFromText(stemArabic));

    let questionType: QuestionType = 'mcq';
    if (/إكمال|اكمل|فراغ|fill|blank/i.test(rawTypeVal)) questionType = 'fill_blank';
    else if (/مقالي|essay/i.test(rawTypeVal)) questionType = 'essay';
    else if (/صح|خطأ|true|false/i.test(rawTypeVal)) questionType = 'true_false';

    const rawA = parseInlineCorrectMarker(row[colOptA] || '');
    const rawB = parseInlineCorrectMarker(row[colOptB] || '');
    const rawC = colOptC >= 0 ? parseInlineCorrectMarker(row[colOptC] || '') : { cleanedText: '', isCorrect: false };
    const rawD = colOptD >= 0 ? parseInlineCorrectMarker(row[colOptD] || '') : { cleanedText: '', isCorrect: false };
    const rawE = colOptE >= 0 ? parseInlineCorrectMarker(row[colOptE] || '') : { cleanedText: '', isCorrect: false };

    let options: QuestionOption[] = [];
    let correctOptionId = '';

    if (questionType === 'essay' || questionType === 'fill_blank') {
      options = [];
      correctOptionId = questionType;
    } else if (questionType === 'true_false') {
      options = [
        { id: 'opt-a', textArabic: rawA.cleanedText || (detectedLang === 'en' ? 'True' : 'صح (صواب)'), textEnglish: 'True' },
        { id: 'opt-b', textArabic: rawB.cleanedText || (detectedLang === 'en' ? 'False' : 'خطأ'), textEnglish: 'False' }
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
      language: detectedLang,
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
  defaultPoints: number = 5,
  languageHint?: AssessmentLanguage
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
      item.stemArabic || item.questionArabic || item.question || item.stem || item.stemEnglish || item['السؤال'] || ''
    ).trim();
    const stemEnglish = String(item.stemEnglish || item.questionEnglish || '').trim() || undefined;
    const detectedLang: AssessmentLanguage =
      item.language || languageHint || (stemEnglish && stemArabic !== stemEnglish ? 'bilingual' : detectLanguageFromText(stemArabic));

    const rawType = String(item.questionType || item.type || item['نوع السؤال'] || '').toLowerCase();
    let questionType: QuestionType = 'mcq';
    if (/إكمال|اكمل|فراغ|fill|blank/i.test(rawType)) questionType = 'fill_blank';
    else if (/مقالي|essay/i.test(rawType)) questionType = 'essay';
    else if (/صح|خطأ|true|false/i.test(rawType)) questionType = 'true_false';

    let options: QuestionOption[] = [];
    if (questionType === 'essay' || questionType === 'fill_blank') {
      options = [];
    } else if (Array.isArray(item.options)) {
      options = item.options.map((rawOpt: any, optIdx: number) => {
        const optId = String(rawOpt?.id || getOptionIdByIndex(optIdx));
        if (typeof rawOpt === 'string') {
          return { id: optId, textArabic: rawOpt.trim() };
        }
        return {
          id: optId,
          textArabic: String(rawOpt?.textArabic || rawOpt?.text || rawOpt?.textEnglish || rawOpt?.label || '').trim(),
          ...(rawOpt?.textEnglish ? { textEnglish: String(rawOpt.textEnglish).trim() } : {}),
          ...(rawOpt?.explanationArabic || rawOpt?.explanation || rawOpt?.rationale
            ? { explanationArabic: String(rawOpt.explanationArabic || rawOpt.explanation || rawOpt.rationale).trim() }
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
    if (questionType === 'essay' || questionType === 'fill_blank') {
      correctOptionId = questionType;
    } else {
      correctOptionId = resolveCanonicalOptionId(rawAnswer, options);
      if (!correctOptionId) {
        const foundCorrect = options.find(o => o.isCorrect);
        if (foundCorrect) correctOptionId = foundCorrect.id;
      }
    }

    const modelAnswerArabic = String(
      item.modelAnswerArabic || item.modelAnswer || item['الإجابة النموذجية'] || (questionType === 'fill_blank' ? rawAnswer : '') || ''
    ).trim() || undefined;

    const explanationArabic = String(
      item.explanationArabic || item.explanation || item.rationale || item['التعليل'] || ''
    ).trim() || undefined;

    const points = Number(item.points || item.score || item['النقاط']) || defaultPoints;

    return {
      tempId: `json-draft-${idx}-${Date.now()}`,
      sourceIndex: idx + 1,
      questionType,
      language: detectedLang,
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
  languageHint?: AssessmentLanguage;
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
    languageHint,
    fileName = '',
    bankId,
    defaultPoints = 5,
    existingBankQuestions = []
  } = params;

  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return { detectedFormat: 'text', drafts: [], detectedMetadata: {} };
  }

  // Extract Metadata Header (Language, Title, Type, Level, Batch, Duration)
  const { detectedMetadata, cleanedText } = extractAssessmentMetadataFromText(trimmed);
  const effectiveLanguage = detectedMetadata.language || languageHint || detectLanguageFromText(cleanedText);
  if (!detectedMetadata.language) {
    detectedMetadata.language = effectiveLanguage;
  }

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
      rawDrafts = parseJsonMCQs(cleanedText, defaultPoints, effectiveLanguage);
    } else if (detectedFormat === 'csv') {
      rawDrafts = parseCsvMCQs(cleanedText, defaultPoints, effectiveLanguage);
    } else {
      rawDrafts = parseStructuredTextMCQs(cleanedText, defaultPoints, effectiveLanguage);
    }
  } catch (e) {
    detectedFormat = 'text';
    rawDrafts = parseStructuredTextMCQs(cleanedText, defaultPoints, effectiveLanguage);
  }

  const validated = validateAndAnnotateDrafts(rawDrafts, bankId, existingBankQuestions);
  const validCount = validated.filter(d => d.isValid).length || validated.length;

  if (validCount > 0) {
    if (detectedMetadata.questionDurationSeconds && detectedMetadata.questionDurationSeconds > 0) {
      // Compute total duration from per-question timer × question count
      const computedMinutes = Math.max(1, Math.ceil((detectedMetadata.questionDurationSeconds * validCount) / 60));
      if (!detectedMetadata.durationMinutes || detectedMetadata.durationMinutes < computedMinutes) {
        detectedMetadata.durationMinutes = computedMinutes;
      }
    } else if (detectedMetadata.durationMinutes && detectedMetadata.durationMinutes > 0 && detectedMetadata.questionDurationSeconds === undefined) {
      // Compute per-question timer from total duration ÷ question count
      detectedMetadata.questionDurationSeconds = Math.max(5, Math.round((detectedMetadata.durationMinutes * 60) / validCount));
    }
  }

  return {
    detectedFormat,
    drafts: validated,
    detectedMetadata
  };
}

/**
 * Bidirectional Timer Synchronization Helper:
 * - When `changedField === 'questionSeconds'` (user picked per-question time):
 *   Calculates `durationMinutes = Math.max(1, Math.ceil((questionDurationSeconds * count) / 60))`
 * - When `changedField === 'totalMinutes'` (user picked total exam duration):
 *   Calculates `questionDurationSeconds = Math.max(5, Math.round((durationMinutes * 60) / count))`
 * - When `changedField === 'questionsCount'` (number of questions changed):
 *   Recalculates the dependent timer based on `preferredDriver` ('questionSeconds' default if > 0, else 'totalMinutes').
 */
export function synchronizeExamTimers(params: {
  questionsCount: number;
  durationMinutes: number;
  questionDurationSeconds: number;
  changedField: 'questionSeconds' | 'totalMinutes' | 'questionsCount';
  preferredDriver?: 'questionSeconds' | 'totalMinutes';
}): {
  durationMinutes: number;
  questionDurationSeconds: number;
  totalSeconds: number;
} {
  const count = Math.max(1, Math.round(params.questionsCount || 1));
  let durationMinutes = Math.max(0, Number(params.durationMinutes) || 0);
  let questionDurationSeconds = Math.max(0, Number(params.questionDurationSeconds) || 0);

  if (params.changedField === 'questionSeconds') {
    if (questionDurationSeconds > 0) {
      const totalSec = questionDurationSeconds * count;
      durationMinutes = Math.max(1, Math.ceil(totalSec / 60));
      return { durationMinutes, questionDurationSeconds, totalSeconds: totalSec };
    }
    return { durationMinutes, questionDurationSeconds: 0, totalSeconds: durationMinutes * 60 };
  }

  if (params.changedField === 'totalMinutes') {
    if (durationMinutes > 0) {
      const totalSec = durationMinutes * 60;
      questionDurationSeconds = Math.max(5, Math.round(totalSec / count));
      return { durationMinutes, questionDurationSeconds, totalSeconds: totalSec };
    }
    return { durationMinutes: 0, questionDurationSeconds: 0, totalSeconds: 0 };
  }

  // changedField === 'questionsCount'
  const driver = params.preferredDriver || (questionDurationSeconds > 0 ? 'questionSeconds' : 'totalMinutes');
  if (driver === 'questionSeconds' && questionDurationSeconds > 0) {
    const totalSec = questionDurationSeconds * count;
    durationMinutes = Math.max(1, Math.ceil(totalSec / 60));
    return { durationMinutes, questionDurationSeconds, totalSeconds: totalSec };
  } else if (durationMinutes > 0) {
    const totalSec = durationMinutes * 60;
    questionDurationSeconds = Math.max(5, Math.round(totalSec / count));
    return { durationMinutes, questionDurationSeconds, totalSeconds: totalSec };
  }

  return {
    durationMinutes,
    questionDurationSeconds,
    totalSeconds: durationMinutes * 60
  };
}

// ---------------------------------------------------------------------------
// 5. Ready-to-Use Medical Assessment Sample Templates (Arabic, English, Bilingual)
// ---------------------------------------------------------------------------

export const SAMPLE_BULK_TEXT_TEMPLATE = `اللغة: عربي
العنوان: اختبار منتصف بلوك القلب والأوعية الدموية (CVS)
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

3. [إكمال الفراغ] الهرمون الرئيسي المسؤول عن تحفيز إنتاج كريات الدم الحمراء في نخاع العظم استجابةً لنقص الأكسجة الكلوية هو __________.
الإجابة: الإريثروبويتين (Erythropoietin - EPO)
التعليل: يُفرز هرمون الإريثروبويتين من الخلايا الخلالية حول النبيبات في الكلية لتحفيز سلائف الكريات الحمر.

4. [سؤال مقالي] اذكر الخطوات العلاجية الإسعافية الثلاث الأولى لمريض يعاني من صدمة الحساسية المفرطة (Anaphylaxis) في قسم الطوارئ مع تحديد الجرعة ومكان الحقن.
الإجابة النموذجية: 1. حقن الأدرينالين (Epinephrine) عضلياً في العضلة المتسعة الوحشية للفخذ بجرعة 0.5 ملغ (1:1000). 2. تأمين مجرى التنفس وإعطاء الأكسجين عالي التدفق. 3. تركيب خطين وريديين واسعين وبدء السوائل الوريدية البلورية (Normal Saline).
التعليل: الأدرينالين هو العلاج المنقذ للحياة ويجب حقنه فوراً بدون أي تأخير لعكس التوسع الوعائي والتشنج القصبي.
النقاط: 10`;

export const SAMPLE_BULK_TEXT_TEMPLATE_EN = `Language: English
Title: Cardiovascular System (CVS) Block Midterm Exam
Type: Exam
Level: Level 4
Batch: Batch 6
Subject: Cardiovascular System (CVS-401)
Duration: 30 minutes
Question Timer: 45 seconds

1. A 58-year-old male presents to the emergency department with crushing substernal chest pain and diaphoresis. ECG shows ST-segment elevation in leads II, III, and aVF. Occlusion of which coronary artery is the most likely cause?
A) Left Anterior Descending Artery (LAD) (Rationale: Incorrect, supplies the anterior wall and septum, leads V1-V4)
B) Right Coronary Artery (RCA) * (Rationale: Correct, supplies the inferior wall in 85% of right-dominant hearts)
C) Left Circumflex Artery (LCx) (Rationale: Incorrect, supplies the lateral wall, leads I, aVL, V5-V6)
D) Left Main Coronary Artery (LMCA) (Rationale: Incorrect, causes extensive anterolateral myocardial infarction)
Answer: B
Rationale: Inferior STEMI (leads II, III, aVF) is classically caused by occlusion of the Right Coronary Artery (RCA) via the posterior descending artery.

2. [True/False] Angiotensin-Converting Enzyme (ACE) inhibitors are strictly contraindicated during pregnancy due to the risk of fetal renal dysplasia and oligohydramnios.
A) True (Rationale: Correct, ACEIs/ARBs cause fetal renal failure and Potter sequence)
B) False (Rationale: Incorrect, they carry an FDA Black Box Warning for fetotoxicity)
Answer: True
Rationale: ACE inhibitors and ARBs are teratogenic and must be discontinued immediately in pregnancy; labetalol, nifedipine, or methyldopa are safe alternatives.

3. [Fill in the blank] The primary hormone responsible for stimulating red blood cell production in response to renal hypoxia is __________.
Answer: Erythropoietin (EPO)
Rationale: Erythropoietin is synthesized by peritubular interstitial cells of the kidney in response to cellular hypoxia.

4. [Essay] List the first three immediate life-saving steps in the emergency management of acute anaphylactic shock, including the first-line drug, dose, and route of administration.
Model Answer: 1. Intramuscular (IM) Epinephrine 0.3–0.5 mg (1:1000) into the mid-anterolateral thigh (vastus lateralis). 2. Airway assessment and high-flow 100% supplemental oxygen. 3. Two large-bore IV lines with rapid isotonic crystalloid (0.9% Normal Saline) bolus for hypotension.
Rationale: Immediate IM epinephrine reverses bronchospasm and vasodilation and prevents progression to cardiovascular collapse.
Points: 10`;

export const SAMPLE_BULK_TEXT_TEMPLATE_BILINGUAL = `اللغة: ثنائي اللغة (عربي + إنجليزي)
العنوان: الاختبار السريري الموحد لبلوك القلب (CVS Bilingual Exam)
النوع: اختبار
المستوى: المستوى الرابع
الدفعة: الدفعة السادسة
المدة: 30 دقيقة
مؤقت السؤال: 45 ثانية

1. مريض يبلغ من العمر 58 عاماً حضر للطوارئ بألم صدري ضاغط مع ارتفاع القطعة ST في المساري II, III, aVF. أي الشرايين التاجية هو الأكثر احتمالاً للإصابة؟
A 58-year-old male presents with crushing chest pain and ST-segment elevation in leads II, III, and aVF. Which coronary artery is most likely occluded?
أ) الشريان الأمامي النازل الأيسر / Left Anterior Descending (LAD) (التعليل: يغذي الجدار الأمامي والحاجز البطيني)
ب) الشريان التاجي الأيمن / Right Coronary Artery (RCA) * (التعليل: صحيح لأنه يغذي الجدار السفلي للقلب في 85% من الحالات)
ج) الشريان المنعطف الأيسر / Left Circumflex (LCx) (التعليل: يغذي الجدار الجانبي للبطين الأيسر)
د) الجذع التاجي الأيسر الرئيسي / Left Main Coronary Artery (التعليل: يسبب احتشاءً أمامياً وجانبياً واسعاً)
الإجابة: ب
التعليل: ارتفاع القطعة ST في المساري السفلية (II, III, aVF) يدل على احتشاء الجدار السفلي المغذى بالشريان التاجي الأيمن (RCA).

2. [صح وخطأ] يُمنع استخدام مثبطات الإنزيم المحول للأنجيوتنسين (ACE Inhibitors) أثناء الحمل بسبب خطر الفشل الكلوي الجنيني.
ACE inhibitors are strictly contraindicated during pregnancy due to the risk of fetal renal dysplasia.
أ) صح / True (التعليل: صحيح لأنها تسبب قصوراً كلوياً جنينياً وقلة السائل الأمنيوسي)
ب) خطأ / False (التعليل: خطأ لأنها ممنوعة قطعياً في جميع مراحل الحمل)
الإجابة: صح
التعليل: مثبطات ACE تسبب تشوهات كلوية جنينية خطيرة وتستبدل بأدوية آمنة مثل اللابيتالول أو المثيل دوبا.`;

export const SAMPLE_BULK_CSV_TEMPLATE = `السؤال,نوع السؤال,خيار أ,تعليل أ,خيار ب,تعليل ب,خيار ج,تعليل ج,خيار د,تعليل د,الإجابة الصحيحة,التعليل العام,النقاط
"ما هو الصمام القلبي الذي يُسمع في الورب الخامس الأيسر عند خط منتصف الترقوة؟","mcq","الصمام الأبهري","يسمع في الورب الثاني الأيمن","الصمام الرئوي","يسمع في الورب الثاني الأيسر","الصمام التاجي (الميترالي)","صحيح لأنه يقع في قمة القلب","الصمام ثلاثي الشرف","يسمع عند الحافة اليسرى لعظم القص","ج","بؤرة التسمع التاجية تقع في قمة القلب عند الورب الخامس الأيسر.",5
"البنسلين هو العلاج المعياري الأول لالتهاب البلعوم العقدي للوقاية من الحمى الروماتيزمية.","true_false","صح","صحيح لأنه يقضي على المكورات العقدية","خطأ","غير صحيح","","","","","أ","البنسلين هو الخيار الأول المثبت للوقاية من الحمى الروماتيزمية.",5`;

export function getSampleTemplateByLanguage(lang: AssessmentLanguage): string {
  if (lang === 'en') return SAMPLE_BULK_TEXT_TEMPLATE_EN;
  if (lang === 'bilingual') return SAMPLE_BULK_TEXT_TEMPLATE_BILINGUAL;
  return SAMPLE_BULK_TEXT_TEMPLATE;
}

// ---------------------------------------------------------------------------
// 6. Professional & Dynamic AI Prompt Builder for UMED Smart Exam Creator
// ---------------------------------------------------------------------------

export interface AiPromptGeneratorConfig {
  mode: 'generate_new' | 'format_existing';
  language: AssessmentLanguage; // 'ar' | 'en' | 'bilingual'
  assessmentType: 'exam' | 'competition';
  questionTypeMode?: BankQuestionTypeMode; // 'hybrid' | 'mcq' | 'true_false' | 'essay' | 'fill_blank'
  isDynamicQuestionCount?: boolean; // true = dynamic open count based on content; false = custom user counts
  title?: string;
  topic?: string;
  universityName?: string;
  collegeName?: string;
  programName?: string;
  studyLevelName?: string;
  blockName?: string;
  batchName?: string;
  durationMinutes?: number;
  questionDurationSeconds?: number;
  mcqCount?: number;
  optionsCount?: 4 | 5;
  trueFalseCount?: number;
  essayCount?: number;
  fillBlankCount?: number;
  difficultyMix?: 'balanced' | 'clinical_usmle' | 'foundational';
  includeOptionRationales?: boolean;
}

/**
 * Generates a crystal-clear, highly structured, professional AI Prompt
 * tailored to the user's selected Language ('ar' | 'en' | 'bilingual'),
 * Question Type Mode ('hybrid' | 'mcq' | 'true_false' | 'essay' | 'fill_blank'),
 * Dynamic vs Fixed Question Count, and Saved Academic Context (University, Specialty, Study Level, Block).
 */
export function buildProfessionalAiPrompt(config: AiPromptGeneratorConfig): string {
  const {
    mode = 'generate_new',
    language = 'ar',
    assessmentType = 'exam',
    questionTypeMode = 'hybrid',
    isDynamicQuestionCount = true,
    title = '',
    topic = '',
    universityName = '',
    collegeName = '',
    programName = '',
    studyLevelName = 'المستوى الثاني',
    blockName = '',
    batchName = '',
    durationMinutes = 30,
    questionDurationSeconds = 45,
    mcqCount = 10,
    optionsCount = 4,
    trueFalseCount = 2,
    essayCount = 1,
    fillBlankCount = 2,
    difficultyMix = 'clinical_usmle',
    includeOptionRationales = true
  } = config;

  // Compute effective question counts when fixed count mode is selected
  const effectiveMcq = questionTypeMode === 'mcq' ? (mcqCount || 15) : questionTypeMode === 'hybrid' ? mcqCount : 0;
  const effectiveTf = questionTypeMode === 'true_false' ? (trueFalseCount || 10) : questionTypeMode === 'hybrid' ? trueFalseCount : 0;
  const effectiveEssay = questionTypeMode === 'essay' ? (essayCount || 5) : questionTypeMode === 'hybrid' ? essayCount : 0;
  const effectiveFillBlank = questionTypeMode === 'fill_blank' ? (fillBlankCount || 10) : questionTypeMode === 'hybrid' ? (fillBlankCount || 0) : 0;
  const totalRequested = (Number(effectiveMcq) || 0) + (Number(effectiveTf) || 0) + (Number(effectiveEssay) || 0) + (Number(effectiveFillBlank) || 0);

  const includeMcqExample = questionTypeMode === 'hybrid' || questionTypeMode === 'mcq';
  const includeTfExample = questionTypeMode === 'true_false' || (questionTypeMode === 'hybrid' && (isDynamicQuestionCount || effectiveTf > 0));
  const includeFillBlankExample = questionTypeMode === 'fill_blank' || (questionTypeMode === 'hybrid' && effectiveFillBlank > 0);
  const includeEssayExample = questionTypeMode === 'essay' || (questionTypeMode === 'hybrid' && (isDynamicQuestionCount || effectiveEssay > 0));

  if (language === 'en') {
    const resolvedTopic = topic.trim() || blockName.trim() || '[Insert Medical Topic / Lecture / Block Here]';
    const resolvedTitle = title.trim() || `${resolvedTopic} ${assessmentType === 'competition' ? 'Competition' : 'Exam'}`;
    const styleDesc =
      difficultyMix === 'clinical_usmle'
        ? 'USMLE / NBME-style clinical vignettes (patient presentation, vitals, lab/imaging findings, and high-yield clinical decision-making)'
        : difficultyMix === 'foundational'
        ? 'Clear foundational medical science concepts, mechanisms, and direct recall'
        : 'Balanced mix (50% clinical case vignettes and 50% high-yield medical concepts)';

    const typeModeDescEn =
      questionTypeMode === 'mcq'
        ? `Multiple Choice Questions ONLY (${optionsCount} options per question)`
        : questionTypeMode === 'true_false'
        ? 'True / False Questions ONLY'
        : questionTypeMode === 'essay'
        ? 'Clinical Essay / Short-Answer Questions ONLY'
        : questionTypeMode === 'fill_blank'
        ? 'Fill-in-the-Blank Medical Questions ONLY'
        : `Hybrid Comprehensive Bank (Multiple Choice ${optionsCount}-options, True/False, Fill-in-the-Blank, and Clinical Essay)`;

    const countSpecEn = isDynamicQuestionCount
      ? `DYNAMIC & COMPREHENSIVE (Open Count — do NOT limit to a fixed number; generate or extract as many questions as needed to thoroughly cover all high-yield points of the topic/lecture)`
      : `Fixed Target Count (Total: ${totalRequested} Questions):
  ${effectiveMcq > 0 ? `* Multiple Choice Questions (MCQ - ${optionsCount} options): ${effectiveMcq} questions\n  ` : ''}${effectiveTf > 0 ? `* True / False Questions: ${effectiveTf} questions\n  ` : ''}${effectiveFillBlank > 0 ? `* Fill-in-the-Blank Questions: ${effectiveFillBlank} questions\n  ` : ''}${effectiveEssay > 0 ? `* Clinical Essay Questions: ${effectiveEssay} questions` : ''}`.trim();

    const optionLetters = optionsCount === 5 ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
    const optionTemplateLines = optionLetters
      .map(
        (ltr, i) =>
          `${ltr}) [Option ${ltr} text]${i === 1 ? ' *' : ''}${
            includeOptionRationales ? ` (Rationale: ${i === 1 ? 'Correct because...' : 'Incorrect because...'})` : ''
          }`
      )
      .join('\n');

    return `You are a Senior Medical Education Professor and Assessment Architect for the UMED Medical Platform.
${
  mode === 'generate_new'
    ? `Your task is to GENERATE a complete, rigorous, high-yield medical ${assessmentType === 'competition' ? 'competition' : 'exam'} in **Professional Medical English** based on the specifications below.`
    : `Your task is to CONVERT, CLEAN, and STANDARDIZE the raw medical questions or lecture material I provide below into UMED's exact **Professional Medical English** format without omitting any question.`
}

==================================================
1. ACADEMIC CONTEXT & ASSESSMENT SPECIFICATIONS
==================================================
- Target Language: Pure Medical English (EN)
${universityName ? `- University / Institution: ${universityName}${collegeName ? ` — ${collegeName}` : ''}\n` : ''}${programName ? `- Academic Program / Specialty: ${programName}\n` : ''}- Study Level / Year: ${studyLevelName}
${blockName ? `- Medical Block / Course: ${blockName}\n` : ''}- Topic / Block / Subject: ${resolvedTopic}
- Question Bank Type: ${typeModeDescEn}
- Question Count Policy: ${countSpecEn}
- Academic & Clinical Style: ${styleDesc}

==================================================
2. STRICT UMED OUTPUT FORMAT (MANDATORY)
==================================================
Output the entire response inside a SINGLE plain-text code block (\`\`\`text ... \`\`\`) starting with the metadata header and followed immediately by the numbered questions. Do NOT use markdown bolding (**...**) around question numbers or option letters.

\`\`\`text
Language: English
Title: ${resolvedTitle}
Type: ${assessmentType === 'competition' ? 'Competition' : 'Exam'}
Level: ${studyLevelName}
${batchName ? `Batch: ${batchName}\n` : ''}Subject: ${resolvedTopic}
Duration: ${durationMinutes} minutes
Question Timer: ${questionDurationSeconds} seconds
${
  includeMcqExample
    ? `
1. [Full clinical vignette or question stem in English]
${optionTemplateLines}
Answer: B
Rationale: [Concise clinical explanation of why the correct option is right and key differential points]
`
    : ''
}${
  includeTfExample
    ? `
2. [True/False] [Clear, unambiguous medical statement in English]
A) True (Rationale: [Why True is correct/incorrect])
B) False (Rationale: [Why False is correct/incorrect])
Answer: [True or False]
Rationale: [Overall medical explanation]
`
    : ''
}${
  includeFillBlankExample
    ? `
3. [Fill in the blank] The primary hormone responsible for stimulating red blood cell production in response to renal hypoxia is __________.
Answer: Erythropoietin (EPO)
Rationale: Erythropoietin is synthesized by peritubular interstitial cells of the kidney in response to hypoxia.
`
    : ''
}${
  includeEssayExample
    ? `
4. [Essay] [Clinical scenario or structured short-answer question]
Model Answer: [Numbered key clinical points / grading rubric required for full marks]
Rationale: [Core pathophysiology or clinical guideline summary]
Points: 10
`
    : ''
}\`\`\`

CRITICAL RULES FOR UMED PARSER COMPATIBILITY:
1. Separate each question from the next with ONE blank line.
2. Always include the \`Answer:\` (or \`Model Answer:\`) line below each question.
3. Never write conversational intros or summaries outside the code block.

${mode === 'generate_new' ? `Now, generate the questions dynamically for Level (${studyLevelName}) — Topic: ${resolvedTopic}` : 'Now, convert and standardize all the following content without skipping any item:'}`;
  }

  if (language === 'bilingual') {
    const resolvedTopic = topic.trim() || blockName.trim() || '[اكتب اسم البلوك أو الموضوع الطبي هنا]';
    const resolvedTitle = title.trim() || `${assessmentType === 'competition' ? 'مسابقة' : 'اختبار'} ${resolvedTopic} (Bilingual)`;

    const typeModeDescBi =
      questionTypeMode === 'mcq'
        ? `اختيار من متعدد فقط (MCQ - ${optionsCount} خيارات لكل سؤال)`
        : questionTypeMode === 'true_false'
        ? 'صح وخطأ فقط (True / False)'
        : questionTypeMode === 'essay'
        ? 'أسئلة مقالية سريرية فقط (Clinical Essay)'
        : questionTypeMode === 'fill_blank'
        ? 'أسئلة إكمال الفراغ فقط (Fill in the Blank)'
        : `بنك هجين شامل (اختيار من متعدد + صح وخطأ + إكمال الفراغ + مقالي)`;

    const countSpecBi = isDynamicQuestionCount
      ? `عدد ديناميكي مفتوح وشامل (غير مقيد بعدد ثابت — ولّد أو استخرج كافة الأسئلة اللازمة لتغطية جميع النقاط العلمية والسريرية للمحاضرة أو البلوك بشكل وافٍ)`
      : `عدد محدد (${totalRequested} سؤال إجمالاً: ${effectiveMcq} اختيارات، ${effectiveTf} صح وخطأ، ${effectiveFillBlank} إكمال فراغ، ${effectiveEssay} مقالي)`;

    return `أنت بروفيسور في التعليم الطبي وخبير معتمد في صياغة الامتحانات الطبية ثنائية اللغة (العربية + الإنجليزية) لمنصة UMED الطبية.
${
  mode === 'generate_new'
    ? `مهمتك: توليد ${assessmentType === 'competition' ? 'مسابقة طبية تنافسية' : 'اختبار أكاديمي طبي'} احترافي **ثنائي اللغة (عربي + إنجليزي معاً)** مخصص بدقة للمستوى والبلوك المحددين أدناه.`
    : `مهمتك: تحويل وتنسيق الأسئلة أو المحاضرة المرفقة أدناه إلى صيغة منصة UMED القياسية **ثنائية اللغة (عربي + إنجليزي)** بدقة 100% دون حذف أي سؤال.`
}

==================================================
أولاً: السياق الأكاديمي ومواصفات الاختبار
==================================================
- لغة الاختبار: ثنائي اللغة (Bilingual: Arabic + Medical English)
${universityName ? `- الجامعة والكلية: ${universityName}${collegeName ? ` — ${collegeName}` : ''}\n` : ''}${programName ? `- التخصص / البرنامج: ${programName}\n` : ''}- المستوى الدراسي المستهدف: ${studyLevelName} (التزم بمستوى طالب ${studyLevelName} ولا تخلطه بمستويات أخرى)
${blockName ? `- البلوك / المقرر المعتمد: ${blockName}\n` : ''}- البلوك / المقرر الطبي: ${resolvedTopic}
- نوع البنك / الأسئلة: ${typeModeDescBi}
- سياسة عدد الأسئلة: ${countSpecBi}

==================================================
ثانياً: القالب الإلزامي المعتمد في نظام UMED
==================================================
أخرج النتيجة كاملة داخل مربع كود نصي واحد فقط (\`\`\`text ... \`\`\`) يبدأ بالترويسة التالية متبوعة بالأسئلة مباشرة دون أي نجوم تنسيق عريض (**):

\`\`\`text
اللغة: ثنائي اللغة (عربي + إنجليزي)
العنوان: ${resolvedTitle}
النوع: ${assessmentType === 'competition' ? 'مسابقة' : 'اختبار'}
المستوى: ${studyLevelName}
${batchName ? `الدفعة: ${batchName}\n` : ''}المادة: ${resolvedTopic}
المدة: ${durationMinutes} دقيقة
مؤقت السؤال: ${questionDurationSeconds} ثانية
${
  includeMcqExample
    ? `
1. [نص السؤال أو الحالة السريرية باللغة العربية الفصحى]
[Exact English clinical vignette / question stem on the second line]
أ) [الخيار الأول بالعربية / Option A in English]${includeOptionRationales ? ' (التعليل: سبب صحة أو خطأ هذا الخيار)' : ''}
ب) [الخيار الثاني بالعربية / Option B in English] *${includeOptionRationales ? ' (التعليل: صحيح لأن...)' : ''}
ج) [الخيار الثالث بالعربية / Option C in English]${includeOptionRationales ? ' (التعليل: سبب صحة أو خطأ هذا الخيار)' : ''}
د) [الخيار الرابع بالعربية / Option D in English]${includeOptionRationales ? ' (التعليل: سبب صحة أو خطأ هذا الخيار)' : ''}${
        optionsCount === 5
          ? `\nهـ) [الخيار الخامس بالعربية / Option E in English]${includeOptionRationales ? ' (التعليل: سبب صحة أو خطأ هذا الخيار)' : ''}`
          : ''
      }
الإجابة: ب
التعليل: [التعليل الطبي الشامل للسؤال باللغتين أو بالعربية مع المصطلحات الإنجليزية]
`
    : ''
}${
  includeTfExample
    ? `
2. [صح وخطأ] [نص العبارة الطبية بالعربية]
[English translation of the medical statement]
أ) صح / True (التعليل: ...)
ب) خطأ / False (التعليل: ...)
الإجابة: صح
التعليل: [الشرح الطبي الدقيق للعبارة]
`
    : ''
}${
  includeFillBlankExample
    ? `
3. [إكمال الفراغ] الهرمون الرئيسي المسؤول عن تحفيز إنتاج كريات الدم الحمراء استجابةً لنقص الأكسجة الكلوية هو __________.
The primary hormone stimulating erythropoiesis in response to renal hypoxia is __________.
الإجابة: الإريثروبويتين / Erythropoietin (EPO)
التعليل: يفرز هرمون الإريثروبويتين من الخلايا الخلالية حول النبيبات في الكلية لتحفيز نقي العظم.
`
    : ''
}${
  includeEssayExample
    ? `
4. [سؤال مقالي] [نص السؤال السريري بالعربية]
[English translation of the clinical essay question]
الإجابة النموذجية: [عناصر الإجابة النموذجية الكاملة وسلّم التقييم بالعربية والإنجليزية]
التعليل: [الملخص السريري والعلمي]
النقاط: 10
`
    : ''
}\`\`\`

${mode === 'generate_new' ? `ابدأ الآن بتوليد الأسئلة لمستوى (${studyLevelName}) حول موضوع: ${resolvedTopic}` : 'ابدأ الآن بتحويل وتنسيق المحتوى التالي بالكامل:'}`;
  }

  // Default: Arabic ('ar') with clear medical terminology
  const resolvedTopic = topic.trim() || blockName.trim() || '[اكتب اسم البلوك أو الموضوع الطبي أو المحاضرة هنا]';
  const resolvedTitle = title.trim() || `${assessmentType === 'competition' ? 'مسابقة' : 'اختبار'} ${resolvedTopic}`;
  const styleDescAr =
    difficultyMix === 'clinical_usmle'
      ? 'حالات سريرية واقعية (Clinical Vignettes) تحاكي اختبارات الكفاءة والـ USMLE (شكوى المريض، العلامات الحيوية، الفحوصات، والتشخيص أو التدبير العلاجي الأدق)'
      : difficultyMix === 'foundational'
      ? 'أسئلة مفاهيمية وأساسية مباشرة تقيس الفهم العميق للعلوم الطبية الأساسية والسريرية'
      : 'مزيج متوازن (50% حالات سريرية تطبيقية + 50% مفاهيم طبية مباشرة عالية الأهمية)';

  const typeModeDescAr =
    questionTypeMode === 'mcq'
      ? `اختيارات فقط (اختيار من متعدد MCQ — ${optionsCount} خيارات لكل سؤال)`
      : questionTypeMode === 'true_false'
      ? 'صح وخطأ فقط (صواب وخطأ مع التعليل)'
      : questionTypeMode === 'essay'
      ? 'أسئلة مقالية سريرية فقط (مع الإجابة النموذجية)'
      : questionTypeMode === 'fill_blank'
      ? 'أسئلة إكمال الفراغ فقط (أكمل الفراغ بالمصطلح الطبي الدقيق)'
      : `بنك هجين شامل (يجمع بين الاختيار من متعدد، صح وخطأ، إكمال الفراغ، والأسئلة المقالية حسب طبيعة المحتوى)`;

  const countSpecAr = isDynamicQuestionCount
    ? `عدد ديناميكي مفتوح وشامل (غير مقيد بعدد ثابت — قم بتوليد أو استخراج جميع الأسئلة اللازمة لتغطية كافة تفاصيل المحاضرة أو البلوك الطبي دون حصرها بعدد ضيق)`
    : `عدد مخصص ومحدد (الإجمالي: ${totalRequested} سؤال):
  ${effectiveMcq > 0 ? `* أسئلة اختيار من متعدد (MCQ - ${optionsCount} خيارات): ${effectiveMcq} سؤال\n  ` : ''}${effectiveTf > 0 ? `* أسئلة صواب وخطأ (صح وخطأ): ${effectiveTf} سؤال\n  ` : ''}${effectiveFillBlank > 0 ? `* أسئلة إكمال الفراغ: ${effectiveFillBlank} سؤال\n  ` : ''}${effectiveEssay > 0 ? `* أسئلة مقالية سريرية: ${effectiveEssay} سؤال` : ''}`.trim();

  return `أنت بروفيسور في التعليم الطبي وخبير معتمد في إعداد بنوك الأسئلة والامتحانات الطبية لمنصة UMED.
${
  mode === 'generate_new'
    ? `مهمتك: توليد ${assessmentType === 'competition' ? 'مسابقة طبية تنافسية' : 'اختبار أكاديمي طبي'} متكامل واحترافي **باللغة العربية الفصحى** (مع كتابة المصطلحات الطبية الإنجليزية الأساسية بين قوسين) ومطابق تماماً للمستوى الدراسي والبلوك المحددين أدناه.`
    : `مهمتك: تحويل وتنسيق أي ملف أو نص أسئلة أو محاضرة أرسلها لك إلى صيغة منصة UMED القياسية **باللغة العربية الطبية** بدقة 100% دون حذف أي سؤال أو تغيير الإجابات الصحيحة المعتمدة.`
}

==================================================
أولاً: السياق الأكاديمي ومواصفات الاختبار المطلوب
==================================================
- لغة الاختبار: العربية الطبية الفصحى (مع المصطلحات الإنجليزية المعيارية بين قوسين)
${universityName ? `- الجامعة والكلية: ${universityName}${collegeName ? ` — ${collegeName}` : ''}\n` : ''}${programName ? `- التخصص الأكاديمي: ${programName}\n` : ''}- المستوى الدراسي المستهدف: ${studyLevelName} (مهم جداً: صِغ الأسئلة بما يناسب منهج ${studyLevelName} حصراً ولا تنسبها لأي سنة دراسية أخرى)
${blockName ? `- البلوك / المقرر المعتمد: ${blockName}\n` : ''}- الموضوع / البلوك / المحاضرة: ${resolvedTopic}
- نوع البنك / الأسئلة المطلوبة: ${typeModeDescAr}
- سياسة عدد الأسئلة: ${countSpecAr}
- المستوى والأسلوب العلمي: ${styleDescAr}

==================================================
ثانياً: القالب الإلزامي المعتمد في نظام UMED
==================================================
أخرج النتيجة كاملة داخل مربع كود نصي واحد فقط (\`\`\`text ... \`\`\`) يبدأ بالترويسة التلقائية ثم الأسئلة مباشرة، بدون استخدام علامات الخط العريض (**) حول أرقام الأسئلة أو حروف الخيارات:

\`\`\`text
اللغة: عربي
العنوان: ${resolvedTitle}
النوع: ${assessmentType === 'competition' ? 'مسابقة' : 'اختبار'}
المستوى: ${studyLevelName}
${batchName ? `الدفعة: ${batchName}\n` : ''}المادة: ${resolvedTopic}
المدة: ${durationMinutes} دقيقة
مؤقت السؤال: ${questionDurationSeconds} ثانية
${
  includeMcqExample
    ? `
1. [نص السؤال الطبي أو الحالة السريرية بوضوح]
أ) [نص الخيار الأول]${includeOptionRationales ? ' (التعليل: سبب خطأ هذا الخيار طبياً)' : ''}
ب) [نص الخيار الثاني الصحيح] *${includeOptionRationales ? ' (التعليل: صحيح لأن...)' : ''}
ج) [نص الخيار الثالث]${includeOptionRationales ? ' (التعليل: سبب خطأ هذا الخيار طبياً)' : ''}
د) [نص الخيار الرابع]${includeOptionRationales ? ' (التعليل: سبب خطأ هذا الخيار طبياً)' : ''}${
        optionsCount === 5
          ? `\nهـ) [نص الخيار الخامس]${includeOptionRationales ? ' (التعليل: سبب خطأ هذا الخيار طبياً)' : ''}`
          : ''
      }
الإجابة: ب
التعليل: [التعليل الطبي الشامل للسؤال في سطرين يوضح آلية الإجابة الصحيحة وأهم الفروقات التشخيصية]
`
    : ''
}${
  includeTfExample
    ? `
2. [صح وخطأ] [نص العبارة الطبية الدقيقة]
أ) صح (التعليل: [سبب الصحة أو الخطأ])
ب) خطأ (التعليل: [سبب الصحة أو الخطأ])
الإجابة: [صح أو خطأ]
التعليل: [الشرح الطبي المعتمد للعبارة]
`
    : ''
}${
  includeFillBlankExample
    ? `
3. [إكمال الفراغ] الهرمون الرئيسي المسؤول عن تحفيز إنتاج كريات الدم الحمراء في نخاع العظم استجابةً لنقص الأكسجة هو __________.
الإجابة: الإريثروبويتين (Erythropoietin - EPO)
التعليل: يُفرز هرمون الإريثروبويتين من الكلية استجابةً لنقص الأكسجة الأنسجة لتحفيز تكوين الكريات الحمر.
`
    : ''
}${
  includeEssayExample
    ? `
4. [سؤال مقالي] [نص السؤال السريري المقالي]
الإجابة النموذجية: [النقاط الطبية الأساسية المطلوبة في إجابة الطالب مرتبة بوضوح]
التعليل: [الشرح العلمي والمرجعي للسؤال]
النقاط: 10
`
    : ''
}\`\`\`

قواعد صارمة لضمان التعرف الفوري في منصة UMED:
1. افصل بين كل سؤال والذي يليه بسطر فارغ واحد.
2. في أسئلة الاختيارات ضع علامة النجمة \`*\` بجوار الخيار الصحيح مع سطر \`الإجابة:\` أسفل الخيارات، وفي إكمال الفراغ والمقالي اكتب سطر \`الإجابة:\` أو \`الإجابة النموذجية:\`.
3. لا تكتب أي مقدمات أو عبارات ترحيبية خارج مربع الكود (\`\`\`text).

${mode === 'generate_new' ? `ابدأ الآن بتوليد الأسئلة لمستوى (${studyLevelName}) حول موضوع: ${resolvedTopic}` : 'الآن طبّق هذه القواعد بدقة 100% على المحتوى التالي:'}`;
}

export const UMED_AI_UNIVERSAL_PROMPT_ARABIC = buildProfessionalAiPrompt({
  mode: 'format_existing',
  language: 'ar',
  assessmentType: 'exam',
  questionTypeMode: 'hybrid',
  isDynamicQuestionCount: true,
  difficultyMix: 'clinical_usmle',
  includeOptionRationales: true
});

export const UMED_AI_UNIVERSAL_PROMPT_ENGLISH = buildProfessionalAiPrompt({
  mode: 'format_existing',
  language: 'en',
  assessmentType: 'exam',
  questionTypeMode: 'hybrid',
  isDynamicQuestionCount: true,
  difficultyMix: 'clinical_usmle',
  includeOptionRationales: true
});

export const UMED_AI_UNIVERSAL_PROMPT_BILINGUAL = buildProfessionalAiPrompt({
  mode: 'format_existing',
  language: 'bilingual',
  assessmentType: 'exam',
  questionTypeMode: 'hybrid',
  isDynamicQuestionCount: true,
  difficultyMix: 'clinical_usmle',
  includeOptionRationales: true
});



