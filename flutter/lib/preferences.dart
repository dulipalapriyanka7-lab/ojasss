part of 'main.dart';

const _preferencePink = Color(0xfff36aef);
const _preferenceBackground = Color(0xff0c0612);
const _preferenceButton = LinearGradient(
  colors: [
    Color(0xffff9b22),
    Color(0xffff4f5b),
    Color(0xffe800b8),
    Color(0xffa000ff),
  ],
);

class _Preferences extends StatefulWidget {
  const _Preferences({required this.shell});
  final _ShellState shell;

  @override
  State<_Preferences> createState() => _PreferencesState();
}

class _PreferencesState extends State<_Preferences> {
  late final Data existing = object(widget.shell.me['category_preferences']);
  late final Set<String> chosen = (existing['selected'] as List? ?? [])
      .whereType<String>()
      .toSet();
  late bool all = existing.flag('show_all');
  bool expanded = false;
  bool busy = false;
  String? error;

  static const featured = [
    (
      'part_time_jobs',
      'Part Time Jobs',
      '(48hrs)',
      Icons.work_outline,
      Color(0xffffae59),
    ),
    (
      'entertainment',
      'Entertainment',
      '',
      Icons.movie_creation_outlined,
      Color(0xffff6ab3),
    ),
    (
      'one_chance',
      'One Chance',
      'Weekly Winners Viral Videos',
      Icons.emoji_events_outlined,
      Color(0xffffc247),
    ),
    (
      'horror_stories',
      'Horror Stories',
      '',
      Icons.nights_stay_outlined,
      Color(0xffd690ff),
    ),
    (
      'music_dance',
      'Music & Dance',
      '',
      Icons.music_note_outlined,
      Color(0xffff76c9),
    ),
    (
      'world_education',
      'World Education',
      '',
      Icons.school_outlined,
      Color(0xffa89aff),
    ),
    (
      'business_promotion',
      'Business Promotion & E-Commerce',
      '',
      Icons.storefront_outlined,
      Color(0xffffad70),
    ),
    (
      'news',
      'News Reporter',
      '(48hrs)',
      Icons.newspaper_outlined,
      Color(0xffd0a2ff),
    ),
  ];

  bool _available(String id) {
    final category = object(
      object(widget.shell.settings['categories.config'])[id],
    );
    return category['enabled'] != false && !category.flag('deleted');
  }

  void _toggle(String id) => setState(() {
    if (!chosen.add(id)) chosen.remove(id);
  });

  Future<void> _save() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final profile = object(
        await widget.shell.api.rpc('save_category_preferences', {
          'p_selected': chosen
              .where((id) => id != 'one_chance' && _available(id))
              .toList(),
          'p_show_all': all,
        }),
      );
      if (profile.isEmpty) throw const FormatException('Missing profile');
      if (!mounted) return;
      widget.shell.updateProfile(profile, refreshFeed: false);
      Navigator.pop(context, '');
    } catch (_) {
      if (mounted)
        setState(() {
          busy = false;
          error = 'Could not save your preferences. Try again.';
        });
    }
  }

  void _coming(String name) => showModalBottomSheet<void>(
    context: context,
    backgroundColor: const Color(0xff20112b),
    showDragHandle: true,
    useSafeArea: true,
    builder: (context) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(name, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            const _PreferenceBadge('Coming Soon'),
            const SizedBox(height: 10),
            Text(
              name == 'Daily Hunt'
                  ? 'Daily challenges will be available here when Daily Hunt launches.'
                  : 'This section will be available when the feature launches.',
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    ),
  );

  void _shortcut(String category) => Navigator.pop(context, category);

  Widget _grid(List<Widget> cards) => Column(
    children: [
      for (var i = 0; i < cards.length; i += 2)
        Padding(
          padding: const EdgeInsets.only(top: 10),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: cards[i]),
                const SizedBox(width: 10),
                Expanded(
                  child: i + 1 < cards.length ? cards[i + 1] : const SizedBox(),
                ),
              ],
            ),
          ),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final jobs = [
      'part_time_jobs',
      'full_time_jobs',
    ].where(_available).toList();
    final extras = categories.entries
        .where(
          (c) =>
              _available(c.key) &&
              (c.key == 'business_promotion' ||
                  featured.every((item) => item.$1 != c.key)),
        )
        .toList();
    final valid = chosen.any((id) => id != 'one_chance' && _available(id));
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final heading = TextStyle(
      fontSize: MediaQuery.sizeOf(context).width < 375 ? 24 : 28,
      fontWeight: FontWeight.w900,
      letterSpacing: -1,
    );
    return Scaffold(
      backgroundColor: _preferenceBackground,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 470),
            child: SingleChildScrollView(
              child: Stack(
                children: [
                  const Positioned.fill(
                    child: IgnorePointer(
                      child: CustomPaint(painter: _PreferenceWaves()),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 18, 16, 30),
                    child: Column(
                      children: [
                        Stack(
                          alignment: Alignment.center,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(14),
                                  child: Image.asset(
                                    'assets/home-flame.png',
                                    width: 42,
                                    height: 42,
                                    fit: BoxFit.contain,
                                  ),
                                ),
                                const SizedBox(width: 9),
                                const Text(
                                  'OJASSS',
                                  style: TextStyle(
                                    fontSize: 24,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: .6,
                                  ),
                                ),
                              ],
                            ),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: IconButton(
                                tooltip: 'Back',
                                onPressed: busy
                                    ? null
                                    : () => Navigator.maybePop(context),
                                icon: const Icon(Icons.arrow_back),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          alignment: WrapAlignment.center,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 6,
                          children: [
                            Text('Make it Your', style: heading),
                            ShaderMask(
                              blendMode: BlendMode.srcIn,
                              shaderCallback: (rect) => const LinearGradient(
                                colors: [
                                  Color(0xffe63edb),
                                  Color(0xffff7661),
                                  Color(0xffffb343),
                                ],
                              ).createShader(rect),
                              child: Text('Feed', style: heading),
                            ),
                            const Icon(
                              Icons.auto_awesome,
                              color: Color(0xffffc247),
                              size: 20,
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Choose the categories you want in your feed.',
                          style: TextStyle(color: _muted, fontSize: 12),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 15),
                        _PreferenceTile(
                          title: 'Recommended: Part Time & Full Time Jobs',
                          icon: Icons.auto_awesome,
                          color: const Color(0xfff9a1ea),
                          selected: true,
                          badge: 'NEW',
                          chevron: true,
                          onTap: busy || jobs.isEmpty
                              ? null
                              : () => setState(() => chosen.addAll(jobs)),
                        ),
                        _grid([
                          for (final (id, title, note, icon, color) in featured)
                            if (id == 'business_promotion' || _available(id))
                              _PreferenceTile(
                                title: title,
                                note: note,
                                icon: icon,
                                color: color,
                                badge: id == 'business_promotion'
                                    ? 'Coming Soon'
                                    : null,
                                selected:
                                    id != 'business_promotion' &&
                                    chosen.contains(id),
                                check:
                                    id != 'business_promotion' &&
                                    id != 'one_chance',
                                chevron: id == 'one_chance',
                                onTap: busy
                                    ? null
                                    : () {
                                        if (id == 'business_promotion') {
                                          _coming(title);
                                        } else if (id == 'one_chance') {
                                          _shortcut(id);
                                        } else {
                                          _toggle(id);
                                        }
                                      },
                              ),
                        ]),
                        _grid([
                          _PreferenceTile(
                            title: 'Business',
                            icon: Icons.trending_up,
                            color: const Color(0xffffbe73),
                            badge: 'Coming Soon',
                            onTap: () => _coming('Business'),
                          ),
                          _PreferenceTile(
                            title: 'Daily Hunt',
                            icon: Icons.track_changes,
                            color: const Color(0xffab9cff),
                            badge: 'Coming Soon',
                            onTap: () => _coming('Daily Hunt'),
                          ),
                        ]),
                        if (extras.isNotEmpty)
                          Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton(
                              onPressed: () =>
                                  setState(() => expanded = !expanded),
                              child: Text(
                                expanded
                                    ? 'Hide more categories'
                                    : 'More categories',
                              ),
                            ),
                          ),
                        if (expanded)
                          _grid([
                            for (final category in extras)
                              _PreferenceTile(
                                title: category.value,
                                icon: Icons.grid_view_outlined,
                                color: _purple,
                                selected: chosen.contains(category.key),
                                check: true,
                                onTap: busy
                                    ? null
                                    : () => _toggle(category.key),
                              ),
                          ]),
                        const SizedBox(height: 5),
                        Container(
                          decoration: _decoration(
                            radius: 16,
                            color: const Color(0xff20112b),
                          ),
                          child: Material(
                            color: Colors.transparent,
                            child: CheckboxListTile(
                              controlAffinity: ListTileControlAffinity.leading,
                              dense: true,
                              activeColor: const Color(0xffa534e8),
                              checkColor: Colors.white,
                              title: const Text(
                                'I want to see all categories',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13,
                                ),
                              ),
                              value: all,
                              onChanged: busy
                                  ? null
                                  : (checked) =>
                                        setState(() => all = checked ?? false),
                            ),
                          ),
                        ),
                        const SizedBox(height: 7),
                        const Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            'Leave this off to see only your selected categories in For You.',
                            style: TextStyle(color: _muted, fontSize: 12),
                          ),
                        ),
                        if (error != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 7),
                            child: Semantics(
                              liveRegion: true,
                              child: Text(
                                error!,
                                style: const TextStyle(
                                  color: Colors.orangeAccent,
                                ),
                              ),
                            ),
                          ),
                        const SizedBox(height: 12),
                        Material(
                          color: Colors.transparent,
                          child: Ink(
                            decoration: BoxDecoration(
                              gradient: _preferenceButton,
                              borderRadius: BorderRadius.circular(28),
                            ),
                            child: InkWell(
                              onTap: busy || (!all && !valid) ? null : _save,
                              borderRadius: BorderRadius.circular(28),
                              child: AnimatedOpacity(
                                duration: reduceMotion
                                    ? Duration.zero
                                    : const Duration(milliseconds: 180),
                                opacity: busy || (!all && !valid) ? .58 : 1,
                                child: SizedBox(
                                  height: 55,
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 13,
                                    ),
                                    child: Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        const CircleAvatar(
                                          radius: 15,
                                          backgroundColor: Color(0x553a133b),
                                          child: Icon(
                                            Icons.play_arrow,
                                            color: Colors.white,
                                            size: 19,
                                          ),
                                        ),
                                        Text(
                                          busy ? 'Saving…' : 'Show My Videos',
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w800,
                                            fontSize: 15,
                                            color: Colors.white,
                                          ),
                                        ),
                                        const Icon(
                                          Icons.chevron_right,
                                          color: Colors.white,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        _grid([
                          if (_available('news'))
                            _PreferenceTile(
                              title: 'My News Reporter Videos',
                              note: '(48hrs)',
                              icon: Icons.newspaper_outlined,
                              color: const Color(0xffd0a2ff),
                              chevron: true,
                              onTap: busy ? null : () => _shortcut('news'),
                            ),
                          if (_available('part_time_jobs'))
                            _PreferenceTile(
                              title: 'My Part Time Jobs',
                              note: '(48hrs)',
                              icon: Icons.work_outline,
                              color: const Color(0xffffae59),
                              chevron: true,
                              onTap: busy
                                  ? null
                                  : () => _shortcut('part_time_jobs'),
                            ),
                        ]),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PreferenceTile extends StatelessWidget {
  const _PreferenceTile({
    required this.title,
    required this.icon,
    required this.color,
    required this.onTap,
    this.note = '',
    this.badge,
    this.selected = false,
    this.check = false,
    this.chevron = false,
  });

  final String title;
  final IconData icon;
  final Color color;
  final VoidCallback? onTap;
  final String note;
  final String? badge;
  final bool selected;
  final bool check;
  final bool chevron;

  @override
  Widget build(BuildContext context) => Semantics(
    selected: check ? selected : null,
    button: true,
    child: AnimatedContainer(
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : const Duration(milliseconds: 180),
      constraints: BoxConstraints(minHeight: badge == 'NEW' ? 48 : 61),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: selected
              ? const [Color(0xff48204e), Color(0xff27153e)]
              : [
                  Color.alphaBlend(
                    color.withValues(alpha: .10),
                    const Color(0xff21122d),
                  ),
                  const Color(0xff16091f),
                ],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: selected ? _preferencePink : color.withValues(alpha: .42),
        ),
        boxShadow: selected
            ? const [BoxShadow(color: Color(0x46d83aff), blurRadius: 12)]
            : null,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Icon(icon, color: color, size: 21),
                if (badge == 'NEW')
                  const Padding(
                    padding: EdgeInsets.only(left: 5),
                    child: _PreferenceBadge('NEW'),
                  ),
                const SizedBox(width: 7),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 12,
                          height: 1.15,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      if (note.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: Text(
                            note,
                            style: const TextStyle(
                              color: _muted,
                              fontSize: 10,
                              height: 1.15,
                            ),
                          ),
                        ),
                      if (badge != null && badge != 'NEW')
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: _PreferenceBadge(badge!),
                        ),
                    ],
                  ),
                ),
                if (check && selected)
                  const Icon(Icons.check, color: _preferencePink, size: 17),
                if (chevron) const Icon(Icons.chevron_right, size: 15),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class _PreferenceBadge extends StatelessWidget {
  const _PreferenceBadge(this.title);
  final String title;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 6),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(12),
      gradient: LinearGradient(
        colors: title == 'NEW'
            ? const [Color(0xffff5b72), Color(0xffa900ff)]
            : const [Color(0xff812b90), Color(0xff3f1a64)],
      ),
    ),
    child: Text(
      title,
      style: const TextStyle(
        fontSize: 9,
        fontWeight: FontWeight.w800,
        color: Colors.white,
      ),
    ),
  );
}

class _PreferenceWaves extends CustomPainter {
  const _PreferenceWaves();

  @override
  void paint(Canvas canvas, Size size) {
    final bounds = Offset.zero & size;
    canvas.drawRect(
      bounds,
      Paint()
        ..shader = const RadialGradient(
          center: Alignment.topCenter,
          radius: .48,
          colors: [Color(0x72401055), _preferenceBackground],
        ).createShader(bounds),
    );
    final top = Path()
      ..moveTo(-20, 140)
      ..cubicTo(
        size.width * .12,
        71,
        size.width * .28,
        45,
        size.width * .48,
        -15,
      );
    final bottom = Path()
      ..moveTo(-16, size.height - 62)
      ..cubicTo(
        size.width * .26,
        size.height - 132,
        size.width * .56,
        size.height + 33,
        size.width + 22,
        size.height - 97,
      );
    final reflection = bottom.shift(const Offset(0, 15));
    final shader = const LinearGradient(
      colors: [Color(0xff741dff), Color(0xfff000cc), Color(0xffff981a)],
    ).createShader(bounds);
    for (final path in [top, bottom, reflection]) {
      canvas.drawPath(
        path,
        Paint()
          ..shader = shader
          ..style = PaintingStyle.stroke
          ..strokeWidth = 7
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
      );
      canvas.drawPath(
        path,
        Paint()
          ..shader = shader
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2,
      );
    }
  }

  @override
  bool shouldRepaint(_PreferenceWaves oldDelegate) => false;
}
