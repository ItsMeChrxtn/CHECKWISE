# CheckWise

**Smart Exam Checking. Accurate Results.**

CheckWise is an automated exam checking and OMR grading system. Teachers create an
exam, confirm the answer key, generate a printable answer sheet, scan the completed
sheets with a phone or scanner, and get graded results and reports automatically.

Built on the MERN stack — MongoDB, Express, React and Node.

---

## Status

| Phase | Scope | State |
| ----- | ----- | ----- |
| **1** | Project setup, authentication, protected routes, dashboard | ✅ **Complete** |
| **2** | Exam management (create, list, details, edit, delete) | ✅ **Complete** |
| **3** | Document upload — exam PDF, answer key, text extraction | ✅ **Complete** |
| **4** | Answer key parser + teacher review | ✅ **Complete** (per-question editing pending) |
| **5** | Answer sheet generator (two columns, sections, bubbles, QR, markers) | ✅ **Complete** |
| **6** | Automatic checking — OMR, handwriting OCR, grading engine | ✅ **Complete** |
| 7 | Results storage, review and dashboard statistics | Partly — papers are stored and reviewable; class reports pending |
| 8 | CSV/Excel export and final testing | Not started |

Sidebar entries for later phases are marked `P5`–`P8` and lead to a page describing
what will live there — no dead links.

---

## The exam document

CheckWise builds everything from the exam you already wrote. Export it from Word or
Google Docs as a **PDF** — the file must carry a real text layer, so a scan or a photo
of a printed paper will be rejected until OCR arrives in Phase 6.

The parser needs only two things: **numbered items**, and **answers it can find**.

### Marking the answers

**Highlighting works.** A highlighted run is read as the answer for its line, which is
how most answer keys are already written — nothing in the text layer distinguishes
`d. Mounting` from the three wrong choices, but the highlight does.

```
TEST I: MULTIPLE CHOICE (ANSWER KEY)
1. In the React Component Life Cycle, the first phase is called:
   a. Rendering   b. Updating   c. Unmounting
   d. Mounting                          <- highlighted: the answer is D

TEST II: TRUE OR FALSE (ANSWER KEY)
TRUE 1. React uses camelCase for event names.    <- answer before the number

TEST III: IDENTIFICATION (ANSWER KEY)
ReactJS (React) 1. The library used to build ... <- "X (Y)" = either spelling scores

TEST IV: COMPLETE THE PROGRAM (ANSWER KEY)
import { (1: useState) } from "(2: react)";      <- numbered blanks, read inline
```

The other three shapes still work, and can be mixed in one document:

```
1. What is the capital of Japan?
A. Osaka   B. Tokyo   C. Kyoto        ANSWER: B   <- beside the question

ANSWER KEY                                        <- or one block at the end
1. B   2. C   3. TRUE
5. FALSE - mitochondrion              <- modified true or false: value + correction
6. Heart / Puso                       <- identification: acceptable variations
8. solid, liquid, gas                 <- enumeration: one point per item
```

### Sections and numbering

Each `TEST`/`PART`/`SECTION` heading that names a type starts a new section, and its
items restart at 1. CheckWise keeps that printed number in `sectionNumber` and prints it
under the same heading on the answer sheet, so the sheet reads exactly like the
questionnaire in the student's hand. `questionNumber` stays unique across the exam for
storage and grading. A `(15 items, 1 point each)` note in the directions sets the marks
per item.

Section headings are optional. Without them the type is inferred: lettered choices mean
multiple choice, a TRUE/FALSE answer means true or false, a `____` run means fill in the
blanks, and anything else is identification.

Two-column layouts are handled: the page is cut into bands at each full-width line, and
the left column of a band is read before the right.

Nothing parsed is trusted. The exam lands in **needs-review** and only becomes **ready**
once a teacher confirms the key — an unreadable item is reported as a warning rather
than guessed at, so a bad parse can never silently grade a student's paper.

---

## Checking a paper

Print the generated answer sheet, have the students fill it in, then hold each paper up
to the camera — **Scan with camera** on the exam page recognises the sheet and scores it
by itself, no shutter button.

Files work too: **JPG, PNG or PDF**. A PDF straight off a document scanner or copier needs
no preparation — its pages are rendered at 180 dpi and read exactly as photos are, so a
two-page sheet scanned into one PDF still produces one score.

The camera fires on its own because the browser checks each preview frame for the
sheet's four corner squares and the page-number squares along its bottom edge. Only when
the same page has been seen steadily for several frames is a full-resolution frame
captured, so a blur or a half-visible sheet cannot trigger a reading. Pages are collected
until the whole sheet is in hand and sent together — a two-page sheet is still one score.
Papers scanned without a name are numbered (`Paper 3`) and renamed from the list, so a
stack can be worked through without stopping to type.

> **On a phone:** browsers only grant camera access in a secure context, and a plain
> `http://` address on the LAN is not one. Run `npm run dev:mobile` in `client/` — it
> serves the app over HTTPS on the local network and prints the address to open. The
> certificate is self-signed, so the phone will ask you to accept it once.

The sheet records where it printed every bubble (`exam.answerSheetLayout`), so reading
one back is a mapping problem rather than a search: the scanner finds the four corner
squares, solves the projective transform that takes sheet coordinates to image pixels,
and looks at exactly those spots. That transform is what makes a **photo taken at an
angle** work — it absorbs rotation, scale and keystone, so nothing here needs a flat-bed
scanner. It assumes a *flat* page, though: a creased or curled paper is not a projective
transform of the original and will misread, so flatten it before scanning.

Each page carries a run of small squares along its bottom edge — one for page 1, two for
page 2 — so a page identifies itself. Images can be scanned or uploaded in any order.

What the scanner will not do is guess. A mark too faint to count, or two marks equally
dark on one row, comes back as `blank` or `ambiguous` and earns nothing until a person
settles it. A wrong confident answer costs a student marks; a flagged one costs seconds.

### Written answers

Identification, fill-in-the-blanks and enumeration answers are cut out of the scan as
straightened strips and read with **Tesseract** (`services/handwritingService.js`), then
graded like any other answer. Nothing waits for a teacher: what is read is marked.

How closely an answer must match is the exam's own setting,
`gradingConfig.strictWrittenAnswers`:

| Written | Key | Strict (default) | Lenient |
| ------- | --- | ---------------- | ------- |
| `usestate` | `useState` | correct | correct |
| `React js` | `ReactJS` | **wrong** | correct |
| `the heart` | `Heart` | **wrong** | correct |
| `photosynthisis` | `photosynthesis` | **wrong** | correct |
| `Babble` | `Babel` | **wrong** | **wrong** |
| `Real DOM` | `Virtual DOM` | **wrong** | **wrong** |

**Strict** accepts only the spellings written into the key. Capitals and stray
punctuation are still ignored — those are how an answer was written down, not what it
says — but nothing is added: the key is the teacher's ruling and software should not
quietly widen it.

**Lenient** forgives typos in proportion to length (roughly one edit per five
characters) and accepts the key's words wrapped in a little filler. The tolerance is
still tight, since forgiving too much marks a wrong answer right.

A blank that is pure punctuation — `""`, `/>`, `</>` in a code listing — is compared
literally under both, since there the punctuation *is* the answer.

> **Strict and scanning pull against each other.** The handwriting reader makes its own
> mistakes, and under strict grading they land on the student. On one test paper the
> same scan scored **77/80 lenient and 73/80 strict** — the four marks were lost to
> `usedtate`, `firsthame`, `setFirsthame` and `Reacts`, all of which the student had
> written correctly. If papers are scanned rather than typed in, consider turning strict
> off, or check the low-confidence readings before releasing marks.

> **What this costs.** Tesseract is trained on printed text. It reads clean block
> capitals well — which is what the sheet asks students for — and cursive badly, and it
> fails by returning confident nonsense rather than by admitting doubt. Since answers are
> marked on what it reads, a misread becomes a wrong mark with nothing to catch it. Each
> answer's `confidence` is stored and shown beside it in the review table, and the strip
> of the paper is kept, so a queried mark can be checked against what the student
> actually wrote. Only a line that yields *no* text at all is held back for typing in.

Enumeration is scored item by item and ignores order; Modified True or False takes its
truth value from the bubble and its correction word from the written line. Every change
regrades the whole paper server-side, so the score can never drift from the answers.

---

## The phone app

`mobile/` is a Flutter companion that covers the half of CheckWise a phone is
actually good at: signing in, browsing exams, **photographing completed answer
sheets and having them scored**, and settling whatever the scanner refused to
guess at. Writing exams, uploading the PDF, reviewing the parsed key and
printing the sheet stay here on the web app.

```bash
cd mobile
flutter pub get
flutter run
```

The one setting that has to be right is the server address — a phone has no
`localhost` pointing at your PC, so there is no dev-server proxy to hide behind.
It defaults to `http://10.0.2.2:5000` (the Android emulator's alias for the host
machine) and is editable in-app under **Settings > CheckWise server**, which
probes `/api/health` before keeping it. For a real phone on the same Wi-Fi, use
your PC's LAN IP and open TCP 5000 through the firewall.

Unlike the browser scanner, the shutter is manual: the corner-square detector in
`client/src/utils/sheetVision.js` has no Dart port, so the app gives you a
framing guide and a button. Everything after the photo — finding the corners,
solving the transform, reading the bubbles and the handwriting, grading — is the
same server code either way.

See `mobile/README.md` for the full layout.

---

## Requirements

- **Node.js** 18 or newer (developed on 22)
- **MongoDB** running locally, or a MongoDB Atlas connection string
- **Flutter** 3.35 or newer — only for the phone app in `mobile/`

---

## Setup

### 1. Backend

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env` and set at minimum `MONGODB_URI` and `JWT_SECRET`. Generate a
secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Start the API:

```bash
npm run dev      # nodemon, reloads on change
# or
npm start
```

The API listens on <http://localhost:5000>. Check it with
<http://localhost:5000/api/health>.

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` and `/uploads` to
the backend, so no CORS setup is needed in development.

### 3. Create an account

Register a **teacher** account from the sign-up page.

Admin accounts are provisioned from the command line rather than through
self-service signup:

```bash
cd server
npm run seed:admin -- --email you@school.edu --password "YourStrongPassword" --name "System Admin"
```

Run against an existing email to promote that account to admin.

---

## Environment variables

`server/.env` (see `server/.env.example`):

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `5000`) |
| `NODE_ENV` | `development` or `production` |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Signing secret for JWTs — required |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `CLIENT_URL` | Origin allowed by CORS (default `http://localhost:5173`) |
| `MAX_UPLOAD_MB` | Upload size limit for PDFs and scan images |

`client/.env` is optional; set `VITE_API_URL` only to point at an API other than the
dev proxy.

`.env` is gitignored. Never commit real secrets.

---

## Project structure

```
checkwise/
├── mobile/           Flutter phone app — see mobile/README.md
│   └── lib/
│       ├── core/     api client, server address, theme, formatters
│       ├── models/   User, Exam, Result, DashboardStats
│       ├── screens/  login, dashboard, exams, scan, results, settings
│       └── widgets/
├── client/
│   └── src/
│       ├── components/   Button, Input, Modal, Sidebar, Topbar, charts, states
│       ├── context/      AuthContext, ToastContext
│       ├── hooks/        useAuth, useToast
│       ├── layouts/      AuthLayout, DashboardLayout
│       ├── pages/        Login, Register, Dashboard, Settings, NotFound
│       ├── services/     axios instance + API services
│       └── utils/
└── server/
    ├── config/       env validation, MongoDB connection
    ├── controllers/  auth, dashboard
    ├── middleware/   auth, role, validation, upload, error
    ├── models/       User, Exam, Result
    ├── routes/       /api/auth, /api/dashboard
    ├── services/     storage layer
    ├── uploads/      exams/, answer-sheets/, scanned/
    └── utils/        ApiError, asyncHandler, token, examCode, seedAdmin
```

---

## API

All responses share one shape. Success:

```json
{ "success": true, "data": { } }
```

Failure:

```json
{ "success": false, "message": "Incorrect email or password.", "errors": { } }
```

`errors` is an optional field → message map used to highlight form fields.

### Implemented

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Service check |
| `POST` | `/api/auth/register` | Public | Create a teacher account |
| `POST` | `/api/auth/login` | Public | Sign in, returns a JWT |
| `GET` | `/api/auth/me` | Authenticated | Current user (rehydrates session) |
| `POST` | `/api/auth/logout` | Authenticated | End session |
| `GET` | `/api/dashboard/stats` | Teacher, Admin | Live dashboard aggregations |
| `POST` | `/api/exams` | Teacher, Admin | Create an exam |
| `GET` | `/api/exams` | Teacher, Admin | List exams (`q`, `status`, `sort`, `page`, `limit`) |
| `GET` | `/api/exams/:id` | Owner, Admin | Exam details + checked-paper count |
| `PATCH` | `/api/exams/:id` | Owner, Admin | Update details and grading config |
| `DELETE` | `/api/exams/:id` | Owner, Admin | Delete exam, its results and its files |
| `POST` | `/api/exams/:id/document` | Owner, Admin | Upload the exam PDF (`pdf`), read it, derive the questions |
| `PUT` | `/api/exams/:id/questions` | Owner, Admin | Save review corrections (replaces the array) |
| `POST` | `/api/exams/:id/confirm` | Owner, Admin | Confirm the answer key → `ready` |
| `POST` | `/api/exams/:id/answer-sheet` | Owner, Admin | Generate the printable answer sheet |
| `GET` | `/api/exams/:id/answer-sheet` | Owner, Admin | Download the generated sheet |
| `POST` | `/api/exams/:id/scan` | Owner, Admin | Read one student's sheet (`images`: JPG/PNG/PDF, optional `studentName`) and score it |
| `GET` | `/api/exams/:id/results` | Owner, Admin | Every paper checked against this exam |
| `GET` | `/api/results` | Teacher, Admin | Recent papers |
| `GET` | `/api/results/:id` | Owner, Admin | One paper, question by question |
| `PATCH` | `/api/results/:id` | Owner, Admin | Type in written answers / override a mark, then regrade |
| `DELETE` | `/api/results/:id` | Owner, Admin | Delete a paper and its scan |

Authenticate with `Authorization: Bearer <token>`.

Teachers are scoped to their own exams; admins see every teacher's. Requesting
another teacher's exam returns **404**, not 403, so exam ids cannot be probed.

Answer-key, OMR and result endpoints arrive in later phases.

---

## Security

- Passwords hashed with **bcrypt** (12 rounds); `password` is `select: false` and
  stripped from every JSON response.
- **JWT** auth; the user record is re-read on each request, so a deactivated
  account loses access immediately rather than when its token expires.
- **Role-based authorization** — signup always creates a `teacher`; the role is
  never read from the request body.
- Login and registration are **rate limited** (20 attempts / 15 min).
- Unknown email and wrong password return the **same** message, so accounts cannot
  be enumerated.
- Upload middleware validates **MIME type and file size**; stored filenames are
  generated, never taken from the client.
- Storage keys are resolved against the upload root to block **path traversal**.
- `helmet` security headers; CORS restricted to `CLIENT_URL`.

---

## Data model

`User` — name, email (unique), password (hashed), role (`admin` | `teacher`),
isActive, lastLoginAt.

`Exam` — teacherId, title, subject, description, passingScore, gradingConfig,
questions[], answerKeyConfirmed, unique `examCode`, plus the derived
`totalQuestions`, `totalPoints` and `status` (`draft` → `needs-review` → `ready`).

`questions[]` is one flexible sub-schema covering all six supported types —
`multiple-choice`, `true-false`, `modified-true-false`, `identification`,
`fill-in-the-blanks` and `enumeration` — with `correctAnswers[]`, `choices[]`,
`truthValue`, `correctionAnswers[]`, `enumerationCount` and `points`. Fields that
do not apply to a question's current type simply stay empty, so a teacher can
change a question's type on the review screen without recreating it.

Each question also carries `section` and `sectionNumber`. Exams are written in
sections that restart their numbering, so `sectionNumber` holds the number printed
on the paper while `questionNumber` stays unique across the exam. The answer sheet
prints `sectionNumber` under its `section` heading; results and grading key on
`questionNumber`.

`gradingConfig` — `modifiedTrueFalseScoring` (`whole`: one point only if the truth
value *and* the correction are right; `split`: one point each) and
`enumerationPartialCredit`.

`Result` — examId, teacherId, studentName, studentId, answers[] (with per-question
confidence and status), tallies, score, percentage, passed, scannedImage.

`totalQuestions`, `totalPoints` and `status` are denormalised on save rather than
computed as virtuals, because the exam list and dashboard read with `.lean()`,
which skips virtuals. They are always recomputed from `questions`, so they cannot
drift from the data.

`Result` still carries the Phase 1 multiple-choice shape; it is reworked for the
six question types in Phase 6, alongside the grading engine.

Exam codes look like `CHK-2026-8F42A`. The alphabet omits `I`, `O`, `0` and `1` to
avoid OCR ambiguity when the code is read back off a scanned answer sheet.

---

## Dashboard

Every figure is aggregated live from MongoDB — a new account correctly reads zero
across the board and shows empty states.

- Totals: exams, answer sheets checked, students, average score, pass rate
- Answer sheets checked over the last 7 days
- Score distribution across bands
- Average score per exam
- Recent exams and recent results
- Admins additionally see system-wide user counts

Charts are single-series and use one brand hue validated for lightness, chroma and
≥ 3:1 contrast against the card surface. Identity never rides on colour alone.

---

## Scripts

**server**

| Command | Does |
| --- | --- |
| `npm run dev` | Start with nodemon |
| `npm start` | Start the API |
| `npm run seed:admin` | Create or promote an admin account |

**client**

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |

---

## Storage

Uploads are written under `server/uploads/` into `exams/`, `answer-sheets/` and
`scanned/`. Paths stored in MongoDB are bucket-relative keys such as
`exams/1724750000-midterm.pdf`, never absolute disk paths — so moving to
Cloudinary, Cloudflare R2 or S3 means reimplementing `services/storageService.js`
and nothing else.
