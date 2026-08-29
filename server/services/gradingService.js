/**
 * Turns what was read off a paper into marks.
 *
 * The scanner supplies the shaded bubbles; written answers are typed in by the
 * teacher afterwards. Both arrive here in the same shape, so a paper can be
 * graded, corrected, and graded again without a second code path - which is
 * what keeps a manual correction and a fresh scan producing the same number.
 *
 * A question the machine could not settle is never guessed at: it is returned
 * as `ambiguous` or `needs-review`, worth nothing until a person decides.
 */

/**
 * @param {object} exam - the exam document, with questions and gradingConfig
 * @param {Map<number, {value: string|null, status: string, confidence: number}>} marks
 *        - bubble readings by questionNumber
 * @param {Map<number, string>} [written] - typed answers by questionNumber
 * @returns {object[]} one answer record per question
 */
export function gradeAnswers(exam, marks, written = new Map()) {
  const config = exam.gradingConfig ?? {};

  return exam.questions.map((question) => {
    const mark = marks.get(question.questionNumber) ?? null;
    const typed = written.get(question.questionNumber);

    const base = {
      questionNumber: question.questionNumber,
      section: question.section || "",
      sectionNumber: question.sectionNumber ?? null,
      questionType: question.questionType,
      correctAnswer: describeKey(question),
      pointsPossible: question.points ?? 1,
      pointsEarned: 0,
      confidence: mark?.confidence ?? 0,
      studentAnswer: "",
      status: "needs-review",
      // Set by the caller: this function cannot tell a teacher's correction
      // from a written answer the reader supplied, and saying "corrected by
      // hand" when nobody touched it would be a lie on the record.
      manuallyCorrected: false,
    };

    switch (question.questionType) {
      case "multiple-choice":
      case "true-false":
        return gradeBubble(base, question, mark, typed);

      case "modified-true-false":
        return gradeModifiedTrueFalse(base, question, mark, typed, config);

      case "enumeration":
        return gradeEnumeration(base, question, typed, config);

      default:
        // identification and fill-in-the-blanks
        return gradeWritten(base, question, typed, config);
    }
  });
}

/** A single shaded bubble, right or wrong. */
function gradeBubble(base, question, mark, typed) {
  // A teacher's correction always wins over what the scanner saw.
  const chosen = typed !== undefined ? typed.trim().toUpperCase() : mark?.value ?? null;

  if (typed === undefined && mark && mark.status !== "read") {
    return { ...base, status: mark.status === "blank" ? "blank" : "ambiguous" };
  }
  if (!chosen) return { ...base, status: "blank" };

  const correct = question.correctAnswers.some((answer) => equal(answer, chosen));
  return {
    ...base,
    studentAnswer: chosen,
    status: correct ? "correct" : "wrong",
    pointsEarned: correct ? base.pointsPossible : 0,
  };
}

/**
 * Truth value from the bubble, correction word from the teacher.
 *
 * `whole` awards the mark only when both halves are right; `split` scores them
 * independently, so a student who spots that a statement is false still earns
 * something when the correction is wrong.
 */
function gradeModifiedTrueFalse(base, question, mark, typed, config) {
  const split = config.modifiedTrueFalseScoring === "split";
  const truth = mark?.status === "read" ? mark.value : null;

  const truthRight = truth !== null && equal(truth, question.truthValue ?? "");
  // A TRUE statement has nothing to correct, so that half is satisfied.
  const needsCorrection = question.truthValue === "FALSE";
  const correctionGiven = typed !== undefined && typed.trim() !== "";
  const correctionRight =
    !needsCorrection ||
    (correctionGiven && question.correctionAnswers.some((answer) => equal(answer, typed, config)));

  const studentAnswer = [truth ?? "", correctionGiven ? typed.trim() : ""]
    .filter(Boolean)
    .join(" - ");

  if (truth === null) {
    return { ...base, studentAnswer, status: mark?.status === "blank" ? "blank" : "ambiguous" };
  }
  // The correction has not been typed in yet, so the mark cannot be settled.
  if (needsCorrection && !correctionGiven && truthRight) {
    return { ...base, studentAnswer, status: "needs-review" };
  }

  if (split) {
    // Two halves, so the question is worth two marks rather than its face value.
    const half = base.pointsPossible;
    const earned = (truthRight ? half : 0) + (correctionRight ? half : 0);
    const status = earned === 0 ? "wrong" : earned === half * 2 ? "correct" : "partial";
    return { ...base, studentAnswer, pointsPossible: half * 2, pointsEarned: earned, status };
  }

  const right = truthRight && correctionRight;
  return {
    ...base,
    studentAnswer,
    status: right ? "correct" : "wrong",
    pointsEarned: right ? base.pointsPossible : 0,
  };
}

/** A written word, matched against every spelling the key accepts. */
function gradeWritten(base, question, typed, config) {
  if (typed === undefined) return base; // still needs-review
  const answer = typed.trim();
  if (!answer) return { ...base, status: "blank" };

  const correct = question.correctAnswers.some((accepted) => equal(accepted, answer, config));
  return {
    ...base,
    studentAnswer: answer,
    status: correct ? "correct" : "wrong",
    pointsEarned: correct ? base.pointsPossible : 0,
  };
}

/**
 * A list, scored item by item when partial credit is on.
 *
 * Order is not graded - a student who lists the same three things in another
 * order has still answered - and a repeated item cannot earn its mark twice.
 */
function gradeEnumeration(base, question, typed, config) {
  if (typed === undefined) return base; // still needs-review

  const given = typed
    .split(/\s*[,;\n]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (given.length === 0) return { ...base, status: "blank", studentAnswer: "" };

  const remaining = [...question.correctAnswers];
  let hits = 0;

  for (const item of given) {
    const index = remaining.findIndex((accepted) => equal(accepted, item, config));
    if (index !== -1) {
      hits += 1;
      remaining.splice(index, 1);
    }
  }

  const expected = question.correctAnswers.length || 1;
  const perItem = base.pointsPossible / expected;

  if (config.enumerationPartialCredit === false) {
    const allRight = hits === expected;
    return {
      ...base,
      studentAnswer: given.join(", "),
      status: allRight ? "correct" : "wrong",
      pointsEarned: allRight ? base.pointsPossible : 0,
    };
  }

  const earned = Math.round(hits * perItem * 100) / 100;
  const status = hits === 0 ? "wrong" : hits === expected ? "correct" : "partial";
  return { ...base, studentAnswer: given.join(", "), status, pointsEarned: earned };
}

/**
 * Whether a student's answer counts as the accepted one.
 *
 * Two rulings are possible, and the exam's `strictWrittenAnswers` picks one.
 *
 * **Strict (the default).** Only the spellings written into the key are right.
 * Capitals and stray punctuation are still ignored, because those are how an
 * answer was written down rather than what it says, but nothing else is added:
 * the key is the teacher's ruling and software should not quietly widen it.
 *
 * **Lenient.** A teacher reading "photosynthisis" or "React js" gives the mark,
 * so this does too - typos are forgiven in proportion to the word's length, and
 * an answer that says the right thing with extra words ("the heart") counts.
 * The tolerance is still tight, since forgiving too much marks a wrong answer
 * right, which is the one mistake a student cannot argue their way out of.
 *
 * Which to choose is not obvious when papers are scanned: the handwriting
 * reader makes its own mistakes ("usedtate" for "useState"), and under strict
 * grading those land on the student.
 */
function equal(accepted, given, config = {}) {
  const rawA = String(accepted ?? "").replace(/\s+/g, "");
  const rawB = String(given ?? "").replace(/\s+/g, "");
  if (rawA && rawA === rawB) return true;

  // A "complete the code" blank can be pure punctuation - "", />, </>. There
  // the punctuation *is* the answer, so it is compared literally rather than
  // stripped away as noise the way it is in a written word.
  const symbolOnly = (value) => value && !/[a-z0-9]/i.test(value);
  if (symbolOnly(rawA) || symbolOnly(rawB)) return rawA === rawB;

  const a = normalise(accepted);
  const b = normalise(given);

  if (!a || !b) return false;
  if (a === b) return true;

  /**
   * Strict grading stops here: the key is the teacher's ruling on what counts,
   * and only the spellings written into it are right. Capitals and stray
   * punctuation are still ignored - those are how the answer was written down,
   * not what it says.
   */
  if (config.strictWrittenAnswers !== false) return false;

  // "ReactJS" vs "React JS" vs "react-js": spacing is not a spelling mistake.
  if (squash(a) === squash(b)) return true;

  if (withinTypoDistance(a, b)) return true;

  return saysTheSameThing(a, b);
}

/** Typos forgiven in proportion to length: one in a short word, more in a long one. */
function withinTypoDistance(a, b) {
  const longest = Math.max(a.length, b.length);
  // Below five characters every edit changes the word into another word.
  if (longest < 5) return false;

  const allowed = Math.max(1, Math.floor(longest * 0.2));
  return levenshtein(a, b, allowed) <= allowed;
}

/**
 * The key's words are all there, wrapped in a little filler.
 *
 * This is what lets "the heart" and "a stateless component" score, while the
 * length guard stops a sentence that merely mentions the right word - a student
 * hedging across three lines has not identified anything.
 */
function saysTheSameThing(a, b) {
  const keyWords = a.split(" ").filter((word) => word.length > 2);
  if (keyWords.length === 0) return false;

  const givenWords = b.split(" ");
  if (givenWords.length > keyWords.length + 2) return false;

  return keyWords.every((word) =>
    givenWords.some((given) => given === word || withinTypoDistance(word, given))
  );
}

/**
 * Edit distance, abandoned once it passes `limit`.
 *
 * The cap matters: without it every wrong answer is compared in full against
 * every accepted spelling of every question, which is work spent proving what
 * the first few characters already showed.
 */
function levenshtein(a, b, limit = Infinity) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      if (current[j] < best) best = current[j];
    }

    if (best > limit) return limit + 1;
    previous = current;
  }

  return previous[b.length];
}

function normalise(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.,;:!?'"()\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strips everything but letters and digits, so spacing and hyphens stop mattering. */
function squash(value) {
  return value.replace(/[^a-z0-9]/g, "");
}

/** The key, written the way it should appear beside the student's answer. */
function describeKey(question) {
  if (question.questionType === "modified-true-false") {
    const correction = question.correctionAnswers.join(" / ");
    return correction ? `${question.truthValue} - ${correction}` : question.truthValue ?? "";
  }
  return question.correctAnswers.join(" / ");
}
