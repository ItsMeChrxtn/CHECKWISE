# CheckWise Mobile

**The scanner half of CheckWise, on a phone.**

A Flutter companion to the CheckWise web app. It signs a teacher in against the
same API, lists their exams, **photographs completed answer sheets and has them
scored**, and lets them settle whatever the scanner refused to guess at.

---

## What it does, and what it deliberately does not

The phone's reason to exist is the camera. Everything that is desk work stays on
the web app.

| On the phone | On the web app |
| ------------ | -------------- |
| Sign in / register | Create and edit exams |
| Dashboard — totals, pass rate, checked-per-day, score distribution | Upload the exam PDF |
| Exams — search, filter, paged list | Review the parsed answer key |
| **Scan a paper** — multi-page camera capture | Confirm the answer key |
| Results — every paper, with a "needs review" filter | Generate and print the answer sheet |
| Correct flagged answers; rename or delete a paper | CSV/Excel export |

The split is in Settings, written out as four steps, so it is clear where to go
rather than looking like missing features.

### Two honest differences from the web scanner

1. **The shutter is manual.** The browser scanner fires by itself: it checks
   each preview frame for the sheet's four corner squares and captures once it
   has seen the same page steadily. That detector is `client/src/utils/sheetVision.js`
   and has no Dart port, so this app gives you a shutter button and a framing
   guide instead. Reading and grading are unchanged — the server does all of it.
2. **No PDF picking yet.** The camera and the photo library both work. Feeding
   in a PDF straight off a document scanner is supported by the API but not
   wired to a file picker here.

---

## Running it

The API and MongoDB must already be running — see the root `README.md`.

```bash
cd mobile
flutter pub get
flutter run
```

### The server address

This is the one thing that has to be right, and it is the usual reason a fresh
install cannot sign in. A phone has no `localhost` pointing at your PC, so
unlike the web client there is no dev-server proxy to hide behind.

| Where the app runs | Address |
| ------------------ | ------- |
| Android emulator | `http://10.0.2.2:5000` (the default) |
| A real phone on the same Wi-Fi | `http://<your-PC-IP>:5000` |

`10.0.2.2` is the emulator's alias for the host machine; its own `127.0.0.1` is
the emulated phone, not your computer.

Three ways to set it, in order of precedence:

```bash
# 1. At build time
flutter run --dart-define=CHECKWISE_API_URL=http://192.168.1.5:5000

# 2. In the app — Settings > CheckWise server, or the link under the sign-in
#    form. "Test and save" probes /api/health and refuses to keep an address
#    that does not answer.

# 3. Otherwise the platform default above.
```

For a real phone, the server must also be reachable across the LAN: it already
binds `0.0.0.0`, but Windows Firewall has to allow inbound TCP 5000.

---

## How it is put together

```
lib/
├── core/
│   ├── api_client.dart     Dio + token interceptor; flattens every failure to ApiException
│   ├── api_config.dart     the server address, persisted; 10.0.2.2 default on Android
│   ├── theme.dart          the web client's design tokens, as Dart
│   └── formatters.dart     dates, percentages, initials
├── models/                 User, Exam/Question, Result/Answer, DashboardStats
├── services/services.dart  one wrapper per resource, mirroring client/src/services/*.js
├── state/                  AuthController — the session, verified against /auth/me at launch
├── screens/                login, server, shell, dashboard, exams, exam detail,
│                           scan, results, result detail, settings
└── widgets/common.dart     AppCard, StatCard, Pill, EmptyState, ErrorState, ScoreRing
```

A few decisions worth knowing:

- **The score is never computed on the phone.** Corrections are sent to
  `PATCH /api/results/:id` and the server regrades the whole paper, so a score
  can never drift from the answers behind it.
- **Pages are collected before anything is sent.** A sheet that runs to two
  pages is one paper and one score, so they go up in a single request. Each page
  says which one it is, so they can be shot in any order.
- **The student name is optional.** Pointing a camera at a stack of papers
  should not stop for typing; the server numbers unnamed papers (`Paper 3`) and
  they are renamed from the result screen.
- **The base URL is resolved per request**, so changing it in Settings takes
  effect without a restart.
- **A stored token is not trusted on its own** — it is checked against
  `/auth/me` at launch, so a session the server has stopped accepting lands on
  the sign-in screen rather than inside a broken shell.

### Cleartext HTTP

`android/app/src/main/res/xml/network_security_config.xml` permits cleartext,
because CheckWise runs on a LAN over plain `http` and the address is a setting
the teacher types in — it cannot be known at build time, and this config matches
hostnames rather than IP ranges, so there is no "any 192.168.x.x" to write. If
CheckWise ever moves behind https on a real domain, flip `cleartextTrafficPermitted`
to `false` and list the dev addresses in a `<domain-config>`.
