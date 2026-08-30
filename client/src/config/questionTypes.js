/**
 * The six supported question types.
 *
 * These identifiers must stay in step with QUESTION_TYPES in
 * server/models/Exam.js - they are the values stored in MongoDB and sent over
 * the API, so a rename here without a matching migration would silently orphan
 * existing questions.
 */
export const QUESTION_TYPES = [
  "multiple-choice",
  "true-false",
  "modified-true-false",
  "identification",
  "fill-in-the-blanks",
  "enumeration",
];

export const QUESTION_TYPE_LABELS = {
  "multiple-choice": "Multiple Choice",
  "true-false": "True or False",
  "modified-true-false": "Modified True or False",
  identification: "Identification",
  "fill-in-the-blanks": "Fill in the Blanks",
  enumeration: "Enumeration",
};

/** Short labels for table columns and badges where space is tight. */
export const QUESTION_TYPE_SHORT_LABELS = {
  "multiple-choice": "Multiple Choice",
  "true-false": "True or False",
  "modified-true-false": "Modified T/F",
  identification: "Identification",
  "fill-in-the-blanks": "Fill in the Blanks",
  enumeration: "Enumeration",
};

/** Ready-made `<Select>` options, in the order the types are declared. */
export const QUESTION_TYPE_OPTIONS = QUESTION_TYPES.map((value) => ({
  value,
  label: QUESTION_TYPE_LABELS[value],
}));

/** Types answered by shading a bubble, so they can be read by the OMR scanner. */
export const OMR_TYPES = ["multiple-choice", "true-false", "modified-true-false"];

export function questionTypeLabel(type) {
  return QUESTION_TYPE_LABELS[type] ?? type;
}
