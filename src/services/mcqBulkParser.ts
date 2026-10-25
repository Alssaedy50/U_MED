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
  QuestionValidationIssue
} from '../types/umed.ts';

const OPTION_IDS = ['opt-a', 'opt-b', 'opt-c', 'opt-d'] as const;

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
 * Maps any Arabic/English letter, number, or option text to canonical 'opt-a' | 'opt-b' | 'opt-c' | 'opt-d'.
 */
export function resolveCanonicalOptionId(
  rawToken: string,
  options: QuestionOption[] = []
): string {
  if (!rawToken) return '';
  const cleaned = rawToken.trim();
  const lower = cleaned.toLowerCase();

  if (lower === 'opt-a' || lower === 'a' || cleaned === 'أ' || cleaned === 'ا' || lower === '1' || lower === 'option a' || cleaned === 'خيار أ' || cleaned === 'الخيار أ') {
    return 'opt-a';
  }
  if (lower === 'opt-b' || lower === 'b' || cleaned === 'ب' || lower === '2' || lower === 'option b' || cleaned === 'خيار ب' || cleaned === 'الخيار ب') {
    return 'opt-b';
  }
  if (lower === 'opt-c' || lower === 'c' || cleaned === 'ج' || cleaned === 'ت' || lower === '3' || lower === 'option c' || cleaned === 'خيار ج' || cleaned === 'الخيار ج') {
    return 'opt-c';
  }
  if (lower === 'opt-d' || lower === 'd' || cleaned === 'د' || cleaned === 'ث' || lower === '4' || lower === 'option d' || cleaned === 'خيار د' || cleaned === 'الخيار د') {
    return 'opt-d';
  }

  // Extract leading letter/number from patterns like "A) ...", "ب - ...", "(ج)"
  const prefixMatch = cleaned.match(/^[([\s]*([A-Da-dأابجدتث1-4])[)\].\-:\s]*$/u);
  if (prefixMatch) {
    return resolveCanonicalOptionId(prefixMatch[1], options);
  }

  const leadingTokenMatch = cleaned.match(/^(?:خيار|الخيار|option)?\s*[\(\[]?([A-Da-dأابجد1-4])[\)\]]?(?:\s|$)/iu);
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
 * Validates a parsed question draft and populates its `issues`, `isValid`, and duplicate flags.
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

    // Ensure 4 canonical options exist for UMED consistency
    const normalizedOptions: QuestionOption[] = OPTION_IDS.map((optId, optIdx) => {
      const found = draft.options.find(o => o.id === optId) || draft.options[optIdx];
      return {
        id: optId,
        textArabic: (found?.textArabic || '').trim(),
        ...(found?.textEnglish ? { textEnglish: found.textEnglish.trim() } : {})
      };
    });

    const contentHash = computeQuestionFingerprint(stemAr, stemEn, normalizedOptions);
    const normStem = normalizeMedicalText(stemAr);

    // 1. Validate Stem
    if (!stemAr || stemAr.length < 4) {
      issues.push({
        code: 'MISSING_STEM',
        severity: 'error',
        messageArabic: 'نص السؤال مفقود أو قصير جداً'
      });
    }

    // 2. Validate Options
    const nonEmptyOptions = normalizedOptions.filter(o => o.textArabic.length > 0 && o.textArabic !== 'غير محدد');
    if (nonEmptyOptions.length < 2) {
      issues.push({
        code: 'INSUFFICIENT_OPTIONS',
        severity: 'error',
        messageArabic: 'يجب توفير خيارين على الأقل للسؤال (أ، ب)'
      });
    } else if (nonEmptyOptions.length < 4) {
      issues.push({
        code: 'EMPTY_OPTION',
        severity: 'warning',
        messageArabic: `يوجد ${4 - nonEmptyOptions.length} خيارات فارغة (يفضل إكمال الخيارات الأربعة أ-د)`
      });
    }

    // Check identical options within the same question
    const optionNormSet = new Set<string>();
    let hasIdenticalOpts = false;
    for (const o of nonEmptyOptions) {
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

    // 3. Validate Correct Answer
    const validCorrectId = OPTION_IDS.includes(draft.correctOptionId as any) ? draft.correctOptionId : '';
    if (!validCorrectId) {
      issues.push({
        code: 'MISSING_CORRECT_ANSWER',
        severity: 'error',
        messageArabic: 'لم يتم تحديد الإجابة الصحيحة (يرجى اختيار أ، ب، ج، أو د)'
      });
    } else {
      const chosenOption = normalizedOptions.find(o => o.id === validCorrectId);
      if (!chosenOption || !chosenOption.textArabic || chosenOption.textArabic === 'غير محدد') {
        issues.push({
          code: 'INVALID_CORRECT_OPTION',
          severity: 'error',
          messageArabic: 'الخيار المحدد كإجابة صحيحة فارغ من النص'
        });
      }
    }

    // 4. Duplicate Detection (Batch & Existing Bank)
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
// 1. Structured / Free-Form Text Parser (Aiken, Numbered Blocks, Answer Keys)
// ---------------------------------------------------------------------------

interface RawOptionCandidate {
  marker: string;
  text: string;
  isMarkedCorrect: boolean;
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
  const pairRegex = /(\d+)\s*[\-.:)\s]\s*([A-Da-dأابجد1-4])/gu;
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

  const { cleanedBody, answerKeyByNumber } = extractTrailingAnswerKeyMap(normalizedNewlines);

  // Split into question blocks:
  // Either separated by blank lines, OR starting with a question header (1. / س1: / Q1:) after an answer/explanation or 4 options
  const lines = cleanedBody.split('\n');
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  let currentBlockHasOptions = 0;
  let currentBlockHasAnswerLine = false;

  const questionStartRegex = /^\s*(?:(?:س|سؤال|السؤال|Q|Question)\s*\d*\s*[.:\-)]|\d+\s*[.\-)])\s+\S+/iu;
  const optionLineTestRegex = /^\s*[([]?([A-Da-dأابجد])[)\].\-:]\s+\S+/u;
  const answerLineTestRegex = /^\s*(?:الإجابة الصحيحة|الاجابة الصحيحة|الإجابة|الاجابة|الجواب الصحيح|الجواب|الحل|Answer|Correct\s*Answer|Correct|ANS)\s*[:\-=]\s*\S+/iu;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (currentBlock.length > 0 && (currentBlockHasOptions >= 2 || currentBlockHasAnswerLine)) {
        blocks.push(currentBlock);
        currentBlock = [];
        currentBlockHasOptions = 0;
        currentBlockHasAnswerLine = false;
      }
      continue;
    }

    // Check if this line starts a brand new numbered question while the previous block already had options
    if (
      questionStartRegex.test(trimmed) &&
      !optionLineTestRegex.test(trimmed) &&
      currentBlock.length > 0 &&
      (currentBlockHasOptions >= 2 || currentBlockHasAnswerLine)
    ) {
      blocks.push(currentBlock);
      currentBlock = [trimmed];
      currentBlockHasOptions = 0;
      currentBlockHasAnswerLine = false;
      continue;
    }

    if (optionLineTestRegex.test(trimmed)) {
      currentBlockHasOptions++;
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
    let points = defaultPoints;
    let detectedQuestionNumber: number | null = null;

    const optionRegex = /^\s*(?:([✓✔☑✅*]+)\s*)?[([]?([A-Da-dأابجد1-4])[)\].\-:]\s*(.+)$/u;
    const inlineMultiOptionRegex = /(?:^|\s+)[([]?([A-Da-dأابجد])[)\].\-:]\s*([^([\n]+?)(?=\s+[([]?[A-Da-dأابجد][)\].\-:]|$)/gu;
    const answerRegex = /^\s*(?:الإجابة الصحيحة|الاجابة الصحيحة|الإجابة|الاجابة|الجواب الصحيح|الجواب|الحل|Answer|Correct\s*Answer|Correct|ANS)\s*[:\-=]?\s*(.+)$/iu;
    const explanationRegex = /^\s*(?:التعليل الطبي|التعليل|الشرح|التفسير|توضيح|السبب|Explanation|Rationale|Reason)\s*[:\-=]\s*(.+)$/iu;
    const pointsRegex = /^\s*(?:الدرجة|النقاط|درجة السؤال|Points|Score|Marks)\s*[:\-=]\s*(\d+(?:\.\d+)?)/iu;

    let inExplanation = false;

    for (let i = 0; i < blockLines.length; i++) {
      let line = blockLines[i];

      // Check points line
      const ptsMatch = line.match(pointsRegex);
      if (ptsMatch) {
        points = Number(ptsMatch[1]) || defaultPoints;
        continue;
      }

      // Check explanation line
      const expMatch = line.match(explanationRegex);
      if (expMatch) {
        inExplanation = true;
        explanationLines.push(expMatch[1].trim());
        continue;
      }

      // Check explicit answer line
      const ansMatch = line.match(answerRegex);
      if (ansMatch) {
        inExplanation = false;
        const rawAns = ansMatch[1].trim();
        // Also check if explanation is appended on the same line after a separator like " - التعليل: ..."
        const inlineExpSplit = rawAns.split(/\s+(?:[\-|]|التعليل|الشرح|Explanation)\s*[:\-]?\s*/iu);
        explicitAnswerToken = inlineExpSplit[0].trim();
        if (inlineExpSplit.length > 1 && inlineExpSplit.slice(1).join(' ').trim()) {
          explanationLines.push(inlineExpSplit.slice(1).join(' ').trim());
        }
        continue;
      }

      // Check if multiple options are on a single line (e.g. "أ) خيار 1   ب) خيار 2   ج) خيار 3   د) خيار 4")
      const inlineMatches = Array.from(line.matchAll(inlineMultiOptionRegex));
      if (inlineMatches.length >= 2) {
        inExplanation = false;
        for (const m of inlineMatches) {
          const marker = m[1];
          const { cleanedText, isCorrect } = parseInlineCorrectMarker(m[2]);
          rawOptions.push({
            marker,
            text: cleanedText,
            isMarkedCorrect: isCorrect
          });
        }
        continue;
      }

      // Check single option line (only treat numeric 1-4 as option if we already have a stem line!)
      const optMatch = line.match(optionRegex);
      if (optMatch) {
        const leadingCheck = Boolean(optMatch[1]);
        const markerChar = optMatch[2];
        const isNumericMarker = /^[1-4]$/.test(markerChar);

        if (!isNumericMarker || stemArabicLines.length > 0 || stemEnglishLines.length > 0) {
          inExplanation = false;
          const { cleanedText, isCorrect } = parseInlineCorrectMarker(optMatch[3]);
          rawOptions.push({
            marker: markerChar,
            text: cleanedText,
            isMarkedCorrect: leadingCheck || isCorrect
          });
          continue;
        }
      }

      if (inExplanation) {
        explanationLines.push(line);
        continue;
      }

      // Otherwise it is part of the question stem
      if (stemArabicLines.length === 0 && stemEnglishLines.length === 0) {
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

    const options: QuestionOption[] = OPTION_IDS.map((optId, optIdx) => {
      const candidate = rawOptions[optIdx];
      return {
        id: optId,
        textArabic: candidate ? candidate.text : ''
      };
    });

    // Resolve correctOptionId
    let correctOptionId = '';
    const inlineMarkedIdx = rawOptions.findIndex(o => o.isMarkedCorrect);
    if (inlineMarkedIdx >= 0 && inlineMarkedIdx < OPTION_IDS.length) {
      correctOptionId = OPTION_IDS[inlineMarkedIdx];
    }
    if (!correctOptionId && explicitAnswerToken) {
      correctOptionId = resolveCanonicalOptionId(explicitAnswerToken, options);
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
      stemArabic,
      stemEnglish,
      options,
      correctOptionId,
      explanationArabic: explanationLines.join(' ').trim() || undefined,
      points,
      selectedForImport: true
    };
  });
}

// ---------------------------------------------------------------------------
// 2. CSV / TSV Spreadsheet Parser (RFC-4180 compliant quote handling)
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

  // Detect if row 0 is a header row
  const headerCandidate = rows[0].map(h => h.toLowerCase().trim());
  const isHeaderRow = headerCandidate.some(h =>
    /^(question|stem|stemarabic|سؤال|السؤال|نص السؤال|opt|option|خيار|answer|correct|الإجابة|الاجابة)$/i.test(h)
  );

  const dataRows = isHeaderRow ? rows.slice(1) : rows;
  if (dataRows.length === 0) return [];

  // Column index mapping
  const findCol = (patterns: RegExp[], fallbackIdx: number): number => {
    if (!isHeaderRow) return fallbackIdx;
    const foundIdx = headerCandidate.findIndex(h => patterns.some(p => p.test(h)));
    return foundIdx >= 0 ? foundIdx : fallbackIdx;
  };

  const colStemAr = findCol([/^(question|stem|stem_ar|stemarabic|سؤال|السؤال|نص السؤال)$/i], 0);
  const colStemEn = isHeaderRow
    ? headerCandidate.findIndex(h => /^(stem_en|stemenglish|english|النص الإنجليزي|انجليزي)$/i.test(h))
    : -1;
  const colOptA = findCol([/^(a|opt_a|opta|option_a|option a|أ|ا|خيار أ|الخيار أ|1)$/i], 1);
  const colOptB = findCol([/^(b|opt_b|optb|option_b|option b|ب|خيار ب|الخيار ب|2)$/i], 2);
  const colOptC = findCol([/^(c|opt_c|optc|option_c|option c|ج|خيار ج|الخيار ج|3)$/i], 3);
  const colOptD = findCol([/^(d|opt_d|optd|option_d|option d|د|خيار د|الخيار د|4)$/i], 4);
  const colAns = findCol([/^(answer|correct|correctoptionid|correct_answer|الإجابة|الاجابة|الإجابة الصحيحة|الجواب|الحل)$/i], 5);
  const colExp = findCol([/^(explanation|explanationarabic|rationale|التعليل|الشرح|التفسير)$/i], 6);
  const colPts = findCol([/^(points|score|marks|النقاط|الدرجة)$/i], 7);

  return dataRows.map((row, idx) => {
    const stemArabic = (row[colStemAr] || '').trim();
    const stemEnglish = colStemEn >= 0 ? (row[colStemEn] || '').trim() : undefined;
    const rawA = parseInlineCorrectMarker(row[colOptA] || '');
    const rawB = parseInlineCorrectMarker(row[colOptB] || '');
    const rawC = parseInlineCorrectMarker(row[colOptC] || '');
    const rawD = parseInlineCorrectMarker(row[colOptD] || '');

    const options: QuestionOption[] = [
      { id: 'opt-a', textArabic: rawA.cleanedText },
      { id: 'opt-b', textArabic: rawB.cleanedText },
      { id: 'opt-c', textArabic: rawC.cleanedText },
      { id: 'opt-d', textArabic: rawD.cleanedText }
    ];

    let correctOptionId = '';
    if (rawA.isCorrect) correctOptionId = 'opt-a';
    else if (rawB.isCorrect) correctOptionId = 'opt-b';
    else if (rawC.isCorrect) correctOptionId = 'opt-c';
    else if (rawD.isCorrect) correctOptionId = 'opt-d';

    if (!correctOptionId && row[colAns]) {
      correctOptionId = resolveCanonicalOptionId(row[colAns], options);
    }

    const explanationArabic = (row[colExp] || '').trim() || undefined;
    const ptsVal = Number(row[colPts]);
    const points = !Number.isNaN(ptsVal) && ptsVal > 0 ? ptsVal : defaultPoints;

    return {
      tempId: `csv-draft-${idx}-${Date.now()}`,
      sourceIndex: idx + 1,
      stemArabic,
      stemEnglish: stemEnglish || undefined,
      options,
      correctOptionId,
      explanationArabic,
      points,
      selectedForImport: true
    };
  });
}

// ---------------------------------------------------------------------------
// 3. JSON Parser
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

    let options: QuestionOption[] = [];
    if (Array.isArray(item.options)) {
      options = OPTION_IDS.map((optId, optIdx) => {
        const rawOpt = item.options[optIdx];
        if (typeof rawOpt === 'string') {
          return { id: optId, textArabic: rawOpt.trim() };
        }
        return {
          id: optId,
          textArabic: String(rawOpt?.textArabic || rawOpt?.text || rawOpt?.label || '').trim(),
          ...(rawOpt?.textEnglish ? { textEnglish: String(rawOpt.textEnglish).trim() } : {})
        };
      });
    } else {
      options = [
        { id: 'opt-a', textArabic: String(item.optA || item.a || item.A || item['أ'] || '').trim() },
        { id: 'opt-b', textArabic: String(item.optB || item.b || item.B || item['ب'] || '').trim() },
        { id: 'opt-c', textArabic: String(item.optC || item.c || item.C || item['ج'] || '').trim() },
        { id: 'opt-d', textArabic: String(item.optD || item.d || item.D || item['د'] || '').trim() }
      ];
    }

    const rawAnswer = String(
      item.correctOptionId || item.correctAnswer || item.answer || item.correct || item['الإجابة'] || ''
    ).trim();
    const correctOptionId = resolveCanonicalOptionId(rawAnswer, options);

    const explanationArabic = String(
      item.explanationArabic || item.explanation || item.rationale || item['التعليل'] || ''
    ).trim() || undefined;

    const points = Number(item.points || item.score || item['النقاط']) || defaultPoints;

    return {
      tempId: `json-draft-${idx}-${Date.now()}`,
      sourceIndex: idx + 1,
      stemArabic,
      stemEnglish,
      options,
      correctOptionId,
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
    return { detectedFormat: 'text', drafts: [] };
  }

  const lowerFile = fileName.toLowerCase();
  let detectedFormat: 'text' | 'csv' | 'json' = 'text';

  if (formatHint !== 'auto') {
    detectedFormat = formatHint;
  } else if (lowerFile.endsWith('.json') || ((trimmed.startsWith('[') || trimmed.startsWith('{')) && (trimmed.endsWith(']') || trimmed.endsWith('}')))) {
    detectedFormat = 'json';
  } else if (lowerFile.endsWith('.csv') || lowerFile.endsWith('.tsv')) {
    detectedFormat = 'csv';
  } else {
    // Check if first line looks like a CSV header with >= 4 commas/tabs
    const firstLine = trimmed.split(/\r?\n/)[0] || '';
    const commaOrTabCount = (firstLine.match(/[,\t;]/g) || []).length;
    const hasOptionLines = /^\s*[([]?[A-Da-dأابجد][)\].\-:]\s+/mu.test(trimmed);
    if (commaOrTabCount >= 4 && !hasOptionLines) {
      detectedFormat = 'csv';
    }
  }

  let rawDrafts: Omit<
    ParsedQuestionDraft,
    'issues' | 'isValid' | 'isDuplicateInBatch' | 'isDuplicateInBank' | 'existingQuestionId' | 'contentHash' | 'deterministicId'
  >[] = [];

  try {
    if (detectedFormat === 'json') {
      rawDrafts = parseJsonMCQs(trimmed, defaultPoints);
    } else if (detectedFormat === 'csv') {
      rawDrafts = parseCsvMCQs(trimmed, defaultPoints);
    } else {
      rawDrafts = parseStructuredTextMCQs(trimmed, defaultPoints);
    }
  } catch (e) {
    // Fallback to structured text parser if JSON/CSV parse threw
    detectedFormat = 'text';
    rawDrafts = parseStructuredTextMCQs(trimmed, defaultPoints);
  }

  const validated = validateAndAnnotateDrafts(rawDrafts, bankId, existingBankQuestions);
  return {
    detectedFormat,
    drafts: validated
  };
}

// ---------------------------------------------------------------------------
// 5. Ready-to-Use Medical MCQ Sample Templates (Arabic & Bilingual)
// ---------------------------------------------------------------------------

export const SAMPLE_BULK_TEXT_TEMPLATE = `1. مريض يبلغ من العمر 58 عاماً حضر إلى الطوارئ بألم صدري ضاغط خلف القص يمتد إلى الذراع الأيسر منذ ساعتين مع ارتفاع القطعة ST في المساري II, III, aVF. أي الشرايين التاجية التالية هو الأكثر احتمالاً للإصابة بالانسداد؟
Which coronary artery is most likely occluded in an acute inferior STEMI (leads II, III, aVF)?
أ) الشريان التاجي الأيسر الأمامي النازل (LAD)
ب) الشريان التاجي الأيمن (Right Coronary Artery - RCA) *
ج) الشريان المنعطف الأيسر (Left Circumflex - LCx)
د) الجذع التاجي الأيسر الرئيسي (Left Main Stem)
الإجابة: ب
التعليل: المساري السفلية (II, III, aVF) تعكس الجدار السفلي للبطين الأيسر والذي يتغذى في 85% من البشر بواسطة الشريان التاجي الأيمن (RCA).

2. أي من الأدوية الخافضة لضغط الدم التالية يُمنع استخدامه منعاً باتاً أثناء فترة الحمل بسبب خطورة التشوهات الجنينية الكلوية؟
أ) المثيل دوبا (Methyldopa)
ب) اللابيتالول (Labetalol)
ج) النيفيديبين ممتد المفعول (Nifedipine)
د) مثبطات الإنزيم المحول للأنجيوتنسين (ACE Inhibitors - مثل Captopril)
الإجابة الصحيحة: د
التعليل: مثبطات الإنزيم المحول للأنجيوتنسين وحاصرات مستقبلات الأنجيوتنسين تسبب قصوراً كلوياً جنينياً وقلة السائل الأمنيوسي وتشوهات خلقية.

3. ما هو المضاد الحيوي الخط الأول لعلاج التهاب البلعوم العقدي (Group A Streptococcal Pharyngitis) للوقاية من الحمى الروماتيزمية الحادة؟
A) Penicillin V or Benzathine Penicillin G
B) Ciprofloxacin
C) Gentamicin
D) Vancomycin
ANSWER: A
Explanation: البنسلين هو العلاج المعياري الأول لاستئصال المكورات العقدية المقيحة من البلعوم والوقاية الأولية من الحمى الروماتيزمية.`;

export const SAMPLE_BULK_CSV_TEMPLATE = `السؤال,النص الإنجليزي,خيار أ,خيار ب,خيار ج,خيار د,الإجابة الصحيحة,التعليل,النقاط
"ما هو الصمام القلبي الذي يُسمع صوته بشكل أوضح في الورب الخامس الأيسر عند خط منتصف الترقوة (قمة القلب)؟","Which heart valve is best auscultated at the cardiac apex (5th left ICS, midclavicular line)?","الصمام الأبهري (Aortic)","الصمام الرئوي (Pulmonary)","الصمام التاجي / الميترالي (Mitral)","الصمام ثلاثي الشرف (Tricuspid)","ج","بؤرة التسمع التاجية (Mitral area) تقع في قمة القلب عند الورب الخامس الأيسر على خط منتصف الترقوة.",5
"أي من صدمات الدوران التالية تتميز بارتفاع النتاج القلبي في مرحلتها المبكرة الدافئة وانخفاض المقاومة الوعائية الجهازية (SVR)؟","Which shock type presents early with warm extremities, high cardiac output, and low SVR?","الصدمة القلبية (Cardiogenic Shock)","الصدمة الإنتانية (Septic Shock)","صدمة نقص الحجم (Hypovolemic Shock)","الصدمة الانسدادية (Obstructive Shock)","ب","الصدمة الإنتانية هي صدمة توزيعية تتميز بتوسع وعائي شديد وانخفاض المقاومة الوعائية الجهازية.",5`;

export const UMED_AI_UNIVERSAL_PROMPT_ARABIC = `أنت مساعد أكاديمي طبي متخصص في إعداد وتنسيق بنوك الأسئلة لمنصة UMED الطبية.
مهمتك: تحويل أي ملف أو نص أسئلة أرسله لك (مهما كانت صيغته أو لغته أو ترتيبه)، أو إنشاء اختبار طبي جديد حسب الموضوع المطلوب، وإخراج النتيجة النهائية حصرياً بالصيغة المعيارية التالية الجاهزة للنسخ واللصق المباشر في نظام UMED بدون أي أخطاء.

قواعد التنسيق الإلزامية والصارمة (لا تخالفها أبداً):
1. لا تكتب أي مقدمات أو عبارات ترحيبية أو خاتمة خارج إطار الأسئلة، وضع جميع الأسئلة داخل مربع نص واحد (Code Block) يسهل نسخه بضغطة واحدة.
2. افصل بين كل سؤال والسؤال الذي يليه بسطر فارغ واحد.
3. يجب أن يبدأ كل سؤال برقمه متبوعاً بنقطة، ثم نص السؤال بالعربية في سطر واحد (مثال: 1. نص السؤال بالعربية...).
4. (اختياري) إذا كان السؤال ثنائي اللغة أو يحتوي على مصطلح/سؤال إنجليزي، ضع النص الإنجليزي في السطر التالي مباشرة تحت السؤال العربي بدون ترقيم.
5. يجب أن يحتوي كل سؤال على 4 خيارات بالضبط مرتبة في أسطر مستقلة وتبدأ حصراً بـ:
أ) نص الخيار الأول
ب) نص الخيار الثاني
ج) نص الخيار الثالث
د) نص الخيار الرابع
(ممنوع ترك أي خيار فارغ، وممنوع دمج أكثر من خيار في نفس السطر).
6. بعد الخيارات الأربعة مباشرة، اكتب سطر الإجابة الصحيحة بحرف الخيار فقط (أ أو ب أو ج أو د) بهذا الشكل الدقيق:
الإجابة: ب
7. بعد سطر الإجابة مباشرة، اكتب سطر التعليل العلمي المختصر في سطر واحد بهذا الشكل الدقيق:
التعليل: شرح علمي طبي مختصر يوضح سبب صحة الإجابة.

نموذج الإخراج القياسي المطلوب منك الالتزام به حرفياً لكل سؤال:

1. [نص السؤال الطبي واضحاً وكاملاً باللغة العربية مع المصطلحات الطبية الأساسية]
[Optional English stem in a single line if bilingual]
أ) [الخيار الأول]
ب) [الخيار الثاني]
ج) [الخيار الثالث]
د) [الخيار الرابع]
الإجابة: [أ أو ب أو ج أو د فقط]
التعليل: [التعليل العلمي المختصر في سطر واحد]

الآن طبّق هذه التعليمات بدقة 100% على المحتوى أو الطلب التالي:`;

