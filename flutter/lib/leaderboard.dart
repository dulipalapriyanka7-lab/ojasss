part of 'main.dart';

const _ranks = [
  ('Gold', Color(0xffffd43b)),
  ('Silver', Color(0xffd8dee9)),
  ('Platinum', Color(0xff26d7ff)),
  ('Emerald', Color(0xff39e879)),
  ('Bronze', Color(0xffffb547)),
];

String _leaderTime(int seconds) =>
    '${(seconds ~/ 3600).toString().padLeft(2, '0')}h ${(seconds % 3600 ~/ 60).toString().padLeft(2, '0')}m';

class _Leaderboard extends StatefulWidget {
  const _Leaderboard({required this.shell});
  final _ShellState shell;

  @override
  State<_Leaderboard> createState() => _LeaderboardState();
}

class _LeaderboardState extends State<_Leaderboard> {
  bool remaining = false;
  int revision = 0;
  _ShellState get shell => widget.shell;

  Future<Data> _load() async {
    final signedIn = shell.me.isNotEmpty;
    final result = await Future.wait([
      signedIn
          ? shell.api.rpc('competition_live', {'p_limit': 100})
          : shell.api.rpc('one_chance_leaderboard', {
              'p_period': 'weekly',
              'p_limit': 100,
            }),
      shell.api
          .rpc('challenge_public')
          .then((data) => data, onError: (Object _) => {'unavailable': true}),
    ]);
    return {
      'standings': object(result.first),
      'challenge': object(result.last),
      'signedIn': signedIn,
      'received_at': DateTime.now(),
    };
  }

  void _refresh() => setState(() => revision++);

  void _select(int index) {
    if (index != 2) Navigator.pop(context);
    unawaited(shell.select(index));
  }

  Future<void> _openChat() async {
    if (!await shell.requireAccount() || !mounted) return;
    try {
      final id = await shell.api.rpc('join_one_chance_chat');
      if (mounted && id is String) {
        await shell.push<void>(
          _Chat(shell: shell, id: id, title: 'Viral Creators'),
        );
      }
    } catch (error) {
      if (mounted) _notice(context, error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final announcement = shell.announcements.firstOrNull;
    return Scaffold(
      backgroundColor: _homeBackground,
      appBar: AppBar(
        titleSpacing: 0,
        title: const _Brand(),
        actions: [
          IconButton(
            icon: const Icon(Icons.campaign_outlined),
            tooltip: 'Announcements',
            onPressed: () => shell.push<void>(_Updates(shell: shell)),
          ),
        ],
      ),
      bottomNavigationBar: _HomeNavigation(active: 3, onSelect: _select),
      body: Column(
        children: [
          if (announcement != null)
            _Announcement(
              item: announcement,
              onTap: () => shell.push<void>(_Updates(shell: shell)),
            ),
          Expanded(
            child: _Load(
              key: ValueKey(revision),
              fetch: _load,
              render: _content,
            ),
          ),
        ],
      ),
    );
  }

  Widget _content(Object? value, VoidCallback reload) {
    final payload = object(value);
    final data = object(payload['standings']);
    final totals = object(data['totals']);
    final signedIn = payload.flag('signedIn');
    final entries = records(data['entries']);
    final groups = object(data['top_groups']);
    final event = object(data['competition']);
    final deadline = DateTime.tryParse(
      signedIn ? event.string('end') : '${data.string('end')}T00:00:00+05:30',
    );
    final serverTime = DateTime.tryParse(data.string('server_time'));
    final receivedAt = payload['received_at'] as DateTime;
    final targets = object(event['config'])['targets'];
    final rankTargets = targets is List ? targets : const [];
    final locked = data.flag('locked') || data.flag('closed');

    return RefreshIndicator(
      onRefresh: () async => reload(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 20),
        children: [
          Row(
            children: [
              const Icon(
                Icons.emoji_events_outlined,
                color: _homeGold,
                size: 28,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Leaderboard',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      'Weekly Competition Rankings',
                      style: TextStyle(fontSize: 12, color: _homeMuted),
                    ),
                  ],
                ),
              ),
              _HomeRim(
                radius: 10,
                fill: const LinearGradient(
                  colors: [Color(0xff43142f), Color(0xff2a102d)],
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 5,
                  ),
                  child: Text(
                    locked ? 'CLOSED' : 'LIVE',
                    style: const TextStyle(
                      color: Color(0xffffa6ce),
                      fontWeight: FontWeight.w800,
                      fontSize: 10,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          OverflowBar(
            alignment: MainAxisAlignment.spaceBetween,
            spacing: 6,
            overflowSpacing: 4,
            children: [
              OutlinedButton.icon(
                onPressed: _openChat,
                icon: const Icon(Icons.forum_outlined, size: 17),
                label: const Text('Group Chat'),
              ),
              OutlinedButton.icon(
                onPressed: shell.openCreate,
                icon: const Icon(Icons.add, size: 17),
                label: const Text('Create Video'),
              ),
            ],
          ),
          _WeeklyTaskCard(
            shell: shell,
            challenge: object(payload['challenge']),
          ),
          if (deadline != null)
            _LeaderboardTimer(
              key: ValueKey(deadline),
              end: deadline,
              offset: serverTime?.difference(receivedAt) ?? Duration.zero,
              closed: locked,
              onEnd: reload,
            ),
          const SizedBox(height: 8),
          _HomeRim(
            radius: 15,
            fill: const LinearGradient(
              colors: [Color(0xff25132f), Color(0xff170e22)],
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 4),
              child: Row(
                children: [
                  _stat(
                    Icons.favorite_border,
                    'Votes',
                    totals.string('votes', '—'),
                  ),
                  _stat(
                    Icons.visibility_outlined,
                    'Views',
                    totals.string('views', '—'),
                  ),
                  _stat(
                    Icons.videocam_outlined,
                    'Viral Videos',
                    totals.string('viral', '—'),
                  ),
                  _stat(
                    Icons.group_outlined,
                    'Active Users',
                    totals.string('active_users', '—'),
                  ),
                  _stat(
                    Icons.schedule,
                    'Active Time',
                    signedIn
                        ? _leaderTime(data.number('viewer_active_seconds'))
                        : '—',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            spacing: 5,
            children: [
              Expanded(
                flex: 4,
                child: _LeaderboardControl(
                  label: 'Current Week',
                  selected: !remaining,
                  onTap: () => setState(() => remaining = false),
                ),
              ),
              Expanded(
                flex: 6,
                child: _LeaderboardControl(
                  label: 'Remaining Positions',
                  selected: remaining,
                  onTap: () => setState(() => remaining = true),
                ),
              ),
              Expanded(
                flex: 3,
                child: _LeaderboardControl(
                  label: 'All Posts',
                  onTap: () => _select(0),
                ),
              ),
              Expanded(
                flex: 4,
                child: _LeaderboardControl(
                  label: 'Add Video',
                  onTap: shell.openCreate,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (!remaining)
            for (var index = 0; index < _ranks.length; index++) ...[
              _rankCard(
                index,
                records(groups['${index + 1}']).firstOrNull,
                target: index < rankTargets.length
                    ? rankTargets[index] as int?
                    : null,
              ),
              if (index < _ranks.length - 1) const SizedBox(height: 8),
            ],
          if (signedIn && remaining) ...[
            for (final entry in entries.where((row) => row.number('rank') >= 6))
              ListTile(
                leading: Text('#${entry.number('rank')}'),
                title: Text('@${entry.string('username')}'),
                subtitle: Text(
                  '${entry.number('votes')} votes · ${entry.number('views')} views',
                ),
                onTap: () => shell.openProfile(entry.string('username')),
              ),
            if (!entries.any((entry) => entry.number('rank') >= 6))
              const ListTile(
                title: Text('No additional qualified creators yet'),
              ),
          ],
          if (!signedIn) ...[
            TextButton(
              onPressed: () async {
                if (await shell.requireAccount() && mounted) _refresh();
              },
              child: const Text('Sign in to see creator ranks'),
            ),
            for (final entry in entries)
              ListTile(
                leading: Text('#${entry.number('rank')}'),
                title: Text(
                  object(entry['post']).string(
                    'author_display_name',
                    object(entry['post']).string('author_username'),
                  ),
                ),
                subtitle: Text('${entry.number('votes')} votes'),
                onTap: () => shell.openPost(object(entry['post']).string('id')),
              ),
          ],
          TextButton(
            onPressed: () => shell.push<void>(_Tasks(shell: shell)),
            child: const Text('Challenges and tasks'),
          ),
          TextButton(
            onPressed: () async {
              if (await shell.requireAccount() && mounted) {
                await shell.push<void>(_Membership(shell: shell));
              }
            },
            child: const Text('One Chance membership'),
          ),
        ],
      ),
    );
  }

  Widget _stat(IconData icon, String label, String value) => Expanded(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Column(
        children: [
          Icon(icon, color: _purple, size: 16),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
          ),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 9, color: _homeMuted),
          ),
        ],
      ),
    ),
  );

  Widget _rankCard(int index, Data? entry, {int? target}) {
    final handle = entry?.string('username') ?? '';
    return WinnerRankCard(
      rank: index + 1,
      username: handle,
      target: target,
      votes: entry?.number('votes') ?? 0,
      views: entry?.number('views') ?? 0,
      videos: entry?.number('video_count') ?? 0,
      seconds: entry?.number('seconds') ?? 0,
      avatar: _Avatar(
        shell.api,
        entry?.string('avatar_path') ?? '',
        handle,
        size: 42,
      ),
      onTap: handle.isEmpty ? null : () => shell.openProfile(handle),
    );
  }
}

class _LeaderboardControl extends StatelessWidget {
  const _LeaderboardControl({
    required this.label,
    required this.onTap,
    this.selected,
  });
  final String label;
  final VoidCallback onTap;
  final bool? selected;

  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    child: SizedBox(
      height: 44,
      child: TextButton(
        onPressed: onTap,
        style: TextButton.styleFrom(
          foregroundColor: Colors.white,
          backgroundColor: selected == true ? const Color(0xff981ad3) : _panel,
          side: BorderSide(
            color: selected == true ? const Color(0xffde67f3) : _line,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(11),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 5),
          minimumSize: const Size(0, 44),
        ),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            label,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    ),
  );
}

class _LeaderboardTimer extends StatefulWidget {
  const _LeaderboardTimer({
    super.key,
    required this.end,
    required this.offset,
    required this.closed,
    required this.onEnd,
  });
  final DateTime end;
  final Duration offset;
  final bool closed;
  final VoidCallback onEnd;

  @override
  State<_LeaderboardTimer> createState() => _LeaderboardTimerState();
}

class _LeaderboardTimerState extends State<_LeaderboardTimer> {
  Timer? ticker;

  @override
  void initState() {
    super.initState();
    if (widget.closed) return;
    ticker = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!widget.end.isAfter(DateTime.now().add(widget.offset))) {
        timer.cancel();
        widget.onEnd();
      } else {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final left = widget.end.difference(DateTime.now().add(widget.offset));
    final seconds = widget.closed || left.isNegative
        ? 0
        : (left.inMilliseconds + 999) ~/ 1000;
    final parts = [
      (seconds ~/ 86400, 'd'),
      (seconds ~/ 3600 % 24, 'h'),
      (seconds ~/ 60 % 60, 'm'),
      (seconds % 60, 's'),
    ];
    return _HomeRim(
      radius: 14,
      edge: const LinearGradient(
        colors: [Color(0xffb343b9), Color(0xff753ba1)],
      ),
      fill: const LinearGradient(
        colors: [Color(0xff351144), Color(0xff1a1228)],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
        child: Row(
          children: [
            const Icon(
              Icons.local_fire_department_outlined,
              size: 20,
              color: Color(0xfff993d6),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                widget.closed ? 'Competition closed' : 'Weekly Competition',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ),
            for (final (value, unit) in parts)
              Container(
                margin: const EdgeInsets.only(left: 3),
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
                decoration: _decoration(
                  radius: 6,
                  color: const Color(0xff361d48),
                ),
                child: Text(
                  '${value.toString().padLeft(2, '0')}$unit',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class WinnerRankCard extends StatelessWidget {
  const WinnerRankCard({
    super.key,
    required this.rank,
    required this.username,
    required this.avatar,
    this.target,
    this.votes = 0,
    this.views = 0,
    this.videos = 0,
    this.seconds = 0,
    this.onTap,
  }) : assert(rank >= 1 && rank <= 5);

  final int rank, votes, views, videos, seconds;
  final int? target;
  final String username;
  final Widget avatar;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final (tier, accent) = _ranks[rank - 1];
    final occupied = username.isNotEmpty;
    return Container(
      constraints: const BoxConstraints(minHeight: 82),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(width: 1.5, color: accent.withValues(alpha: .66)),
        gradient: LinearGradient(
          colors: [
            Color.alphaBlend(
              accent.withValues(alpha: .12),
              const Color(0xff1c1424),
            ),
            const Color(0xff18101f),
          ],
        ),
        boxShadow: [
          BoxShadow(color: accent.withValues(alpha: .12), blurRadius: 7),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: LayoutBuilder(
            builder: (context, viewport) {
              final compact = viewport.maxWidth < 355;
              final diameter = compact ? 36.0 : 42.0;
              final badgeWidth = compact ? 60.0 : 76.0;
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
                child: Row(
                  children: [
                    SizedBox(
                      width: compact ? 38 : 48,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _GoldLaurel(color: accent),
                            SizedBox(
                              width: 16,
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  '$rank',
                                  key: const ValueKey('rank-number'),
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: accent,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 16,
                                    fontFeatures: const [
                                      FontFeature.tabularFigures(),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            _GoldLaurel(flipped: true, color: accent),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Container(
                      key: const ValueKey('rank-avatar'),
                      width: diameter,
                      height: diameter,
                      padding: const EdgeInsets.all(1.5),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: accent),
                      ),
                      child: ClipOval(
                        child: occupied
                            ? avatar
                            : Icon(Icons.lock_outline, size: 16, color: accent),
                      ),
                    ),
                    const SizedBox(width: 7),
                    Expanded(
                      child: LayoutBuilder(
                        builder: (context, cell) {
                          return Column(
                            key: const ValueKey('rank-details'),
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                      occupied ? '@$username' : 'Position open',
                                      key: const ValueKey('rank-username'),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  if (rank == 1 && occupied) ...[
                                    const SizedBox(width: 4),
                                    CustomPaint(
                                      size: const Size(13, 13),
                                      painter: _GoldCrown(accent),
                                    ),
                                  ],
                                ],
                              ),
                              const SizedBox(height: 5),
                              if (occupied)
                                _metrics(
                                  cell.maxWidth,
                                  MediaQuery.textScalerOf(context),
                                )
                              else
                                Text(
                                  target == null
                                      ? 'Awaiting standings'
                                      : 'Target: $target videos',
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: _homeMuted,
                                    fontSize: 10,
                                  ),
                                ),
                            ],
                          );
                        },
                      ),
                    ),
                    const SizedBox(width: 5),
                    Container(
                      key: const ValueKey('rank-badge'),
                      alignment: Alignment.center,
                      width: badgeWidth,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(9),
                        color: accent.withValues(alpha: .1),
                        border: Border.all(
                          color: accent.withValues(alpha: .55),
                        ),
                      ),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          tier.toUpperCase(),
                          style: TextStyle(
                            color: accent,
                            fontWeight: FontWeight.w800,
                            fontSize: 10,
                            letterSpacing: .25,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _metrics(double width, TextScaler scaler) {
    final metrics = [
      _metric(Icons.favorite_border_rounded, 'Votes', '$votes'),
      _metric(Icons.visibility_outlined, 'Views', '$views'),
      _metric(Icons.videocam_outlined, 'Videos', '$videos'),
      _metric(Icons.schedule_rounded, 'Active time', _leaderTime(seconds)),
    ];
    if (width < 192 * scaler.scale(1)) {
      return Column(
        children: [
          Row(
            children: [
              Expanded(child: metrics[0]),
              Expanded(child: metrics[1]),
            ],
          ),
          const SizedBox(height: 2),
          Row(
            children: [
              Expanded(child: metrics[2]),
              Expanded(child: metrics[3]),
            ],
          ),
        ],
      );
    }
    return Row(
      children: [
        for (var i = 0; i < metrics.length; i++)
          Expanded(flex: i == 3 ? 3 : 2, child: metrics[i]),
      ],
    );
  }

  Widget _metric(IconData icon, String label, String value) => Tooltip(
    message: '$label: $value',
    child: Align(
      alignment: Alignment.centerLeft,
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 11, color: _homeMuted),
            const SizedBox(width: 2),
            Text(
              value,
              style: const TextStyle(
                color: _homeMuted,
                fontSize: 10,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _GoldCrown extends CustomPainter {
  const _GoldCrown(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final shape = Path()
      ..moveTo(1, 4)
      ..lineTo(4, 6)
      ..lineTo(6.5, 2)
      ..lineTo(9, 6)
      ..lineTo(12, 4)
      ..lineTo(10.7, 10)
      ..lineTo(2.3, 10)
      ..close();
    canvas.drawPath(shape, Paint()..color = color);
    canvas.drawLine(
      Offset(2.5, 11.5),
      Offset(10.5, 11.5),
      Paint()..color = color,
    );
  }

  @override
  bool shouldRepaint(_GoldCrown oldDelegate) => oldDelegate.color != color;
}
