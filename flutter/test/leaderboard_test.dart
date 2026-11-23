import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ojasss/main.dart';

void main() {
  for (final width in [320.0, 390.0, 430.0]) {
    testWidgets('rank cards align at ${width.toInt()} dp', (tester) async {
      tester.view.physicalSize = Size(width, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Column(
                children: [
                  for (var rank = 1; rank <= 5; rank++) ...[
                    if (rank > 1) const SizedBox(height: 8),
                    WinnerRankCard(
                      rank: rank,
                      username: rank == 5
                          ? 'long_bronze_creator_handle'
                          : 'creator_$rank',
                      avatar: const ColoredBox(color: Colors.deepPurple),
                      votes: 93,
                      views: 339,
                      videos: 25,
                      seconds: 12420,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      );

      final cards = find.byType(WinnerRankCard);
      expect(cards, findsNWidgets(5));
      final first = tester.getRect(cards.first);
      for (var i = 0; i < 5; i++) {
        final rect = tester.getRect(cards.at(i));
        expect(rect.left, first.left);
        expect(rect.right, first.right);
        expect(rect.height, 82);
        expect(rect.top, first.top + i * 90);
      }
      for (final name in [
        'rank-number',
        'rank-avatar',
        'rank-details',
        'rank-username',
        'rank-badge',
      ]) {
        final elements = find.byKey(ValueKey(name));
        expect(elements, findsNWidgets(5));
        final left = tester.getTopLeft(elements.first).dx;
        for (var i = 1; i < 5; i++) {
          expect(tester.getTopLeft(elements.at(i)).dx, left);
        }
      }
      expect(find.text('03h 27m'), findsNWidgets(5));
      expect(find.text('PLATINUM'), findsOneWidget);
      expect(find.textContaining('Score'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
