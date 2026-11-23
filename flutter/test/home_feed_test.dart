import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ojasss/main.dart';

class _FixtureHttp extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) => _Client();
}

class _Client implements HttpClient {
  @override
  Duration? connectionTimeout;

  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async =>
      _Request(url);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Headers implements HttpHeaders {
  @override
  ContentType? contentType;

  @override
  void set(String name, Object value, {bool preserveHeaderCase = false}) {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Request implements HttpClientRequest {
  static int votes = 0;
  static bool joined = false;
  static bool challengeActive = true;
  static bool preferencesSaved = true;
  _Request(this.url);
  final Uri url;

  @override
  bool followRedirects = false;

  @override
  final HttpHeaders headers = _Headers();

  @override
  void add(List<int> data) {}

  @override
  Future<HttpClientResponse> close() async {
    return _Response(switch (url.pathSegments.last) {
      'active_announcements' => [
        {
          'id': 'update',
          'title': 'Last Date: 14-11-2026',
          'message': '10 Members Join అయితే ₹350 Reward!',
        },
      ],
      'get_me' => _viewer(),
      'start' when url.path.endsWith('/google/start') => {
        'flow': '0123456789abcdef0123456789abcdef0123456789abcdef',
      },
      'poll' when url.path.endsWith('/google/poll') => {
        'ready': true,
        'session': {
          'access_token': 'test-google-token',
          'refresh_token': 'test-google-refresh',
        },
      },
      'save_category_preferences' => _savePreferences(),
      'viral_challenge_feed' => {
        'items': challengeActive ? [_challenge] : [],
      },
      'viral_challenge_join' => _joinChallenge(),
      'viral_challenge_detail' => _challengeDetail(),
      'challenge_public' => {
        'banner': {'name': 'Entertainment challenge', 'status': 'live'},
      },
      'competition_live' => {
        'competition': {
          'end': DateTime.now().add(const Duration(days: 1)).toIso8601String(),
          'config': {
            'targets': [10, 8, 6, 4, 2],
          },
        },
        'top_groups': {
          for (var rank = 1; rank <= 5; rank++)
            '$rank': [
              {
                'rank': rank,
                'username': 'creator_$rank',
                'votes': 100 - rank,
                'views': 303 - rank,
                'video_count': 26 - rank,
                'seconds': 12420 - rank * 600,
              },
            ],
        },
        'totals': {'votes': 485, 'views': 1500, 'viral': 75, 'active_users': 5},
        'viewer_active_seconds': 12300,
      },
      'vote_one_chance' => {'my_voted': true, 'votes_count': 1200 + ++votes},
      'feed' || 'trending_posts' => [
        {
          'id': 'video-1',
          'kind': 'video',
          'author_id': 'creator',
          'author_display_name': 'Kopparapu Gowthami',
          'author_username': 'kopparapugowthami',
          'author_verified': true,
          'category': 'entertainment',
          'created_at': '2026-11-12T13:28:00',
          'content_origin': 'new_content',
          'hot_count': 0,
          'one_chance_ready': true,
          'votes_count': 1200,
        },
      ],
      _ => {},
    });
  }

  static const _challenge = {
    'id': 'test-challenge',
    'title': 'Comedy week',
    'category': 'entertainment',
    'description': 'Publish a comedy reel.',
    'status': 'active',
    'target': 2,
    'starts_at': '2026-11-13T00:00:00Z',
    'ends_at': '2026-11-20T00:00:00Z',
  };
  static Map<String, dynamic> _viewer() => {
    'id': 'viewer',
    'onboarded': true,
    'category_preferences': preferencesSaved
        ? {
            'selected': ['entertainment'],
            'show_all': false,
          }
        : null,
  };
  static Map<String, dynamic> _savePreferences() {
    preferencesSaved = true;
    return _viewer();
  }

  static Map<String, dynamic> _challengeDetail() => {
    'challenge': _challenge,
    'can_join': !joined,
    'can_upload': joined,
    'joined': joined,
    'server_time': '2026-11-14T00:00:00Z',
    'submissions': [],
    'submitted': 0,
    'qualified': 0,
  };
  static Map<String, dynamic> _joinChallenge() {
    joined = true;
    return _challengeDetail();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Response extends Stream<List<int>> implements HttpClientResponse {
  _Response(this.body);
  final Object body;

  @override
  int get statusCode => 200;

  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int>)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) => Stream<List<int>>.value(utf8.encode(jsonEncode(body))).listen(
    onData,
    onError: onError,
    onDone: onDone,
    cancelOnError: cancelOnError,
  );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final path = Platform.environment['OJASSS_TEST_FONTS'];
    if (path == null) return;
    final text = FontLoader('Roboto')
      ..addFont(
        File(
          '$path/roboto-regular.ttf',
        ).readAsBytes().then(ByteData.sublistView),
      );
    await text.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(
        File(
          '$path/materialicons-regular.otf',
        ).readAsBytes().then(ByteData.sublistView),
      );
    await icons.load();
  });
  testWidgets('login options fit a short phone with large text', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(360, 600);
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final platform =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    for (final channel in [
      'com.llfbandit.app_links/messages',
      'com.llfbandit.app_links/events',
      'plugins.it_nomads.com/flutter_secure_storage',
    ]) {
      platform.setMockMethodCallHandler(
        MethodChannel(channel),
        (_) async => null,
      );
    }
    await HttpOverrides.runWithHttpOverrides(() async {
      await tester.pumpWidget(const OjasssApp());
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(find.text('Profile'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      tester.platformDispatcher.textScaleFactorTestValue = 1.5;
      await tester.pump();
      expect(find.text('Sign in with password'), findsOneWidget);
      expect(find.text('Continue with Google'), findsOneWidget);
      await tester.ensureVisible(find.text('Continue with Google'));
      await tester.tap(find.text('Continue with Google'));
      await tester.pumpAndSettle();
      expect(find.text('Sign in with Google in browser'), findsOneWidget);
      await tester.ensureVisible(find.text('Sign in with password'));
      await tester.tap(find.text('Sign in with password'));
      await tester.pumpAndSettle();
      final password = find.byType(EditableText).last;
      expect(tester.widget<EditableText>(password).obscureText, isTrue);
      await tester.tap(find.byTooltip('Show password'));
      await tester.pump();
      expect(tester.widget<EditableText>(password).obscureText, isFalse);
      Navigator.of(tester.element(password)).pop();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Email a sign-in code'));
      await tester.tap(find.text('Email a sign-in code'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextFormField, 'Email'), findsOneWidget);
      await tester.enterText(find.byType(EditableText), 'viewer@example.test');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Verify viewer@example.test'), findsOneWidget);
      expect(find.textContaining('Resend in'), findsOneWidget);
      await tester.enterText(find.byType(EditableText), '123456');
      await tester.tap(find.text('Verify'));
      await tester.pumpAndSettle();
      expect(find.text('Continue with Google'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    }, _FixtureHttp());
  });
  testWidgets(
    'Google browser fallback completes the app login and stores the session',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(393, 873);
      addTearDown(tester.view.reset);
      final platform =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      for (final channel in [
        'com.llfbandit.app_links/messages',
        'com.llfbandit.app_links/events',
      ]) {
        platform.setMockMethodCallHandler(
          MethodChannel(channel),
          (_) async => null,
        );
      }
      final saved = <String>[];
      platform.setMockMethodCallHandler(
        const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
        (call) async {
          if (call.method == 'write')
            saved.add(call.arguments['value'] as String);
          return null;
        },
      );
      Uri? browserUrl;
      platform.setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/url_launcher'),
        (call) async {
          browserUrl = Uri.parse(call.arguments['url'] as String);
          return true;
        },
      );
      await HttpOverrides.runWithHttpOverrides(() async {
        await tester.pumpWidget(const OjasssApp());
        await tester.pump(const Duration(milliseconds: 500));
        await tester.tap(find.text('Profile'));
        await tester.pumpAndSettle();
        final google = find.text('Continue with Google');
        await tester.ensureVisible(google);
        await tester.tap(google);
        await tester.pumpAndSettle();
        final fallback = find.text('Sign in with Google in browser');
        await tester.ensureVisible(fallback);
        await tester.tap(fallback);
        await tester.pump();
        expect(browserUrl?.host, 'ojasss.com');
        expect(browserUrl?.path, '/google-sign-in');
        expect(browserUrl?.queryParameters['client'], 'flutter');
        expect(browserUrl?.queryParameters.containsKey('verifier'), isFalse);
        await tester.pump(const Duration(seconds: 2));
        await tester.pumpAndSettle();
        expect(
          saved.any((session) => session.contains('test-google-token')),
          isTrue,
        );
        expect(google, findsNothing);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      }, _FixtureHttp());
    },
  );
  testWidgets(
    'interrupted category setup reopens and saves on the next account action',
    (tester) async {
      _Request.preferencesSaved = false;
      addTearDown(() => _Request.preferencesSaved = true);
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(393, 873);
      addTearDown(tester.view.reset);
      final platform =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      platform.setMockMethodCallHandler(
        const MethodChannel('com.llfbandit.app_links/messages'),
        (_) async => null,
      );
      platform.setMockMethodCallHandler(
        const MethodChannel('com.llfbandit.app_links/events'),
        (_) async => null,
      );
      platform.setMockMethodCallHandler(
        const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
        (call) async =>
            call.method == 'read' ? '{"access_token":"test-token"}' : null,
      );
      Future<void> render() async {
        for (var i = 0; i < 15; i++) {
          await tester.pump(const Duration(milliseconds: 30));
        }
      }

      await HttpOverrides.runWithHttpOverrides(() async {
        await tester.pumpWidget(const OjasssApp());
        await render();
        await tester.tap(find.text('Profile'));
        await render();
        expect(find.text('Make it Your'), findsOneWidget);
        Navigator.of(tester.element(find.text('Make it Your'))).pop();
        await render();
        await render();
        await tester.tap(find.text('Profile'));
        await render();
        expect(find.text('Make it Your'), findsOneWidget);
        final show = find.text('Show My Videos');
        await tester.ensureVisible(find.text('I want to see all categories'));
        await tester.tap(find.text('I want to see all categories'));
        await tester.pump();
        await tester.ensureVisible(show);
        await tester.tap(show);
        await render();
        expect(_Request.preferencesSaved, isTrue);
        await render();
        expect(find.text('Make it Your'), findsNothing);
        await tester.pumpWidget(const SizedBox.shrink());
      }, _FixtureHttp());
    },
  );
  for (final size in [
    const Size(360, 800),
    const Size(393, 873),
    const Size(412, 915),
    const Size(430, 915),
  ]) {
    testWidgets(
      'native home layout at ${size.width.toInt()}×${size.height.toInt()}',
      (tester) async {
        _Request.joined = false;
        _Request.challengeActive = size.width != 430;
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = size;
        addTearDown(tester.view.reset);
        final platform =
            TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
        platform.setMockMethodCallHandler(
          const MethodChannel('com.llfbandit.app_links/messages'),
          (_) async => null,
        );
        platform.setMockMethodCallHandler(
          const MethodChannel('com.llfbandit.app_links/events'),
          (_) async => null,
        );
        platform.setMockMethodCallHandler(
          const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
          (call) async =>
              call.method == 'read' ? '{"access_token":"test-token"}' : null,
        );
        await HttpOverrides.runWithHttpOverrides(() async {
          final screenshot = GlobalKey();
          await tester.pumpWidget(
            RepaintBoundary(key: screenshot, child: const OjasssApp()),
          );
          for (var i = 0; i < 15; i++) {
            await tester.pump(const Duration(milliseconds: 30));
          }
          expect(find.text('OJASSS'), findsOneWidget);
          expect(
            find.text('Viral Challenge'),
            _Request.challengeActive ? findsOneWidget : findsNothing,
          );
          expect(
            find.text('Comedy week'),
            _Request.challengeActive ? findsOneWidget : findsNothing,
          );
          if (_Request.challengeActive) {
            await tester.tap(find.text('Join Now'));
            for (var i = 0; i < 15; i++) {
              await tester.pump(const Duration(milliseconds: 30));
            }
            expect(find.text('Publish a comedy reel.'), findsOneWidget);
            await tester.tap(find.text('Join Challenge'));
            for (var i = 0; i < 15; i++) {
              await tester.pump(const Duration(milliseconds: 30));
            }
            expect(find.text('Upload Challenge Video'), findsOneWidget);
            await tester.tap(find.text('Upload Challenge Video'));
            await tester.pumpAndSettle();
            expect(find.text('Challenge video'), findsOneWidget);
            expect(find.text('Photo'), findsNothing);
            expect(find.text('Comedy week'), findsOneWidget);
            Navigator.of(tester.element(find.text('Challenge video'))).pop();
            await tester.pump();
            await tester.pump(const Duration(milliseconds: 400));
            Navigator.of(
              tester.element(find.text('Viral Challenge').last),
            ).pop();
            await tester.pump();
            await tester.pump(const Duration(milliseconds: 400));
          }
          expect(find.text('Kopparapu Gowthami'), findsOneWidget);
          expect(find.text('Respect'), findsOneWidget);
          expect(find.text('New Content'), findsOneWidget);
          expect(find.text('Home'), findsOneWidget);
          expect(find.text('Trending'), findsOneWidget);
          expect(find.byTooltip('Fullscreen'), findsOneWidget);
          expect(find.text('Viral'), findsNothing);
          expect(tester.takeException(), isNull);
          final artifactDir = Platform.environment['OJASSS_TEST_SCREENSHOTS'];
          if (artifactDir != null) {
            await tester.runAsync(() async {
              final render =
                  screenshot.currentContext!.findRenderObject()!
                      as RenderRepaintBoundary;
              final picture = await render.toImage(pixelRatio: 1);
              final bytes = await picture.toByteData(
                format: ui.ImageByteFormat.png,
              );
              await File(
                '$artifactDir/home-${size.width.toInt()}x${size.height.toInt()}.png',
              ).writeAsBytes(bytes!.buffer.asUint8List());
              picture.dispose();
            });
          }
          await tester.tap(find.byTooltip('Fullscreen'));
          await tester.pump(const Duration(milliseconds: 300));
          expect(find.text('OJASSS'), findsNothing);
          expect(find.byTooltip('Exit fullscreen'), findsOneWidget);
          await tester.tap(find.byTooltip('Exit fullscreen'));
          await tester.pump(const Duration(milliseconds: 300));
          expect(find.text('Home'), findsOneWidget);
          _Request.votes = 0;
          await tester.tap(find.text('One Chance'));
          for (var i = 0; i < 15; i++) {
            await tester.pump(const Duration(milliseconds: 30));
          }
          expect(find.text('Weekly challenge'), findsOneWidget);
          expect(find.text('Entertainment challenge'), findsOneWidget);
          expect(find.text('Contest Video'), findsOneWidget);
          expect(find.text('1200'), findsOneWidget);
          expect(find.text('New Content'), findsNothing);
          expect(find.byIcon(Icons.bolt_rounded), findsNothing);
          expect(
            find.byIcon(Icons.local_fire_department_outlined),
            findsNothing,
          );
          if (artifactDir != null) {
            await tester.runAsync(() async {
              final render =
                  screenshot.currentContext!.findRenderObject()!
                      as RenderRepaintBoundary;
              final picture = await render.toImage(pixelRatio: 1);
              final bytes = await picture.toByteData(
                format: ui.ImageByteFormat.png,
              );
              await File(
                '$artifactDir/one-chance-${size.width.toInt()}x${size.height.toInt()}.png',
              ).writeAsBytes(bytes!.buffer.asUint8List());
              picture.dispose();
            });
          }

          await tester.tap(find.text('1200'));
          for (var i = 0; i < 12; i++) {
            await tester.pump(const Duration(milliseconds: 30));
          }
          expect(find.text('Voted'), findsOneWidget);
          expect(find.text('1201'), findsOneWidget);
          expect(_Request.votes, 1);
          await tester.tap(find.text('View'));
          await tester.pumpAndSettle();
          expect(find.text('Leaderboard'), findsOneWidget);
          expect(find.text('Weekly Competition'), findsOneWidget);
          expect(find.text('Group Chat'), findsOneWidget);
          final list = find.byType(Scrollable).last;
          await tester.scrollUntilVisible(
            find.text('BRONZE'),
            130,
            scrollable: list,
          );
          expect(find.text('BRONZE'), findsOneWidget);
          if (artifactDir != null) {
            await tester.runAsync(() async {
              final render =
                  screenshot.currentContext!.findRenderObject()!
                      as RenderRepaintBoundary;
              final picture = await render.toImage(pixelRatio: 1);
              final bytes = await picture.toByteData(
                format: ui.ImageByteFormat.png,
              );
              await File(
                '$artifactDir/leaderboard-${size.width.toInt()}x${size.height.toInt()}.png',
              ).writeAsBytes(bytes!.buffer.asUint8List());
              picture.dispose();
            });
          }
          expect(tester.takeException(), isNull);
          Navigator.of(tester.element(find.text('BRONZE'))).pop();
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
          await tester.tap(find.bySemanticsLabel('Create'));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
          expect(find.text('New video'), findsOneWidget);
          expect(find.text('Copy-Paste video'), findsOneWidget);
          expect(find.text('Upload poster'), findsOneWidget);
          Navigator.of(tester.element(find.text('New video'))).pop();
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
          await tester.tap(find.text('Profile'));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
          expect(find.text('Edit Studio'), findsOneWidget);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
        }, _FixtureHttp());
      },
    );
  }
}
