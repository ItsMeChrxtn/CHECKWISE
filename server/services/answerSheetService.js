import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { BUCKETS, UPLOAD_ROOT } from "./storageService.js";

/**
 * Builds the printable answer sheet for an exam.
 *
 * The layout is driven entirely by the parsed questions, so the sheet always
 * matches the uploaded exam: four bubbles for a four-choice item, two for True
 * or False, a ruled line for identification, N lines for an enumeration. Items
 * are printed under their section heading using the number the student sees on
 * the questionnaire, which restarts at 1 in every section.
 *
 * Answers flow down the left column and continue down the right one, which
 * roughly halves the paper an exam costs to sit.
 *
 * Everything is measured in PDF points (72 per inch) from a fixed grid. That
 * matters because Phase 6 reads these sheets back: the scanner needs the corner
 * markers to deskew the page and the bubble centres to sit where this file says
 * they do. Change a constant here and the reader must change with it.
 */

const PAGE = { size: "LETTER", width: 612, height: 792, margin: 40 };

/** Solid squares the scanner uses to find and square up the page. */
const MARKER = 16;

/**
 * A run of small squares along the top edge that says which page this is:
 * one square for page 1, two for page 2, and so on.
 *
 * Without it a camera held over a sheet has no way of knowing which page it is
 * looking at, and the teacher would have to say - which is exactly the fiddling
 * that pointing a camera at the paper is meant to replace.
 */
const PAGE_MARK = {
  size: 7,
  spacing: 13,
  max: 8,
  // Along the bottom edge: the top of page 1 belongs to the title block, and
  // the footer text is centred, so this strip is free on every page.
  x: PAGE.margin + MARKER + 16,
  get y() {
    return PAGE.height - PAGE.margin - MARKER + (MARKER - this.size) / 2;
  },
};

/** The band the columns live in, inside the markers. */
const CONTENT = {
  left: PAGE.margin + MARKER + 10,
  right: PAGE.width - PAGE.margin - MARKER - 10,
  bottom: PAGE.height - PAGE.margin - MARKER - 18,
};

const GUTTER = 26;
const COLUMN_WIDTH = (CONTENT.right - CONTENT.left - GUTTER) / 2;
const COLUMN_X = [CONTENT.left, CONTENT.left + COLUMN_WIDTH + GUTTER];

const BUBBLE = {
  radius: 6.5,
  gap: 30, // centre-to-centre spacing between bubbles in a row
  labelSize: 7.5,
};

const ROW = {
  height: 23, // one bubble question
  numberWidth: 24, // the "12." column
  writeInHeight: 21,
};

const SECTION_HEADING_HEIGHT = 22;

const COLORS = {
  ink: "#111111",
  rule: "#9aa0a6",
  muted: "#5f6368",
};

/**
 * Generates the sheet and writes it into the answer-sheets bucket.
 *
 * @param {import("mongoose").Document} exam
 * @returns {Promise<{ key: string, pageCount: number }>} bucket-relative key
 */
export async function generateAnswerSheet(exam) {
  const filename = `${exam.examCode}-answer-sheet.pdf`;
  const key = `${BUCKETS.answerSheets}/${filename}`;
  const fullPath = path.join(UPLOAD_ROOT, BUCKETS.answerSheets, filename);

  // Encoding the code rather than a URL keeps the sheet readable offline.
  const qrDataUrl = await QRCode.toDataURL(exam.examCode, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: 220,
  });
  const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");

  const doc = new PDFDocument({ size: PAGE.size, margin: PAGE.margin, autoFirstPage: false });
  const stream = fs.createWriteStream(fullPath);
  doc.pipe(stream);

  const cursor = { page: 0, column: 0, y: 0, top: 0 };
  let section = null;

  /**
   * Where every bubble ended up, in PDF points from the top-left corner.
   *
   * The scanner reads this back rather than recomputing the grid: the sheet is
   * the source of truth for its own geometry, so a later layout change cannot
   * silently move the bubbles out from under an already-printed paper.
   */
  const layout = {
    pageSize: { width: PAGE.width, height: PAGE.height },
    bubbleRadius: BUBBLE.radius,
    markerSize: MARKER,
    // Marker centres, clockwise from the top-left.
    markers: [
      [PAGE.margin + MARKER / 2, PAGE.margin + MARKER / 2],
      [PAGE.width - PAGE.margin - MARKER / 2, PAGE.margin + MARKER / 2],
      [PAGE.width - PAGE.margin - MARKER / 2, PAGE.height - PAGE.margin - MARKER / 2],
      [PAGE.margin + MARKER / 2, PAGE.height - PAGE.margin - MARKER / 2],
    ],
    // Where to sample the page-number squares, and how many can be there.
    pageMark: {
      x: PAGE_MARK.x,
      y: PAGE_MARK.y + PAGE_MARK.size / 2,
      size: PAGE_MARK.size,
      spacing: PAGE_MARK.spacing,
      max: PAGE_MARK.max,
    },
    bubbles: [],
    writeIns: [],
  };

  const startPage = (withHeader) => {
    if (cursor.page > 0) drawFooter(doc, exam, cursor.page);
    doc.addPage();
    cursor.page += 1;
    drawMarkers(doc);
    drawPageMark(doc, cursor.page);
    cursor.top = withHeader
      ? drawHeader(doc, exam, qrBuffer)
      : PAGE.margin + MARKER + 12;
    cursor.column = 0;
    cursor.y = cursor.top;
  };

  /** Moves to the next column, or the next page once both are used. */
  const nextColumn = () => {
    if (cursor.column === 0) {
      cursor.column = 1;
      cursor.y = cursor.top;
    } else {
      startPage(false);
    }
    // A section running past a column break says so, so the numbers read right.
    if (section) {
      cursor.y = drawSectionHeading(doc, `${section} (continued)`, cursor);
    }
  };

  startPage(true);

  const questions = [...exam.questions].sort((a, b) => a.questionNumber - b.questionNumber);

  for (const question of questions) {
    const height = rowHeight(question);

    if ((question.section || "") !== section) {
      section = question.section || "";
      if (section) {
        // Never leave a heading stranded at the foot of a column.
        if (cursor.y + SECTION_HEADING_HEIGHT + height > CONTENT.bottom) {
          cursor.column === 0 ? ((cursor.column = 1), (cursor.y = cursor.top)) : startPage(false);
        }
        cursor.y = drawSectionHeading(doc, section, cursor);
      }
    }

    if (cursor.y + height > CONTENT.bottom) nextColumn();

    cursor.y = drawQuestionRow(doc, question, cursor, layout);
  }

  drawFooter(doc, exam, cursor.page);
  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return { key, pageCount: cursor.page, layout };
}

/** Four corner squares - the scanner's reference frame. */
function drawMarkers(doc) {
  const positions = [
    [PAGE.margin, PAGE.margin],
    [PAGE.width - PAGE.margin - MARKER, PAGE.margin],
    [PAGE.margin, PAGE.height - PAGE.margin - MARKER],
    [PAGE.width - PAGE.margin - MARKER, PAGE.height - PAGE.margin - MARKER],
  ];
  doc.fillColor(COLORS.ink);
  for (const [x, y] of positions) doc.rect(x, y, MARKER, MARKER).fill();
}

/** One small square per page number, counted by the scanner. */
function drawPageMark(doc, pageNumber) {
  doc.fillColor(COLORS.ink);
  for (let i = 0; i < Math.min(pageNumber, PAGE_MARK.max); i += 1) {
    doc
      .rect(PAGE_MARK.x + i * PAGE_MARK.spacing, PAGE_MARK.y, PAGE_MARK.size, PAGE_MARK.size)
      .fill();
  }
}

/** Title block, student fields and QR. Returns the y the columns start at. */
function drawHeader(doc, exam, qrBuffer) {
  const { left, right } = CONTENT;
  let y = PAGE.margin + 4;

  const qrSize = 58;
  doc.image(qrBuffer, right - qrSize, y, { width: qrSize });

  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(14);
  doc.text(exam.title, left, y, { width: right - left - qrSize - 12 });
  y = doc.y + 2;

  doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
  doc.text(`${exam.subject}  ·  ${exam.totalQuestions} items  ·  ${exam.totalPoints} points`, left, y);
  y = doc.y + 1;

  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COLORS.ink);
  doc.text(`EXAM CODE  ${exam.examCode}`, left, y);
  y = Math.max(doc.y + 8, PAGE.margin + qrSize + 6);

  doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
  const fields = [
    { label: "NAME (Last, First)", width: 230 },
    { label: "SECTION", width: 100 },
    { label: "DATE", width: 85 },
  ];
  let x = left;
  for (const field of fields) {
    doc.text(field.label, x, y);
    doc
      .moveTo(x, y + 21)
      .lineTo(x + field.width, y + 21)
      .strokeColor(COLORS.rule)
      .lineWidth(0.8)
      .stroke();
    x += field.width + 14;
  }
  y += 30;

  doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLORS.muted);
  doc.text(
    "Shade the circle completely with a black or blue pen. Erase changes cleanly. Write words in CAPITAL LETTERS.",
    left,
    y,
    { width: right - left }
  );
  y = doc.y + 8;

  doc.moveTo(left, y).lineTo(right, y).strokeColor(COLORS.rule).lineWidth(0.8).stroke();
  return y + 10;
}

function drawFooter(doc, exam, pageNumber) {
  doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
  doc.text(
    `${exam.examCode}  ·  page ${pageNumber}  ·  CheckWise`,
    CONTENT.left,
    PAGE.height - PAGE.margin - MARKER + 4,
    { width: CONTENT.right - CONTENT.left, align: "center" }
  );
}

function drawSectionHeading(doc, label, cursor) {
  const x = COLUMN_X[cursor.column];

  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLORS.ink);
  doc.text(label.toUpperCase(), x, cursor.y + 5, { width: COLUMN_WIDTH, lineBreak: false });

  const ruleY = cursor.y + SECTION_HEADING_HEIGHT - 5;
  doc
    .moveTo(x, ruleY)
    .lineTo(x + COLUMN_WIDTH, ruleY)
    .strokeColor(COLORS.rule)
    .lineWidth(0.6)
    .stroke();

  return cursor.y + SECTION_HEADING_HEIGHT;
}

/** Vertical space one question needs, so a column break never splits a row. */
function rowHeight(question) {
  switch (question.questionType) {
    case "modified-true-false":
      // The correction line sits under the bubbles: a column is too narrow for
      // both side by side.
      return ROW.height + ROW.writeInHeight;
    case "identification":
    case "fill-in-the-blanks":
      return ROW.writeInHeight + 4;
    case "enumeration":
      return 14 + (question.enumerationCount || 3) * ROW.writeInHeight;
    default:
      return ROW.height;
  }
}

function drawQuestionRow(doc, question, cursor, layout) {
  const x = COLUMN_X[cursor.column];
  const y = cursor.y;
  const rightEdge = x + COLUMN_WIDTH;

  /** Records a bubble so the scanner knows exactly where to look for it. */
  const noteBubble = (value, centreX, centreY) => {
    layout.bubbles.push({
      questionNumber: question.questionNumber,
      value,
      page: cursor.page,
      x: round(centreX),
      y: round(centreY),
    });
  };

  const noteWriteIn = (lineX, lineY, width) => {
    layout.writeIns.push({
      questionNumber: question.questionNumber,
      page: cursor.page,
      x: round(lineX),
      y: round(lineY),
      width: round(width),
    });
  };

  // The number the student sees on the questionnaire, not the storage id.
  const printed = question.sectionNumber ?? question.questionNumber;

  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.ink);
  doc.text(`${printed}.`, x, y + 4, { width: ROW.numberWidth, align: "right" });

  const contentX = x + ROW.numberWidth + 6;

  switch (question.questionType) {
    case "multiple-choice": {
      // One bubble per choice actually present in the exam, never a fixed four.
      const count = Math.max(question.choices.length, 2);
      drawBubbleRow(doc, contentX, y, letters(count), noteBubble);
      return y + ROW.height;
    }

    case "true-false": {
      drawBubbleRow(doc, contentX, y, ["TRUE", "FALSE"], noteBubble, ["T", "F"]);
      return y + ROW.height;
    }

    case "modified-true-false": {
      drawBubbleRow(doc, contentX, y, ["TRUE", "FALSE"], noteBubble, ["T", "F"]);
      doc.font("Helvetica").fontSize(6.5).fillColor(COLORS.muted);
      doc.text("if FALSE, the correct word:", contentX + 2.5 * BUBBLE.gap, y + 6, {
        width: rightEdge - contentX - 2.5 * BUBBLE.gap,
        lineBreak: false,
      });
      drawWriteInLine(doc, contentX, y + ROW.height + 12, rightEdge - contentX);
      noteWriteIn(contentX, y + ROW.height + 12, rightEdge - contentX);
      return y + ROW.height + ROW.writeInHeight;
    }

    case "enumeration": {
      const count = question.enumerationCount || 3;
      let lineY = y + 12;
      for (let i = 0; i < count; i += 1) {
        doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted);
        doc.text(`${i + 1})`, contentX, lineY - 2, { width: 13 });
        drawWriteInLine(doc, contentX + 15, lineY + 9, rightEdge - contentX - 15);
        noteWriteIn(contentX + 15, lineY + 9, rightEdge - contentX - 15);
        lineY += ROW.writeInHeight;
      }
      return lineY + 2;
    }

    default: {
      // identification and fill-in-the-blanks
      drawWriteInLine(doc, contentX, y + ROW.writeInHeight - 6, rightEdge - contentX);
      noteWriteIn(contentX, y + ROW.writeInHeight - 6, rightEdge - contentX);
      return y + ROW.writeInHeight + 4;
    }
  }
}

/** Rounds to a tenth of a point - plenty for a scanner, and keeps the doc small. */
function round(value) {
  return Math.round(value * 10) / 10;
}

/**
 * @param {string[]} values  - what each bubble means to the grader ("A", "TRUE")
 * @param {string[]} [labels] - what is printed inside it, when shorter
 */
function drawBubbleRow(doc, x, y, values, noteBubble, labels = values) {
  const centreY = y + ROW.height / 2 - 2;
  values.forEach((value, index) => {
    const label = labels[index];
    const centreX = x + BUBBLE.radius + index * BUBBLE.gap;
    if (noteBubble) noteBubble(value, centreX, centreY);
    doc
      .circle(centreX, centreY, BUBBLE.radius)
      .strokeColor(COLORS.ink)
      .lineWidth(0.9)
      .stroke();
    doc.font("Helvetica").fontSize(BUBBLE.labelSize).fillColor(COLORS.ink);
    doc.text(label, centreX - BUBBLE.radius, centreY - BUBBLE.labelSize / 2 - 0.5, {
      width: BUBBLE.radius * 2,
      align: "center",
      lineBreak: false,
    });
  });
}

function drawWriteInLine(doc, x, y, width) {
  doc.moveTo(x, y).lineTo(x + width, y).strokeColor(COLORS.rule).lineWidth(0.8).stroke();
}

/** ["A","B","C","D"] for a four-choice question. */
function letters(count) {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}
