import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../widgets/common.dart';

/// How an exam PDF has to be written for CheckWise to read it.
///
/// Every rule here is taken from `server/services/answerKeyParser.js` — the
/// section heading pattern, the accepted answer markers, the TRUE/FALSE words.
/// If the parser changes, this changes with it; guidance that drifts from the
/// code is worse than none, because a teacher follows it and still gets
/// warnings they cannot explain.
///
/// The same rules apply whatever the paper is. A ten-item quiz and an
/// eighty-item final are read by the same parser; length changes nothing.
void showFormatGuide(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: Colors.white,
    builder: (context) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.9,
      maxChildSize: 0.95,
      builder: (context, controller) => FormatGuide(scrollController: controller),
    ),
  );
}

class FormatGuide extends StatelessWidget {
  const FormatGuide({super.key, this.scrollController});

  final ScrollController? scrollController;

  @override
  Widget build(BuildContext context) {
    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
      children: [
        Text('How to write your exam PDF', style: Type.heading(size: 20, weight: FontWeight.w700)),
        const SizedBox(height: 6),
        const Text(
          'CheckWise reads the questions and the answer key straight out of your '
          'finished paper. Follow these and the upload comes back with no '
          'warnings. Works the same for a short quiz or a long final — length '
          'makes no difference.',
          style: TextStyle(fontSize: 13.5, color: Slate.c600, height: 1.55),
        ),

        const SizedBox(height: 24),
        const _Rule(
          n: '1',
          title: 'Number every item',
          body: 'Each question must start with its number. Any of these work:',
          examples: ['1. What is JSX?', '2) What is JSX?', '3] What is JSX?'],
          note: 'Numbering may restart in each section — that is expected.',
        ),

        const _Rule(
          n: '2',
          title: 'Head each section, and name its type',
          body:
              'CheckWise picks the question type out of the heading, so write the '
              'type in it. TEST, PART or SECTION all work, as do plain roman '
              'numerals:',
          examples: [
            'TEST I: MULTIPLE CHOICE',
            'PART 2 - TRUE OR FALSE',
            'III. IDENTIFICATION',
          ],
          note:
              'Recognised types: Multiple Choice · True or False · Modified True '
              'or False · Identification · Fill in the Blanks (or Complete the '
              'Program) · Enumeration.',
        ),

        const _Rule(
          n: '3',
          title: 'Letter your choices',
          body: 'For multiple choice, label the options A through H:',
          examples: ['A. Mounting', 'B) Updating', 'C] Unmounting'],
        ),

        const _Rule(
          n: '4',
          title: 'Mark the correct answer',
          body: 'This is the part that matters most. Any one of these is enough:',
          examples: [
            'Highlight it — the usual way',
            'ANSWER: B      (or ANS, KEY, SAGOT)',
            'TRUE 1. React uses a virtual DOM.',
            'An ANSWER KEY block at the end',
          ],
          note:
              'An item with no answer is not guessed at. It comes back as a '
              'warning and you set it on the review screen.',
        ),

        const _Rule(
          n: '5',
          title: 'True or False wording',
          body: 'Any of these are understood, in English or Filipino:',
          examples: ['TRUE · T · TAMA · WASTO', 'FALSE · F · MALI'],
          note:
              'For Modified True or False, a FALSE item also needs the correcting '
              'word, or it is flagged.',
        ),

        const _Rule(
          n: '6',
          title: 'Accepting more than one spelling',
          body:
              'For written answers, give the variations you will accept — any one '
              'of them earns the mark:',
          examples: ['ReactJS / React', 'ReactJS (React)', 'ReactJS or React'],
        ),

        const _Rule(
          n: '7',
          title: 'Setting the marks per item',
          body: 'Put the count and the points in the section heading:',
          examples: ['TEST I: MULTIPLE CHOICE (40 items, 1 point each)'],
          note: 'Left out, every item in the section is worth 1 point.',
          last: true,
        ),

        const SizedBox(height: 8),
        AppCard(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.lightbulb_outline_rounded, size: 18, color: Brand.c600),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('If something is not read', style: Type.heading(size: 14)),
                    const SizedBox(height: 4),
                    const Text(
                      'Nothing is ever guessed. Anything CheckWise cannot decide '
                      'is listed as a warning and waits for you on the review '
                      'screen — the exam will not be marked ready until you have '
                      'settled it.',
                      style: TextStyle(fontSize: 12.5, color: Slate.c600, height: 1.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 20),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Got it'),
        ),
      ],
    );
  }
}

class _Rule extends StatelessWidget {
  const _Rule({
    required this.n,
    required this.title,
    required this.body,
    this.examples = const [],
    this.note,
    this.last = false,
  });

  final String n;
  final String title;
  final String body;
  final List<String> examples;
  final String? note;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 16 : 24),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: const BoxDecoration(color: Brand.c50, shape: BoxShape.circle),
            alignment: Alignment.center,
            child: Text(
              n,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Brand.c700,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Type.heading(size: 15)),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: const TextStyle(fontSize: 13, color: Slate.c600, height: 1.5),
                ),
                if (examples.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: Slate.c50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Slate.c200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (final example in examples)
                          Padding(
                            padding: EdgeInsets.only(
                              bottom: example == examples.last ? 0 : 6,
                            ),
                            child: Text(
                              example,
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 12.5,
                                color: Slate.c800,
                                height: 1.4,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                if (note != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    note!,
                    style: const TextStyle(fontSize: 12, color: Slate.c500, height: 1.5),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
