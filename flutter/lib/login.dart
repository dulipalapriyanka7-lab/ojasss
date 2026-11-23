part of 'main.dart';

const _loginBackground = Color(0xff110016);
const _loginLavender = Color(0xffd6c4dd);
const _loginGold = Color(0xffffc83d);
const _loginGradient = LinearGradient(
  colors: [
    Color(0xffb000f5),
    Color(0xffe600c7),
    Color(0xffff526d),
    Color(0xffffa23e),
  ],
);

class _PremiumLogin extends StatefulWidget {
  const _PremiumLogin({required this.api, required this.onFlow});

  final OjasssApi api;
  final Future<void> Function(String) onFlow;

  @override
  State<_PremiumLogin> createState() => _PremiumLoginState();
}

class _PremiumLoginState extends State<_PremiumLogin> {
  static Future<void>? _googleSetup;
  static const _googleClientId = String.fromEnvironment(
    'OJASSS_GOOGLE_SERVER_CLIENT_ID',
    defaultValue:
        '63246551202-3l5900s34iknn1dug9vlql59iqi01mbf.apps.googleusercontent.com',
  );
  bool _signingIn = false;
  bool _browserAvailable = false;
  bool _waitingForBrowser = false;
  Object? _browserAttempt;
  String? _error;

  Future<void> _finishGoogleSignIn() async {
    final profile = object(await widget.api.rpc('get_me'));
    if (profile.string('id').isEmpty) {
      throw const ApiError(
        'Could not load your OJASSS profile. Try again.',
        502,
      );
    }
    if (mounted) Navigator.pop(context, profile);
  }

  Future<void> _googleSignIn() async {
    if (_signingIn) return;
    setState(() {
      _signingIn = true;
      _error = null;
    });
    final google = GoogleSignIn.instance;
    try {
      try {
        await (_googleSetup ??= google.initialize(
          serverClientId: _googleClientId,
        ));
      } catch (_) {
        _googleSetup = null;
        rethrow;
      }
      if (!mounted) return;
      final account = await google.authenticate();
      if (!mounted) return;
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw const ApiError(
          'Google did not return a sign-in credential.',
          401,
        );
      }
      await widget.api.auth('google/native', {'idToken': idToken});
      if (mounted) await _finishGoogleSignIn();
    } on GoogleSignInException {
      // Android can report a configuration failure as a cancelled picker.
      if (mounted) {
        setState(() {
          _browserAvailable = true;
          _error =
              'Google sign-in did not finish. You can try in your browser.';
        });
      }
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _browserAvailable = e.status != 403 && e.status != 409;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _browserAvailable = true;
          _error = 'Could not connect to Google sign-in. Try again.';
        });
      }
    } finally {
      if (mounted) setState(() => _signingIn = false);
    }
  }

  Future<void> _googleInBrowser() async {
    if (_signingIn) return;
    final attempt = Object();
    bool current() => mounted && identical(_browserAttempt, attempt);
    setState(() {
      _browserAttempt = attempt;
      _signingIn = true;
      _waitingForBrowser = true;
      _error = null;
    });
    try {
      final verifier = googleVerifier();
      final started = object(
        await widget.api.auth('google/start', {
          'challenge': googleChallenge(verifier),
        }),
      );
      if (!current()) return;
      final flow = started.string('flow');
      if (!RegExp(r'^[a-f0-9]{48}$').hasMatch(flow)) {
        throw const ApiError('Could not start Google sign-in.', 502);
      }
      final url = Uri.parse(
        '$site/google-sign-in',
      ).replace(queryParameters: {'flow': flow, 'client': 'flutter'});
      if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
        throw const ApiError('Could not open your browser.', 503);
      }
      final proof = {'flow': flow, 'verifier': verifier};
      while (current()) {
        await Future<void>.delayed(const Duration(seconds: 2));
        if (!current()) return;
        final result = object(await widget.api.auth('google/poll', proof));
        if (!current()) return;
        if (!result.flag('ready')) continue;
        setState(() => _waitingForBrowser = false);
        await widget.api.completeGoogleSession(result);
        unawaited(
          widget.api
              .auth('google/ack', proof)
              .then<void>((_) {}, onError: (Object _) {}),
        );
        if (current()) await _finishGoogleSignIn();
        return;
      }
    } on ApiError catch (e) {
      if (current()) setState(() => _error = e.message);
    } catch (_) {
      if (current()) {
        setState(() => _error = 'Browser sign-in was interrupted. Try again.');
      }
    } finally {
      if (current()) _stopBrowserSignIn();
    }
  }

  void _stopBrowserSignIn() => setState(() {
    _browserAttempt = null;
    _waitingForBrowser = false;
    _signingIn = false;
  });

  Widget _enter(Widget child, int ms, {double scale = 1}) =>
      TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : Duration(milliseconds: ms),
        curve: Curves.easeOutCubic,
        builder: (context, value, child) => Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, (1 - value) * 7),
            child: Transform.scale(
              scale: scale + (1 - scale) * value,
              child: child,
            ),
          ),
        ),
        child: child,
      );

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_signingIn,
    child: Scaffold(
      backgroundColor: _loginBackground,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const RepaintBoundary(child: CustomPaint(painter: _LoginLighting())),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, viewport) {
                final compact = viewport.maxHeight < 700;
                return SingleChildScrollView(
                  padding: EdgeInsets.symmetric(
                    horizontal: viewport.maxWidth < 380 ? 22 : 28,
                  ),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Padding(
                              padding: const EdgeInsets.only(top: 10),
                              child: IconButton.outlined(
                                tooltip: 'Back',
                                onPressed: _signingIn
                                    ? null
                                    : () => Navigator.maybePop(context),
                                icon: const Icon(
                                  Icons.arrow_back_rounded,
                                  size: 21,
                                ),
                                style: IconButton.styleFrom(
                                  minimumSize: const Size.square(44),
                                  backgroundColor: const Color(0xa9320044),
                                  side: const BorderSide(
                                    color: Color(0xff704473),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          SizedBox(height: compact ? 9 : 22),
                          _enter(const _LoginBrand(), 300, scale: .94),
                          SizedBox(height: compact ? 20 : 29),
                          _enter(
                            const Column(
                              children: [
                                Text.rich(
                                  TextSpan(
                                    children: [
                                      TextSpan(text: 'Welcome to '),
                                      WidgetSpan(
                                        alignment:
                                            PlaceholderAlignment.baseline,
                                        baseline: TextBaseline.alphabetic,
                                        child: _LoginWordmark(),
                                      ),
                                    ],
                                  ),
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 28,
                                    color: Colors.white,
                                    fontWeight: FontWeight.w900,
                                    height: 1.14,
                                  ),
                                ),
                                SizedBox(height: 8),
                                Text(
                                  'Sign in to save videos, vote, and join challenges.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 14,
                                    color: _loginLavender,
                                    height: 1.35,
                                  ),
                                ),
                              ],
                            ),
                            250,
                          ),
                          SizedBox(height: compact ? 20 : 26),
                          _LoginButton(
                            label: 'Sign in with password',
                            leading: const Icon(
                              Icons.lock_outline_rounded,
                              size: 21,
                            ),
                            primary: true,
                            onPressed: _signingIn
                                ? null
                                : () => widget.onFlow('password'),
                          ),
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 10),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Divider(color: Color(0xff62416e)),
                                ),
                                Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 9),
                                  child: Chip(
                                    label: Text(
                                      'OR',
                                      style: TextStyle(
                                        fontSize: 10,
                                        letterSpacing: 1.4,
                                        color: _loginLavender,
                                      ),
                                    ),
                                    backgroundColor: Color(0xff2b0b35),
                                    padding: EdgeInsets.zero,
                                    visualDensity: VisualDensity.compact,
                                    materialTapTargetSize:
                                        MaterialTapTargetSize.shrinkWrap,
                                    side: BorderSide.none,
                                  ),
                                ),
                                Expanded(
                                  child: Divider(color: Color(0xff62416e)),
                                ),
                              ],
                            ),
                          ),
                          _LoginButton(
                            label: 'Continue with Google',
                            leading: Container(
                              width: 28,
                              height: 28,
                              padding: const EdgeInsets.all(4),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(7),
                              ),
                              child: Image.asset(
                                'assets/google-g.png',
                                excludeFromSemantics: true,
                              ),
                            ),
                            busy: _signingIn,
                            onPressed: _signingIn ? null : _googleSignIn,
                          ),
                          const SizedBox(height: 10),
                          _LoginButton(
                            label: 'Email a sign-in code',
                            leading: const Icon(
                              Icons.mail_outline_rounded,
                              size: 21,
                            ),
                            onPressed: _signingIn
                                ? null
                                : () => widget.onFlow('otp'),
                          ),
                          if (_error != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 10),
                              child: Semantics(
                                liveRegion: true,
                                child: Text(
                                  _error!,
                                  style: const TextStyle(
                                    color: Color(0xffffb3bc),
                                  ),
                                ),
                              ),
                            ),
                          if (_waitingForBrowser)
                            TextButton(
                              onPressed: _stopBrowserSignIn,
                              child: const Text('Cancel browser sign-in'),
                            )
                          else if (_browserAvailable && !_signingIn)
                            TextButton.icon(
                              onPressed: _googleInBrowser,
                              icon: const Icon(Icons.open_in_browser_rounded),
                              label: const Text(
                                'Sign in with Google in browser',
                              ),
                            ),
                          const SizedBox(height: 8),
                          LayoutBuilder(
                            builder: (context, actions) {
                              final buttons = [
                                TextButton.icon(
                                  onPressed: _signingIn
                                      ? null
                                      : () => widget.onFlow('signup'),
                                  icon: const Icon(
                                    Icons.person_add_alt_1_outlined,
                                    size: 17,
                                  ),
                                  label: const Text('Create account'),
                                ),
                                TextButton.icon(
                                  onPressed: _signingIn
                                      ? null
                                      : () => widget.onFlow('recover'),
                                  icon: const Icon(Icons.key_rounded, size: 17),
                                  label: const Text('Forgot password?'),
                                ),
                              ];
                              return TextButtonTheme(
                                data: TextButtonThemeData(
                                  style: TextButton.styleFrom(
                                    foregroundColor: const Color(0xffedc7ef),
                                    minimumSize: const Size(44, 44),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 8,
                                    ),
                                  ),
                                ),
                                child:
                                    actions.maxWidth < 300 ||
                                        MediaQuery.textScalerOf(
                                              context,
                                            ).scale(14) >
                                            17
                                    ? Column(children: buttons)
                                    : Row(
                                        children: [
                                          Expanded(child: buttons[0]),
                                          const SizedBox(
                                            height: 18,
                                            child: VerticalDivider(
                                              width: 1,
                                              color: Color(0xff64416a),
                                            ),
                                          ),
                                          Expanded(child: buttons[1]),
                                        ],
                                      ),
                              );
                            },
                          ),
                          const SizedBox(height: 5),
                          const IgnorePointer(child: _LoginFilmstrip()),
                          const SizedBox(height: 10),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    ),
  );
}

class _LoginBrand extends StatelessWidget {
  const _LoginBrand();

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Container(
        width: 86,
        height: 86,
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: const Color(0xfff7a2d9), width: 1.2),
          boxShadow: const [
            BoxShadow(color: Color(0x81f500b8), blurRadius: 25),
            BoxShadow(color: Color(0x55ff983f), blurRadius: 38),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Image.asset(
            'assets/home-flame.png',
            excludeFromSemantics: true,
            fit: BoxFit.contain,
          ),
        ),
      ),
      const SizedBox(height: 11),
      const FittedBox(
        fit: BoxFit.scaleDown,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 25,
              height: 30,
              child: CustomPaint(painter: _LoginLaurel()),
            ),
            SizedBox(width: 6),
            Text(
              'OJASSS',
              style: TextStyle(
                color: Colors.white,
                fontSize: 30,
                letterSpacing: 3,
                fontWeight: FontWeight.w900,
              ),
            ),
            SizedBox(width: 6),
            SizedBox(
              width: 25,
              height: 30,
              child: CustomPaint(painter: _LoginLaurel(mirrored: true)),
            ),
          ],
        ),
      ),
      const Text(
        'THE INDIAN MASS POWER APP',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: Colors.white,
          fontSize: 10,
          letterSpacing: 1.6,
          fontWeight: FontWeight.w700,
        ),
      ),
    ],
  );
}

class _LoginWordmark extends StatelessWidget {
  const _LoginWordmark();

  @override
  Widget build(BuildContext context) => ShaderMask(
    blendMode: BlendMode.srcIn,
    shaderCallback: (bounds) => const LinearGradient(
      colors: [Color(0xffff60bf), Color(0xffffad51)],
    ).createShader(bounds),
    child: const Text(
      'OJASSS',
      style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, height: 1.14),
    ),
  );
}

class _LoginButton extends StatelessWidget {
  const _LoginButton({
    required this.label,
    required this.leading,
    required this.onPressed,
    this.primary = false,
    this.busy = false,
  });

  final String label;
  final Widget leading;
  final VoidCallback? onPressed;
  final bool primary, busy;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(28),
      gradient: primary ? _loginGradient : null,
      color: primary ? null : const Color(0xdf240c30),
      border: primary ? null : Border.all(color: const Color(0xff823e89)),
      boxShadow: primary
          ? const [
              BoxShadow(
                color: Color(0x55ef3d9e),
                blurRadius: 16,
                offset: Offset(0, 5),
              ),
            ]
          : null,
    ),
    child: TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: Colors.white,
        disabledForegroundColor: _loginLavender,
        minimumSize: const Size.fromHeight(54),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        shape: const StadiumBorder(),
      ),
      child: Row(
        children: [
          SizedBox(width: 28, child: Center(child: leading)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
          ),
          const SizedBox(width: 8),
          if (busy)
            const SizedBox.square(
              dimension: 17,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                semanticsLabel: 'Signing in',
              ),
            )
          else
            const Icon(Icons.arrow_forward_rounded, size: 19),
        ],
      ),
    ),
  );
}

class _LoginLighting extends CustomPainter {
  const _LoginLighting();

  @override
  void paint(Canvas canvas, Size size) {
    final bounds = Offset.zero & size;
    canvas.drawRect(
      bounds,
      Paint()
        ..shader = const RadialGradient(
          center: Alignment(-1, -.48),
          radius: .9,
          colors: [Color(0xff380944), _loginBackground],
        ).createShader(bounds),
    );
    final top = Path()
      ..moveTo(size.width * .30, 0)
      ..cubicTo(
        size.width * .99,
        size.height * .05,
        size.width * .31,
        size.height * .26,
        size.width,
        size.height * .32,
      )
      ..lineTo(size.width, 0)
      ..close();
    canvas.drawPath(
      top,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [Color(0x70ff983f), Color(0x714a0971), Color(0x1021002d)],
        ).createShader(bounds),
    );
    final curve = Path()
      ..moveTo(size.width * .30, 0)
      ..cubicTo(
        size.width * .99,
        size.height * .05,
        size.width * .31,
        size.height * .26,
        size.width,
        size.height * .32,
      );
    canvas.drawPath(
      curve,
      Paint()
        ..color = const Color(0x918f3299)
        ..strokeWidth = 4
        ..style = PaintingStyle.stroke
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
  }

  @override
  bool shouldRepaint(_LoginLighting oldDelegate) => false;
}

class _LoginLaurel extends CustomPainter {
  const _LoginLaurel({this.mirrored = false});
  final bool mirrored;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 25, size.height / 30);
    if (mirrored) {
      canvas.translate(25, 0);
      canvas.scale(-1, 1);
    }
    final gold = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xffffeda7), _loginGold, Color(0xffad6a20)],
      ).createShader(const Rect.fromLTWH(0, 0, 25, 30));
    canvas.drawPath(
      Path()
        ..moveTo(24, 29)
        ..quadraticBezierTo(3, 24, 7, 2),
      Paint()
        ..color = const Color(0xffc88a37)
        ..strokeWidth = 1.2
        ..style = PaintingStyle.stroke,
    );
    for (final (x, y, angle) in <(double, double, double)>[
      (6, 5, -.65),
      (5, 11, -.95),
      (7, 17, -1.05),
      (10, 22, -1.25),
      (16, 26, -1.4),
      (10, 9, .7),
      (12, 15, .5),
      (15, 21, .35),
    ]) {
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(angle);
      canvas.drawPath(
        Path()
          ..moveTo(0, -5)
          ..quadraticBezierTo(4.4, 0, 0, 5)
          ..quadraticBezierTo(-4.4, 0, 0, -5),
        gold,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_LoginLaurel oldDelegate) =>
      mirrored != oldDelegate.mirrored;
}

class _LoginFilmstrip extends StatelessWidget {
  const _LoginFilmstrip();

  @override
  Widget build(BuildContext context) => const FittedBox(
    fit: BoxFit.scaleDown,
    child: SizedBox(
      width: 330,
      height: 92,
      child: CustomPaint(
        painter: _FilmstripPainter(),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Positioned(
              left: 48,
              top: 42,
              child: Icon(
                Icons.play_circle_outline_rounded,
                color: Color(0xfff398d9),
                size: 23,
              ),
            ),
            Positioned(
              left: 106,
              top: 49,
              child: Icon(
                Icons.person_outline_rounded,
                color: Color(0xffe7a6e5),
                size: 22,
              ),
            ),
            Positioned(
              right: 59,
              top: 44,
              child: Icon(
                Icons.videocam_outlined,
                color: Color(0xffe998c6),
                size: 23,
              ),
            ),
            Positioned(
              top: 25,
              child: Icon(
                Icons.emoji_events_rounded,
                size: 47,
                color: _loginGold,
                shadows: [
                  Shadow(color: Color(0xcfff983f), blurRadius: 20),
                  Shadow(color: Color(0xff824419), offset: Offset(0, 3)),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _FilmstripPainter extends CustomPainter {
  const _FilmstripPainter();

  double _top(double x) => 45 - 29 * ((x - 165) / 165) * ((x - 165) / 165);

  @override
  void paint(Canvas canvas, Size size) {
    final ribbon = Path()..moveTo(0, _top(0));
    for (var x = 0.0; x <= 330; x += 3) {
      ribbon.lineTo(x, _top(x));
    }
    for (var x = 330.0; x >= 0; x -= 3) {
      ribbon.lineTo(x, _top(x) + 42);
    }
    ribbon.close();
    final gradient = const LinearGradient(
      colors: [
        Color(0x00320044),
        Color(0xff602050),
        Color(0xff4a1b53),
        Color(0xff6e2552),
        Color(0x00320044),
      ],
    ).createShader(Offset.zero & size);
    canvas.drawPath(ribbon, Paint()..shader = gradient);
    canvas.drawPath(
      ribbon,
      Paint()
        ..shader = gradient
        ..strokeWidth = 1.2
        ..style = PaintingStyle.stroke,
    );
    final holes = Paint()..color = const Color(0xff180620);
    for (var x = 18.0; x < 318; x += 13) {
      for (final y in [_top(x) + 3, _top(x) + 35]) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(x, y, 6.4, 4),
            const Radius.circular(1),
          ),
          holes,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_FilmstripPainter oldDelegate) => false;
}
