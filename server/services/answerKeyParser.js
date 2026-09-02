import { QUESTION_TYPES } from "../models/Exam.js";

/**
 * Turns an extracted exam document into CheckWise questions.
 *
 * A teacher's answer key is not a data format, so the parser reads the two
 * things teachers actually do:
 *
 *   1. They highlight the correct answer. That mark is the only thing telling
 *      "d. Mounting" apart from the three wrong choices, so a highlighted run
 *      on a line is treated as the answer for that line - whatever the section.
 *
 *   2. They write the answer in the text: "ANSWER: B" beside the question, a
 *      TRUE/FALSE or a word in front of the item number, an "ANSWER KEY" block
 *      at the end, or a numbered blank spelled out as "(1: useState)".
 *
 * Sections restart their numbering ("TEST II" begins again at 1), so each
 * question keeps the number printed on the paper in `sectionNumber` while
 * `questionNumber` stays globally unique for storage and grading.
 *
 * Nothing here is trusted. Whatever cannot be decided becomes a warning and the
 * exam stops at `needs-review`, so a bad read can never silently grade a paper.
 */

/** Keywords that name a question type inside a section heading. */
const TYPE_KEYWORDS = [
  [/modified\s*true\s*(or|\/)?\s*false/i, "modified-true-false"],
  [/true\s*(or|\/)?\s*false/i, "true-false"],
  [/multiple\s*choice/i, "multiple-choice"],
  [/complete\s*the\s*program|fill\s*[-\s]*in\s*[-\s]*the\s*blanks?|complete\s*the\s*code/i, "fill-in-the-blanks"],
  [/identification/i, "identification"],
  [/enumerat/i, "enumeration"],
];

/** "TEST II: TRUE OR FALSE", "PART 3 - IDENTIFICATION", "III. IDENTIFICATION" */
const SECTION_HEADING =
  /^(?:(?:TEST|PART|SECTION)\s+[IVXLC\d]+|[IVXLC]{1,5}|[A-D])\s*[.:)-]\s*(.+)$/i;

const DIRECTION_LINE = /^(?:direction|directions|instruction|instructions|panuto)\b/i;
/** The label itself, so only what the teacher actually said is kept. */
const DIRECTION_LABEL =
  /^(?:direction|directions|instruction|instructions|panuto)s?\s*[:.\u2013\u2014-]?\s*/i;
/** "(40 items, 1 point each)" - the marks each item in the section carries. */
const ITEM_COUNT_HINT = /\((\d{1,3})\s*items?,\s*(\d{1,3})\s*points?\s*each\)/i;

const NUMBERED_START = /^(\d{1,3})\s*[.)\]]\s*(.*)$/;
/**
 * An answer written before the number: "TRUE 1. ..." or "Babel 7. ...".
 * The text after the number is optional - a long answer often pushes the
 * statement itself onto the next line, leaving "Stateless Component 2." alone.
 */
const PREFIXED_START = /^(.{1,80}?)\s+(\d{1,3})\s*[.)\]]\s*(.*)$/;
const CHOICE_LINE = /^([A-Ha-h])\s*[.)\]]\s+(.+)$/;
const INLINE_ANSWER = /(?:^|\s)(?:ANSWER|ANS|CORRECT ANSWER|KEY|SAGOT)\s*[:=-]\s*(.+)$/i;
const ANSWER_KEY_HEADER = /^\s*(ANSWER\s*KEY|KEY\s*TO\s*CORRECTION)\s*:?\s*$/i;
/** A numbered blank written inline in a code listing: "(1: useState)" */
const NUMBERED_BLANK = /\((\d{1,3})\s*:\s*([^()]*(?:\([^()]*\)[^()]*)*)\)/g;

const TRUE_WORDS = /^(TRUE|T|TAMA|WASTO)$/i;
const FALSE_WORDS = /^(FALSE|F|MALI)$/i;

/** The schema caps question text; truncate rather than fail the whole upload. */
const MAX_TEXT = 1900;

/**
 * @param {{ text: string, highlighted: string }[]} lines - from pdfService
 * @returns {{ questions: object[], warnings: string[], sections: object[] }}
 */
export function parseExamDocument(lines) {
  const warnings = [];
  const { body, keyMap } = splitTrailingAnswerKey(lines, warnings);
  const sections = splitIntoSections(body);

  const questions = [];
  for (const section of sections) {
    // "Complete the program" sections hide their items inside a code listing as
    // "(1: useState)". Ordinary fill-in-the-blanks sections are numbered lines
    // like any other, so the shape of the section decides, not its heading.
    const parsed = hasInlineBlanks(section)
      ? parseNumberedBlanks(section)
      : parseNumberedItems(section, warnings);

    for (const question of parsed) {
      question.questionNumber = questions.length + 1;
      questions.push(question);
    }
  }

  // The trailing ANSWER KEY block, when there is one, fills any gaps left.
  for (const question of questions) {
    const hasAnswer = question.correctAnswers.length > 0 || question.truthValue;
    if (hasAnswer) continue;
    const fromKey = keyMap.get(question.sectionNumber);
    if (fromKey) applyAnswer(question, fromKey, warnings);
  }

  for (const question of questions) {
    if (question.correctAnswers.length === 0 && !question.truthValue) {
      warnings.push(
        `${describe(question)} has no answer - highlight it in the PDF or set it on the review screen.`
      );
    }
  }

  if (questions.length === 0) {
    warnings.push(
      "No numbered questions were found. CheckWise looks for items that begin with " +
        '"1." or "1)".'
    );
  }

  return {
    questions,
    warnings,
    sections: sections.map((s) => ({
      label: s.label,
      type: s.type,
      questions: questions.filter((q) => q.section === s.label).length,
    })),
  };
}

/** Two or more "(1: answer)" blanks mean the section is a code listing. */
function hasInlineBlanks(section) {
  const pattern = new RegExp(NUMBERED_BLANK.source);
  const count = section.lines.filter((line) => pattern.test(line.text)).length;
  return count >= 2;
}

function describe(question) {
  return question.section
    ? `${question.section} item ${question.sectionNumber}`
    : `Question ${question.sectionNumber}`;
}

/**
 * Splits off a trailing "ANSWER KEY" block, indexed by item number. Returning
 * the body without it stops key lines being parsed again as questions.
 */
function splitTrailingAnswerKey(lines, warnings) {
  const headerIndex = lines.findIndex((line) => ANSWER_KEY_HEADER.test(line.text));
  if (headerIndex === -1) return { body: lines, keyMap: new Map() };

  const keyMap = new Map();
  // One line often holds several entries: "1. B   2. TRUE   3. Mitochondria"
  const ENTRY = /(\d{1,3})\s*[.)\]]\s*([\s\S]*?)(?=\s+\d{1,3}\s*[.)\]]|$)/g;

  for (const line of lines.slice(headerIndex + 1)) {
    for (const [, number, answer] of line.text.matchAll(ENTRY)) {
      const clean = answer.trim();
      if (clean) keyMap.set(Number(number), clean);
    }
  }

  if (keyMap.size === 0) {
    warnings.push(
      'An "ANSWER KEY" heading was found but no numbered answers could be read under it.'
    );
  }

  return { body: lines.slice(0, headerIndex), keyMap };
}

/** Cuts the document into sections at each heading that names a question type. */
function splitIntoSections(lines) {
  const sections = [];
  let current = null;

  const open = (label, type) => {
    current = { label, type, points: 1, directions: "", lines: [] };
    sections.push(current);
  };

  for (const line of lines) {
    const heading = readHeading(line.text);
    if (heading) {
      open(heading.label, heading.type);
      // "TEST IV: IDENTIFICATION (10 items, 2 points each)" — the heading is
      // where teachers actually write this, so read it here as well as from a
      // directions line. Opening the section and moving on skipped it, and the
      // section silently kept the default of one mark per item.
      const hint = line.text.match(ITEM_COUNT_HINT);
      if (hint) current.points = Number(hint[2]) || 1;
      continue;
    }

    if (DIRECTION_LINE.test(line.text)) {
      // The directions often declare what each item is worth.
      const hint = line.text.match(ITEM_COUNT_HINT);
      if (hint && current) current.points = Number(hint[2]) || 1;

      // Kept, so the answer sheet can print the teacher's own wording instead
      // of a generic sentence. Only the first directions line of a section is
      // taken: anything running to a paragraph would not fit under a heading.
      if (current && !current.directions) {
        current.directions = line.text.replace(DIRECTION_LABEL, "").trim();
      }
      continue;
    }
    if (current) {
      const hint = line.text.match(ITEM_COUNT_HINT);
      if (hint) {
        current.points = Number(hint[2]) || 1;
        continue;
      }
    }

    // Questions before any heading still belong somewhere.
    if (!current) open("", null);
    current.lines.push(line);
  }

  return sections.filter((section) => section.lines.length > 0);
}

function readHeading(text) {
  if (text.length > 90) return null;

  const match = text.match(SECTION_HEADING);
  const subject = match ? match[1] : text;

  for (const [pattern, type] of TYPE_KEYWORDS) {
    if (pattern.test(subject)) {
      // Drop a trailing "(ANSWER KEY)" note from the printed label.
      const label = text.replace(/\s*\((?:answer\s*key|key)\)\s*$/i, "").trim();
      return { label, type };
    }
  }
  return null;
}

/**
 * Reads a section whose items are numbered lines, in any of the shapes a
 * teacher writes them: the number first, or the answer written before it.
 */
function parseNumberedItems(section, warnings) {
  const blocks = [];
  let current = null;

  for (const line of section.lines) {
    const start = readItemStart(line, section.type);

    if (start) {
      current = {
        sectionNumber: start.number,
        prefixAnswer: start.prefixAnswer,
        textParts: start.rest ? [start.rest] : [],
        choices: [],
        answerLetter: null,
        highlightedText: start.prefixHighlight || "",
        inlineAnswer: null,
      };
      blocks.push(current);
      continue;
    }

    if (!current) continue;
    absorb(current, line);
  }

  return blocks.map((block) => toQuestion(block, section, warnings));
}

/** Recognises the beginning of an item, returning its number and leading text. */
function readItemStart(line, sectionType) {
  const plain = line.text.match(NUMBERED_START);
  if (plain) {
    return { number: Number(plain[1]), rest: plain[2].trim(), prefixAnswer: null };
  }

  // "TRUE 1. React uses camelCase" / "ReactJS (React) 1. It is the library"
  const prefixed = line.text.match(PREFIXED_START);
  if (!prefixed) return null;

  const prefix = prefixed[1].trim();
  // A prefix is an answer, not a stray sentence: it must be short, must not end
  // a sentence, and must be the highlighted run when the teacher marked one.
  const looksLikeAnswer =
    prefix.length <= 70 &&
    !/[.!?:;]$/.test(prefix) &&
    (line.highlighted === prefix ||
      TRUE_WORDS.test(prefix) ||
      FALSE_WORDS.test(prefix) ||
      sectionType === "identification");

  if (!looksLikeAnswer) return null;

  return {
    number: Number(prefixed[2]),
    rest: prefixed[3].trim(),
    prefixAnswer: prefix,
    prefixHighlight: line.highlighted,
  };
}

/** Adds a continuation line, a choice, or an inline answer to the open item. */
function absorb(block, line) {
  const inline = line.text.match(INLINE_ANSWER);
  const text = inline ? line.text.slice(0, inline.index).trim() : line.text;
  if (inline) block.inlineAnswer = inline[1].trim();
  if (!text) return;

  const choice = text.match(CHOICE_LINE);
  if (choice) {
    block.choices.push(choice[2].trim());
    // The highlighted choice is the answer; its letter is what gets stored.
    if (line.highlighted) block.answerLetter = choice[1].toUpperCase();
    return;
  }

  // A continuation of the previous choice, or of the question itself.
  if (block.choices.length > 0) {
    block.choices[block.choices.length - 1] += ` ${text}`;
  } else {
    block.textParts.push(text);
  }
}

function toQuestion(block, section, warnings) {
  const questionText = block.textParts.join(" ").replace(/\s+/g, " ").trim();
  const type = resolveType(section.type, block, questionText);

  const question = {
    section: section.label,
    directions: section.directions || "",
    sectionNumber: block.sectionNumber,
    questionType: type,
    questionText: questionText.slice(0, MAX_TEXT),
    choices: type === "true-false" ? ["TRUE", "FALSE"] : block.choices.slice(0, 8),
    correctAnswers: [],
    truthValue: null,
    correctionAnswers: [],
    enumerationCount: null,
    points: section.points || 1,
  };

  if (type === "multiple-choice" && block.answerLetter) {
    question.correctAnswers = [block.answerLetter];
    return question;
  }

  const written = block.prefixAnswer || block.inlineAnswer || block.highlightedText || null;
  if (written) applyAnswer(question, written, warnings);

  return question;
}

/**
 * Decides what one item actually is.
 *
 * The section heading is a default, not a verdict. Teachers mix types inside a
 * section all the time — a paper that says MULTIPLE CHOICE but slips a True or
 * False in at item 12 is ordinary, and forcing every item to the heading's type
 * used to mis-grade the odd ones out.
 *
 * So an item overrides its section when its own shape says so unambiguously,
 * and only then. Everything else keeps the heading's type, and whatever this
 * lands on is shown per item on the review screen before anything is graded.
 */
function resolveType(sectionType, block, questionText) {
  const declared = sectionType && QUESTION_TYPES.includes(sectionType) ? sectionType : null;
  const written = block.prefixAnswer || block.inlineAnswer || block.highlightedText;

  // Lettered options are structural — a line reading "B. Updating" is not
  // something a True or False item produces by accident.
  if (block.choices.length >= 2) return "multiple-choice";

  if (written) {
    // "FALSE - Babel": a truth value carrying a correction is Modified True or
    // False wherever it appears.
    const [head, ...rest] = written.split(/\s*[-,;:]\s*|\s{2,}/);
    const isTruth = TRUE_WORDS.test(head) || FALSE_WORDS.test(head);

    if (isTruth && rest.join(" ").trim()) return "modified-true-false";

    // A bare TRUE or FALSE is a True or False item — unless the section is
    // Modified True or False, where a TRUE item legitimately has nothing after
    // it and demoting it would drop the correction field.
    if (isTruth && declared !== "modified-true-false") return "true-false";
  }

  if (declared) return declared;

  /*
   * An enumeration written without a section to declare it.
   *
   * Commas alone are not enough — "Manila, Philippines" is one identification
   * answer, not two items. So the question itself has to ask for a list, or
   * declare marks that match how many parts the answer has. Read as an
   * identification instead, a student would have to reproduce the whole comma
   * string exactly to score anything.
   */
  if (written) {
    const parts = written.split(/\s*[,;]\s*/).filter(Boolean);
    if (parts.length >= 2) {
      const asksForList =
        /\b(list|enumerate)\b/i.test(questionText) ||
        /\b(name|give|identify|state)\s+(the\s+)?(two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i.test(
          questionText
        );
      const declaredPoints = questionText.match(/\((\d{1,3})\s*(?:points?|pts?)\)/i);
      const pointsMatchParts =
        declaredPoints && Number(declaredPoints[1]) === parts.length;

      if (asksForList || pointsMatchParts) return "enumeration";
    }
  }

  if (/_{3,}/.test(questionText)) return "fill-in-the-blanks";
  return "identification";
}

/**
 * Reads a "complete the program" section, where the items are numbered blanks
 * written inline in a code listing: `import { (1: useState) } from "(2: react)"`.
 * The surrounding line is kept as the question text so the teacher sees context.
 */
function parseNumberedBlanks(section) {
  const questions = [];

  for (const line of section.lines) {
    for (const [, number, answer] of line.text.matchAll(NUMBERED_BLANK)) {
      questions.push({
        section: section.label,
        directions: section.directions || "",
        sectionNumber: Number(number),
        questionType: "fill-in-the-blanks",
        // Show the code line with this blank left empty, as the student sees it.
        questionText: blankOut(line.text, Number(number)).slice(0, MAX_TEXT),
        choices: [],
        // Taken literally: these answers are code, where "/" is part of the
        // token ("/>", "</>") rather than a separator between alternatives.
        correctAnswers: [answer.trim()],
        truthValue: null,
        correctionAnswers: [],
        enumerationCount: null,
        points: section.points || 1,
      });
    }
  }

  return questions.sort((a, b) => a.sectionNumber - b.sectionNumber);
}

/** Replaces every numbered blank in a line with its number, hiding the answers. */
function blankOut(text, highlightNumber) {
  return text
    .replace(NUMBERED_BLANK, (_match, number) =>
      Number(number) === highlightNumber ? `(${number}: ______)` : `(${number}: …)`
    )
    .trim();
}

/** Writes a written answer onto the question in the shape its type expects. */
function applyAnswer(question, rawAnswer, warnings) {
  const answer = rawAnswer.trim();
  if (!answer) return;

  switch (question.questionType) {
    case "multiple-choice": {
      const letter = answer.match(/^([A-Ha-h])\s*[.)\]]?\s*$/);
      if (letter) {
        question.correctAnswers = [letter[1].toUpperCase()];
        return;
      }
      /*
       * The letter with its option spelled out beside it: "B. Jupiter",
       * "B - Jupiter", "B: Jupiter", "B — Jupiter".
       *
       * The separator set matters. It used to accept only . ) and ], so an
       * answer key written the common way — letter, dash, the option — matched
       * nothing and the item lost its answer entirely.
       */
      const labelled = answer.match(/^([A-Ha-h])\s*[.)\]:–—-]\s*(.*)$/);
      if (labelled) {
        question.correctAnswers = [labelled[1].toUpperCase()];
        return;
      }

      // Written out without its letter, or with one this exam does not use.
      const stripped = answer.replace(/^[A-Ha-h]\s*[.)\]:–—-]\s*/, "").trim();
      const index = question.choices.findIndex((choice) => {
        const c = choice.trim().toLowerCase();
        return c === answer.toLowerCase() || c === stripped.toLowerCase();
      });
      if (index !== -1) {
        question.correctAnswers = [String.fromCharCode(65 + index)];
        return;
      }

      warnings.push(`${describe(question)}: "${answer}" matches no choice.`);
      return;
    }

    case "true-false": {
      if (TRUE_WORDS.test(answer)) question.correctAnswers = ["TRUE"];
      else if (FALSE_WORDS.test(answer)) question.correctAnswers = ["FALSE"];
      else warnings.push(`${describe(question)}: "${answer}" is not TRUE or FALSE.`);
      return;
    }

    case "modified-true-false": {
      const [head, ...rest] = answer.split(/\s*[-,;:]\s*|\s{2,}/);
      if (TRUE_WORDS.test(head)) question.truthValue = "TRUE";
      else if (FALSE_WORDS.test(head)) question.truthValue = "FALSE";
      else warnings.push(`${describe(question)}: no TRUE or FALSE in "${answer}".`);

      const correction = rest.join(" ").trim();
      if (correction) question.correctionAnswers = splitVariations(correction);
      else if (question.truthValue === "FALSE") {
        warnings.push(`${describe(question)} is FALSE but has no correction word.`);
      }
      return;
    }

    case "enumeration": {
      const items = answer
        .split(/\s*[,;]\s*|\s*\/\s*/)
        .map((item) => item.replace(/^\d{1,2}\s*[.)]\s*/, "").trim())
        .filter(Boolean);
      question.correctAnswers = items;
      question.enumerationCount = items.length || null;
      question.points = items.length || question.points;
      return;
    }

    default:
      question.correctAnswers = splitVariations(answer);
  }
}

/** "ReactJS (React)" and "Heart / Puso" both mean: either spelling scores. */
function splitVariations(value) {
  const parenthesised = value.match(/^([^()]+)\(([^()]+)\)$/);
  if (parenthesised) {
    return [parenthesised[1].trim(), parenthesised[2].trim()].filter(Boolean);
  }
  return value
    .split(/\s*\/\s*|\s+or\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}
