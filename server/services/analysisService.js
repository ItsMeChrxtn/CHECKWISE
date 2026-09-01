/**
 * Item analysis over every paper scanned for one exam.
 *
 * This is the part that makes a set of scores usable as evidence rather than
 * just a gradebook. Three questions get answered for each item:
 *
 *   - How hard was it?        difficulty index p, the share who earned the mark
 *   - Did it sort students?   discrimination D, top group minus bottom group
 *   - Which wrong answer      the distractor tally, so a badly worded option
 *     attracted people?       shows up as the one everybody picked
 *
 * ...and one for the paper as a whole: Cronbach's alpha, how consistently the
 * items measure the same thing.
 *
 * Every figure here is the standard classroom-assessment form of the statistic,
 * so a number reported out of CheckWise can be checked against any textbook.
 */

/** Items still waiting for a person are left out of the rates, and counted apart. */
const UNGRADED = new Set(["needs-review", "ambiguous"]);

/** Kelley's split: the top and bottom 27% discriminate most sharply. */
const GROUP_SHARE = 0.27;

export function analyseExam(results, exam) {
  const papers = results.filter((r) => Array.isArray(r.answers) && r.answers.length > 0);

  const summary = summarise(papers, exam);
  if (papers.length === 0) return { summary, items: [] };

  // Rank papers once; every item's discrimination is read off the same split.
  const ranked = [...papers].sort((a, b) => scoreOf(b) - scoreOf(a));
  const groupSize = Math.max(1, Math.round(ranked.length * GROUP_SHARE));
  const upper = ranked.slice(0, groupSize);
  const lower = ranked.slice(-groupSize);

  const numbers = [...new Set(papers.flatMap((p) => p.answers.map((a) => a.questionNumber)))].sort(
    (a, b) => a - b
  );

  const items = numbers.map((n) => analyseItem(n, papers, upper, lower, papers.length));

  return { summary: { ...summary, alpha: cronbachAlpha(papers, numbers) }, items };
}

function analyseItem(questionNumber, papers, upper, lower, paperCount) {
  const seen = papers
    .map((p) => p.answers.find((a) => a.questionNumber === questionNumber))
    .filter(Boolean);

  const first = seen[0] ?? {};
  const tally = { correct: 0, partial: 0, wrong: 0, blank: 0, ambiguous: 0, pending: 0 };
  const choices = new Map();

  for (const answer of seen) {
    if (answer.status === "correct") tally.correct += 1;
    else if (answer.status === "partial") tally.partial += 1;
    else if (answer.status === "wrong") tally.wrong += 1;
    else if (answer.status === "blank") tally.blank += 1;
    else if (answer.status === "ambiguous") tally.ambiguous += 1;
    else if (answer.status === "needs-review") tally.pending += 1;

    // What was actually put down, for the distractor tally. Blanks get their own
    // bucket so an unanswered item cannot look like a popular choice.
    const given = (answer.studentAnswer || "").trim();
    const label = given === "" ? "(blank)" : given.toUpperCase();
    const entry = choices.get(label) ?? { answer: label, count: 0, correct: false };
    entry.count += 1;
    if (answer.status === "correct" || answer.status === "partial") entry.correct = true;
    choices.set(label, entry);
  }

  const graded = seen.filter((answer) => !UNGRADED.has(answer.status));
  const difficulty = graded.length > 0 ? share(graded) : null;

  const upperShare = shareIn(upper, questionNumber);
  const lowerShare = shareIn(lower, questionNumber);
  const discrimination =
    upperShare === null || lowerShare === null ? null : round(upperShare - lowerShare);

  return {
    questionNumber,
    section: first.section || "",
    questionType: first.questionType || "",
    correctAnswer: first.correctAnswer || "",
    pointsPossible: first.pointsPossible ?? 1,

    attempts: seen.length,
    graded: graded.length,
    ...tally,

    difficulty,
    difficultyLabel: labelDifficulty(difficulty),
    discrimination,
    discriminationLabel: labelDiscrimination(discrimination),

    // Most-picked first, so the distractor pulling people sits at the top.
    choices: [...choices.values()].sort((a, b) => b.count - a.count),
    paperCount,
  };
}

/** Share of a group that earned the mark, counting partial credit as it fell. */
function share(answers) {
  const earned = answers.reduce((sum, answer) => {
    const possible = answer.pointsPossible || 0;
    if (possible <= 0) return sum + (answer.status === "correct" ? 1 : 0);
    return sum + Math.min(1, (answer.pointsEarned || 0) / possible);
  }, 0);
  return round(earned / answers.length);
}

function shareIn(group, questionNumber) {
  const answers = group
    .map((paper) => paper.answers.find((a) => a.questionNumber === questionNumber))
    .filter((answer) => answer && !UNGRADED.has(answer.status));
  return answers.length === 0 ? null : share(answers);
}

function summarise(papers, exam) {
  const percentages = papers.map((p) => p.percentage ?? 0);
  const scores = papers.map(scoreOf);

  return {
    papers: papers.length,
    passed: papers.filter((p) => p.passed).length,
    failed: papers.filter((p) => !p.passed).length,
    passingScore: exam?.passingScore ?? null,
    mean: round(mean(scores)),
    meanPercentage: round(mean(percentages)),
    median: round(median(scores)),
    stdDev: round(stdDev(scores)),
    highest: scores.length ? round(Math.max(...scores)) : 0,
    lowest: scores.length ? round(Math.min(...scores)) : 0,
    totalPoints: papers[0]?.totalPoints ?? 0,
    pendingReview: papers.reduce((sum, p) => sum + (p.pendingReview || 0), 0),
    alpha: null,
  };
}

/**
 * Cronbach's alpha over the per-item marks.
 *
 * The general form is used rather than KR-20 because enumeration items carry
 * partial credit, so the marks are not all 0 or 1. With fewer than two papers
 * or two items there is nothing to correlate, and it stays null rather than
 * reporting a number that would only look authoritative.
 */
function cronbachAlpha(papers, numbers) {
  if (papers.length < 2 || numbers.length < 2) return null;

  const columns = numbers.map((n) =>
    papers.map((p) => {
      const answer = p.answers.find((a) => a.questionNumber === n);
      return answer ? answer.pointsEarned || 0 : 0;
    })
  );

  const totals = papers.map((_, i) => columns.reduce((sum, col) => sum + col[i], 0));
  const totalVariance = variance(totals);
  if (totalVariance === 0) return null;

  const itemVariance = columns.reduce((sum, col) => sum + variance(col), 0);
  const k = numbers.length;
  const alpha = (k / (k - 1)) * (1 - itemVariance / totalVariance);

  // Alpha is only meaningful in [0, 1]. A negative value means the items
  // disagree with each other, which reads better as 0 than as noise.
  return round(Math.max(0, Math.min(1, alpha)));
}

function labelDifficulty(p) {
  if (p === null) return "not yet graded";
  if (p >= 0.85) return "very easy";
  if (p >= 0.7) return "easy";
  if (p >= 0.3) return "moderate";
  if (p >= 0.15) return "difficult";
  return "very difficult";
}

function labelDiscrimination(d) {
  if (d === null) return "not yet graded";
  if (d < 0) return "check this item";
  if (d >= 0.4) return "excellent";
  if (d >= 0.3) return "good";
  if (d >= 0.2) return "fair";
  return "poor";
}

const scoreOf = (paper) => paper.score ?? 0;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function median(xs) {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Population variance: these are the whole class, not a sample drawn from it. */
function variance(xs) {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  return mean(xs.map((x) => (x - m) ** 2));
}

const stdDev = (xs) => Math.sqrt(variance(xs));
const round = (v) => Math.round(v * 1000) / 1000;
