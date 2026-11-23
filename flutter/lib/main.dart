import 'dart:async';
import 'dart:io';
import 'dart:ui' show FontFeature;

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import 'api.dart';

part 'feed.dart';
part 'account.dart';
part 'login.dart';
part 'features.dart';
part 'creator.dart';
part 'preferences.dart';
part 'home_feed.dart';
part 'one_chance_feed.dart';
part 'leaderboard.dart';
part 'monster_game.dart';
part 'viral_challenge.dart';
part 'edit_studio.dart';

const _background = Color(0xff0d0a12);
const _panel = Color(0xff1a1621);
const _line = Color(0xff3b3144);
const _muted = Color(0xffbeb2c9);
const _purple = Color(0xffd5a7ff);
const _gradient = LinearGradient(
  colors: [Color(0xffff7655), Color(0xffe6268a), Color(0xff8e28ef)],
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const OjasssApp());
}

class OjasssApp extends StatelessWidget {
  const OjasssApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'OJASSS',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      brightness: Brightness.dark,
      colorScheme: ColorScheme.fromSeed(
        seedColor: _purple,
        brightness: Brightness.dark,
      ),
      scaffoldBackgroundColor: _background,
      useMaterial3: true,
      appBarTheme: const AppBarTheme(
        backgroundColor: _background,
        surfaceTintColor: Colors.transparent,
      ),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
        filled: true,
        fillColor: _panel,
      ),
    ),
    home: const _Shell(),
  );
}

class _Shell extends StatefulWidget {
  const _Shell();
  @override
  State<_Shell> createState() => _ShellState();
}

class _ShellState extends State<_Shell> with WidgetsBindingObserver {
  final api = OjasssApi();
  final links = AppLinks();
  final launch = Completer<void>();
  StreamSubscription<Uri>? subscription;
  Data me = {};
  Data settings = {};
  List<Data> announcements = [];
  int tab = 0;
  int revision = 0;
  String feedCategory = '';
  String feedMode = 'for_you';
  bool ready = false;
  bool homeFullscreen = false;
  bool homeMuted = true;
  bool gamesAvailable = false;
  int gameAccessRequest = 0;
  Timer? usage;
  final activity = Stopwatch()..start();
  int lastInteraction = 0;
  int lastTick = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    subscription = links.uriLinkStream.listen(_onLink);
    unawaited(_start());
    _startUsage();
  }

  void _startUsage() {
    usage?.cancel();
    lastTick = activity.elapsedMilliseconds;
    lastInteraction = lastTick;
    usage = Timer.periodic(const Duration(seconds: 10), (_) {
      final now = activity.elapsedMilliseconds;
      final elapsed = now - lastTick;
      lastTick = now;
      if (me.isEmpty ||
          now - lastInteraction >= 60000 ||
          elapsed < 9000 ||
          elapsed > 15000)
        return;
      unawaited(
        api
            .rpc('weekly_usage_heartbeat', {'seconds': elapsed ~/ 1000})
            .then<void>((_) {}, onError: (_) {}),
      );
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startUsage();
      if (ready) unawaited(_refreshGameAccess());
    } else {
      usage?.cancel();
    }
  }

  Future<void> _refreshGameAccess() async {
    final request = ++gameAccessRequest;
    try {
      final status = object(await api.rpc('monster_game_status'));
      final allowed = status.flag('can_play');
      if (mounted &&
          request == gameAccessRequest &&
          gamesAvailable != allowed) {
        setState(() => gamesAvailable = allowed);
      }
    } catch (_) {
      // The server independently checks authorization when the game opens.
    }
  }

  Future<void> _start() async {
    await _loadAccount();
    if (!mounted) return;
    setState(() => ready = true);
    launch.complete();
    unawaited(_loadReference());
    unawaited(_refreshGameAccess());
    final initial = await links.getInitialLink();
    if (initial != null) _onLink(initial);
  }

  Future<void> _loadAccount() async {
    try {
      await api.restore();
      if (api.token != null) me = object(await api.rpc('get_me'));
    } catch (_) {
      // An offline launch still lets the feed show its own retry control.
    }
  }

  Future<void> _loadReference() async {
    try {
      final results = await Future.wait([
        api.rpc('public_settings'),
        api.rpc('active_announcements'),
      ]);
      if (mounted)
        setState(() {
          settings = object(results[0]);
          announcements = records(results[1]);
        });
    } catch (_) {}
  }

  String? _lastLink;
  void _onLink(Uri uri) {
    if (!mounted ||
        uri.scheme != 'https' ||
        !{'ojasss.com', 'new.ojasss.com'}.contains(uri.host))
      return;
    final parts = uri.pathSegments;
    if (parts.length != 2 || !{'post', 'profile'}.contains(parts.first)) return;
    if (_lastLink == uri.toString()) return;
    _lastLink = uri.toString();
    unawaited(
      launch.future.then((_) {
        if (!mounted) return;
        if (parts.first == 'post')
          openPost(parts.last);
        else
          openProfile(parts.last);
      }),
    );
    Future<void>.delayed(const Duration(seconds: 2), () {
      if (_lastLink == uri.toString()) _lastLink = null;
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    usage?.cancel();
    subscription?.cancel();
    super.dispose();
  }

  Future<T?> push<T>(Widget page) =>
      Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => page));

  Future<bool>? _accountFlow;

  Future<bool> requireAccount() async {
    if (_accountFlow != null) return false;
    final flow = _finishAccount();
    _accountFlow = flow;
    try {
      return await flow;
    } finally {
      _accountFlow = null;
    }
  }

  Future<bool> _finishAccount() async {
    if (me.isNotEmpty &&
        me.flag('onboarded') &&
        me['category_preferences'] != null) {
      return true;
    }
    if (me.isEmpty) {
      final profile = await push<Data>(_AuthPage(api: api));
      if (!mounted || profile == null || profile.isEmpty) return false;
      updateProfile(profile);
    }
    if (!me.flag('onboarded')) await editProfile(onboarding: true);
    if (!mounted || !me.flag('onboarded')) return false;
    if (mounted && me.flag('onboarded') && me['category_preferences'] == null) {
      if (await openPreferences()) return false;
    }
    return mounted && me['category_preferences'] != null;
  }

  Future<bool> openPreferences({bool closeSettings = false}) async {
    final category = await push<String>(_Preferences(shell: this));
    if (!mounted || category == null) return false;
    if (closeSettings) Navigator.of(context).pop();
    setState(() {
      feedCategory = category == 'one_chance' ? '' : category;
      feedMode = 'for_you';
      tab = category == 'one_chance' ? 3 : 0;
      revision++;
    });
    return true;
  }

  Future<void> editProfile({bool onboarding = false}) async {
    final profile = await push<Data>(
      _EditProfile(api: api, profile: me, onboarding: onboarding),
    );
    if (profile != null) updateProfile(profile, refreshFeed: false);
  }

  void updateProfile(Data profile, {bool refreshFeed = true}) {
    if (!mounted || profile.isEmpty) return;
    final accountChanged = me.string('id') != profile.string('id');
    setState(() {
      me = profile;
      if (accountChanged) gamesAvailable = false;
      if (refreshFeed) revision++;
    });
    if (accountChanged) unawaited(_refreshGameAccess());
  }

  Future<void> signOut() async {
    try {
      await api.signOut();
    } catch (_) {}
    if (mounted)
      setState(() {
        me = {};
        gamesAvailable = false;
        tab = 0;
        feedCategory = '';
        feedMode = 'for_you';
        revision++;
      });
    if (mounted) unawaited(_refreshGameAccess());
  }

  Future<void> select(int selected) async {
    if (selected == 5) {
      await push<void>(_MonsterLobby(shell: this));
      return;
    }
    if (selected == 2) {
      await openCreate();
      return;
    }
    if (selected == 4 && !await requireAccount()) return;
    if (mounted) setState(() => tab = selected);
  }

  Future<void> openCreate({bool openEditor = false}) async {
    if (!await requireAccount() || !mounted) return;
    final id = await push<String>(
      _UploadPage(shell: this, openEditor: openEditor),
    );
    if (id == null || !mounted) return;
    setState(() {
      tab = 0;
      revision++;
    });
    openPost(id);
  }

  void openPost(String id) =>
      unawaited(push<void>(_Feed(shell: this, postId: id)));
  void openProfile(String handle) =>
      unawaited(push<void>(_Profile(shell: this, handle: handle)));
  void openUpdates() => unawaited(push<void>(_Updates(shell: this)));

  void setHomeFullscreen(bool fullscreen) {
    if (mounted) setState(() => homeFullscreen = fullscreen);
  }

  void openHomeFeed(String mode, [String category = '']) {
    setState(() {
      feedMode = mode;
      feedCategory = category;
      homeFullscreen = false;
      tab = 0;
      revision++;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!ready) return const Scaffold(body: _HomeLoading());
    final current = switch (tab) {
      1 => _Discover(shell: this),
      3 => _Feed(
        key: ValueKey('chance-$revision'),
        shell: this,
        oneChance: true,
      ),
      4 => _Profile(
        key: ValueKey('profile-$revision'),
        shell: this,
        embedded: true,
      ),
      _ => _Feed(
        key: ValueKey('feed-$revision'),
        shell: this,
        initialCategory: feedCategory,
        initialMode: feedMode,
      ),
    };
    return Scaffold(
      backgroundColor: tab == 0 || tab == 3 ? _homeBackground : _background,
      body: PopScope(
        canPop: !homeFullscreen,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop && homeFullscreen) setHomeFullscreen(false);
        },
        child: Listener(
          onPointerDown: (_) => lastInteraction = activity.elapsedMilliseconds,
          child: current,
        ),
      ),
      bottomNavigationBar: tab == 0 || tab == 3
          ? (homeFullscreen
                ? null
                : _HomeNavigation(
                    onSelect: select,
                    active: tab,
                    showGames: gamesAvailable,
                  ))
          : SafeArea(
              top: false,
              child: Container(
                margin: const EdgeInsets.fromLTRB(12, 4, 12, 7),
                height: 56,
                decoration: _decoration(radius: 23),
                child: Row(
                  children: List.generate(5, (i) {
                    const titles = [
                      'Home',
                      'Discover',
                      'Create',
                      'One Chance',
                      'Profile',
                    ];
                    const icons = [
                      Icons.home_outlined,
                      Icons.explore_outlined,
                      Icons.add,
                      Icons.auto_awesome_outlined,
                      Icons.person_outline,
                    ];
                    final active = tab == i || i == 2;
                    return Expanded(
                      child: InkWell(
                        onTap: () => select(i),
                        borderRadius: BorderRadius.circular(20),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              width: i == 2 ? 40 : 42,
                              height: i == 2 ? 40 : 29,
                              decoration: BoxDecoration(
                                gradient: active ? _gradient : null,
                                borderRadius: BorderRadius.circular(15),
                              ),
                              child: Icon(
                                icons[i],
                                size: i == 2 ? 28 : 20,
                                color: active ? Colors.white : _muted,
                              ),
                            ),
                            if (i != 2)
                              Flexible(
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text(
                                    titles[i],
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: active ? Colors.white : _muted,
                                    ),
                                  ),
                                ),
                              ),
                            if (i == 2) Semantics(label: 'Create'),
                          ],
                        ),
                      ),
                    );
                  }),
                ),
              ),
            ),
    );
  }
}

BoxDecoration _decoration({double radius = 12, Color color = _panel}) =>
    BoxDecoration(
      color: color,
      border: Border.all(color: _line),
      borderRadius: BorderRadius.circular(radius),
    );

class _Brand extends StatelessWidget {
  const _Brand();
  @override
  Widget build(BuildContext context) => Container(
    height: 30,
    width: 100,
    decoration: _decoration(radius: 10),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: Image.asset('assets/home-flame.png', width: 22, height: 22),
        ),
        const SizedBox(width: 5),
        const Flexible(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              'OJASSS',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                letterSpacing: 1,
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

void _notice(BuildContext context, Object message) {
  ScaffoldMessenger.of(
    context,
  ).showSnackBar(SnackBar(content: Text(message.toString())));
}

Future<void> _external(BuildContext context, String value) async {
  final uri = Uri.tryParse(value);
  if (uri == null || !{'https', 'upi', 'tel', 'mailto'}.contains(uri.scheme))
    return;
  final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!opened && context.mounted) _notice(context, 'Could not open this link.');
}

class _Load extends StatefulWidget {
  const _Load({super.key, required this.fetch, required this.render});
  final Future<Object?> Function() fetch;
  final Widget Function(Object? value, VoidCallback reload) render;
  @override
  State<_Load> createState() => _LoadState();
}

class _LoadState extends State<_Load> {
  late Future<Object?> future = widget.fetch();
  void reload() => setState(() => future = widget.fetch());
  @override
  Widget build(BuildContext context) => FutureBuilder(
    future: future,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done)
        return const Center(child: CircularProgressIndicator());
      if (snapshot.hasError)
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(snapshot.error.toString(), textAlign: TextAlign.center),
                TextButton(onPressed: reload, child: const Text('Try again')),
              ],
            ),
          ),
        );
      return widget.render(snapshot.data, reload);
    },
  );
}

class _Avatar extends StatelessWidget {
  const _Avatar(
    this.api,
    this.path,
    this.name, {
    this.size = 42,
    this.ring = false,
  });
  final OjasssApi api;
  final String path;
  final String name;
  final double size;
  final bool ring;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    padding: EdgeInsets.all(ring ? 2 : 0),
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      gradient: ring ? _gradient : null,
    ),
    child: ClipOval(
      child: path.isEmpty
          ? _initial()
          : Image.network(
              api.media(path, 'avatars').toString(),
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => _initial(),
            ),
    ),
  );
  Widget _initial() => ColoredBox(
    color: const Color(0xff41254e),
    child: Center(
      child: Text(
        name.isEmpty ? 'O' : name.characters.first.toUpperCase(),
        style: TextStyle(fontSize: size * .34, fontWeight: FontWeight.w700),
      ),
    ),
  );
}

class _Cards extends StatelessWidget {
  const _Cards({required this.items, required this.shell});
  final List<Data> items;
  final _ShellState shell;
  @override
  Widget build(BuildContext context) {
    if (items.isEmpty)
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Nothing here yet'),
        ),
      );
    return GridView.builder(
      padding: const EdgeInsets.all(10),
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        childAspectRatio: .7,
        crossAxisSpacing: 6,
        mainAxisSpacing: 6,
      ),
      itemCount: items.length,
      itemBuilder: (context, i) {
        final post = items[i];
        final video = post.string('kind') == 'video';
        final path = video
            ? post.string('thumbnail_path')
            : post.string('media_path');
        return InkWell(
          onTap: () => shell.openPost(post.string('id')),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Stack(
              fit: StackFit.expand,
              children: [
                const ColoredBox(color: _panel),
                if (path.isNotEmpty)
                  Image.network(
                    shell.api.media(path).toString(),
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => const SizedBox(),
                  ),
                if (video)
                  const Positioned(
                    right: 6,
                    top: 6,
                    child: Icon(Icons.play_arrow, size: 16),
                  ),
                Positioned(
                  left: 6,
                  right: 6,
                  bottom: 5,
                  child: Text(
                    post.string('caption'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      shadows: [Shadow(color: Colors.black, blurRadius: 8)],
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
