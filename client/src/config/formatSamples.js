/**
 * A worked sample of an acceptable section for each question type.
 *
 * Every one of these is written to what server/services/answerKeyParser.js
 * actually accepts — the section heading pattern, the answer markers, the way
 * each type splits its answer. They are meant to be read next to a real paper
 * and copied, so they are complete sections rather than fragments.
 *
 * Kept in step with mobile/lib/config/format_samples.dart. If the parser
 * changes, both change: a sample that no longer parses is worse than none,
 * because a teacher follows it and still gets warnings.
 */
export const FORMAT_SAMPLES = [
  {
    type: "plain-quiz",
    label: "Plain quiz (no sections)",
    blurb:
      "A short quiz with no section headings at all. Each item is read from its own shape, so "
      + "the types can be mixed in any order.",
    sample: `General Knowledge Quiz
10 Items with Answers

1. What is the largest planet in our solar system?
   A. Earth
   B. Jupiter
   C. Saturn
   D. Mars
   Answer: B — Jupiter

2. The Great Wall of China is visible from space
   with the naked eye.
   Answer: False

3. What is the chemical symbol for gold?
   Answer: Au

4. Name the three branches of the Philippine
   government. (3 points)
   Answer: Executive, Legislative, Judicial`,
    notes: [
      "The answer may carry its letter and the option together — B — Jupiter, B. Jupiter and plain B all work.",
      "Item 4 is read as an enumeration because the question asks to name three and the answer has three parts. Each one earns a share of the marks.",
      "Explanations written under an answer are ignored, so you can keep your notes in the same file.",
    ],
  },
  {
    type: "multiple-choice",
    label: "Multiple Choice",
    blurb: "Bubbled on the answer sheet. The scanner reads which letter was shaded.",
    sample: `TEST I: MULTIPLE CHOICE (40 items, 1 point each)
Directions: Shade the letter of the correct answer.

1. In the React component life cycle, the first phase is called:
   A. Rendering
   B. Updating
   C. Unmounting
   D. Mounting
   ANSWER: D

2. Which hook manages local state in a function component?
   A. useEffect
   B. useState
   C. useMemo
   D. useRef
   ANSWER: useState`,
    notes: [
      "Highlighting option D in the PDF does the same job as writing ANSWER: D — use whichever you already do.",
      "The answer may be the letter (D) or the option's own words (useState). Both are matched.",
      "Options run A through H.",
    ],
  },

  {
    type: "true-false",
    label: "True or False",
    blurb: "Bubbled. Two options, read the same way as multiple choice.",
    sample: `TEST II: TRUE OR FALSE (15 items, 1 point each)
Directions: Write TRUE if the statement is correct, FALSE if it is not.

TRUE    1. React keeps a virtual DOM in memory.
FALSE   2. JSX is compiled by Webpack.

3. A component name must begin with a capital letter.
   ANSWER: TRUE`,
    notes: [
      "The answer may sit before the number, as in items 1 and 2, or on an ANSWER line as in item 3.",
      "TRUE · T · TAMA · WASTO all count as true. FALSE · F · MALI all count as false.",
    ],
  },

  {
    type: "modified-true-false",
    label: "Modified True or False",
    blurb:
      "Bubbled for the truth value, handwritten for the correction. Scored whole or split, "
      + "whichever the exam is set to.",
    sample: `TEST III: MODIFIED TRUE OR FALSE (10 items, 1 point each)
Directions: Write TRUE if correct. If FALSE, give the word that makes it true.

1. JSX is compiled by Webpack.
   ANSWER: FALSE - Babel

2. React keeps a virtual DOM in memory.
   ANSWER: TRUE

3. The useMemo hook runs a side effect after render.
   ANSWER: FALSE, useEffect`,
    notes: [
      "The truth value comes first, then the correcting word after a dash, a comma, or two spaces.",
      "A FALSE item with no correcting word is flagged for review — it cannot be graded as it stands.",
      "A TRUE item needs nothing after it.",
    ],
  },

  {
    type: "identification",
    label: "Identification",
    blurb: "Handwritten on a ruled line, read by the handwriting pass and matched to your key.",
    sample: `TEST IV: IDENTIFICATION (10 items, 2 points each)
Directions: Write the term being described on the line provided.

1. The library used to build user interfaces from components.
   ANSWER: ReactJS / React / React.js

2. The hook that runs a side effect after every render.
   ANSWER: useEffect`,
    notes: [
      "Separate every spelling you will accept with a slash, the word \"or\", or brackets — ReactJS / React, ReactJS or React, ReactJS (React).",
      "Any one of them earns the mark, so list the ones you would accept on paper.",
    ],
  },

  {
    type: "fill-in-the-blanks",
    label: "Fill in the Blanks",
    blurb: "Handwritten. Also covers a code listing where the blanks are numbered inline.",
    sample: `TEST V: FILL IN THE BLANKS (15 items, 1 point each)
Directions: Write the missing word on the line provided.

1. The ________ hook runs a side effect after every render.
   ANSWER: useEffect

TEST VI: COMPLETE THE PROGRAM
Directions: Supply the missing code.

const [count, setCount] = (1: useState)(0);
useEffect(() => {
  document.title = \`Count: \${(2: count)}\`;
}, [count]);`,
    notes: [
      "A \"Complete the Program\" section may write its blanks inside the code as (1: useState) — the number is the item, the text after the colon is the answer.",
      "An ordinary fill-in-the-blanks section is numbered like any other.",
    ],
  },

  {
    type: "enumeration",
    label: "Enumeration",
    blurb: "Handwritten list. Each correct item earns a share of the marks.",
    sample: `TEST VII: ENUMERATION (3 items, 1 point each)
Directions: List the items asked for.

1. Give the three core web technologies.
   ANSWER: HTML, CSS, JavaScript

2. Name the two hooks covered in this lesson.
   ANSWER: useState; useEffect`,
    notes: [
      "Separate the items with commas, semicolons or slashes.",
      "The number of items sets the marks — three items means three points, whatever the heading says.",
    ],
  },
];
