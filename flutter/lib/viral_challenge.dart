part of 'main.dart';

class _HotFlame extends StatelessWidget {
  const _HotFlame({
    required this.selected,
    required this.disabled,
    required this.pulse,
  });
  final bool selected, disabled;
  final int pulse;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    key: ValueKey(pulse),
    tween: Tween(begin: pulse == 0 ? 1 : 1.18, end: 1),
    duration: _homeMotion(context, 215),
    curve: Curves.easeOutCubic,
    builder: (_, scale, child) => Transform.scale(scale: scale, child: child),
    child: Center(
      child: Opacity(
        opacity: disabled ? .42 : 1,
        child: CustomPaint(
          size: const Size(19, 20),
          painter: _FlamePainter(selected),
        ),
      ),
    ),
  );
}

class _FlamePainter extends CustomPainter {
  const _FlamePainter(this.selected);
  final bool selected;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 20, size.height / 22);
    final outer = Path()
      ..moveTo(10.8, 1.3)
      ..cubicTo(12.5, 6.5, 17.9, 7.5, 18, 14.2)
      ..cubicTo(18.1, 18.6, 14.6, 21.3, 10.1, 21.3)
      ..cubicTo(5.5, 21.3, 2.1, 18.3, 2.2, 14.1)
      ..cubicTo(2.3, 10.4, 4.8, 8.0, 6.7, 6.2)
      ..cubicTo(6.7, 8.1, 7.5, 9.1, 8.2, 9.2)
      ..cubicTo(8.1, 6.1, 10.5, 3.9, 10.8, 1.3)
      ..close();
    final inner = Path()
      ..moveTo(11.3, 10.3)
      ..cubicTo(11.9, 13, 14, 14.5, 13.7, 17.2)
      ..cubicTo(13.5, 19.1, 12.2, 20.2, 10.4, 20.2)
      ..cubicTo(8.1, 20.2, 6.8, 18.9, 7, 16.8)
      ..cubicTo(7.2, 15.1, 8.4, 14, 9.3, 13.1)
      ..quadraticBezierTo(9.5, 14.6, 10.3, 14.6)
      ..quadraticBezierTo(10.2, 12.3, 11.3, 10.3)
      ..close();
    const outerColors = [
      Color(0xffff278e),
      Color(0xffff563e),
      Color(0xffff8b24),
    ];
    final gradient = const LinearGradient(
      begin: Alignment.topRight,
      end: Alignment.bottomLeft,
      colors: outerColors,
    ).createShader(const Rect.fromLTWH(2, 1, 16, 20));
    canvas.drawPath(
      outer,
      Paint()
        ..shader = gradient
        ..style = selected ? PaintingStyle.fill : PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawPath(
      inner,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xffff902e), Color(0xffffdb4e)],
        ).createShader(const Rect.fromLTWH(6, 10, 9, 10)),
    );
  }

  @override
  bool shouldRepaint(_FlamePainter oldDelegate) =>
      selected != oldDelegate.selected;
}

extension _ViralFeed on _FeedState {
  Future<void> _loadViralChallenge() async {
    try {
      final result = object(
        await api.rpc('viral_challenge_feed', {'p_limit': 1}),
      );
      if (mounted)
        _updateHome(
          () =>
              viralChallengeBanner = records(result['items']).firstOrNull ?? {},
        );
    } catch (_) {
      // A challenge request failure must not block playback.
    }
  }

  Future<void> _openViralChallenge() async {
    final challenge = viralChallengeBanner;
    await _overlay(
      () => widget.shell.push<void>(
        _ViralChallengePage(shell: widget.shell, id: challenge.string('id')),
      ),
    );
    if (mounted) await _loadViralChallenge();
  }

  Future<void> _sendHot(Data post) async {
    final id = post.string('id');
    if (!sendingHots.add(id)) return;
    _updateHome(() {});
    try {
      if (widget.shell.me.isEmpty &&
          (await _overlay(widget.shell.requireAccount)) != true)
        return;
      if (!mounted) return;
      final update = object(
        await api.rpc('toggle_engagement', {'p_post_id': id, 'p_kind': 'hot'}),
      );
      if (mounted)
        _updateHome(() {
          post.addAll(update);
          hotAnimations[id] = (hotAnimations[id] ?? 0) + 1;
        });
    } catch (error) {
      if (mounted) _notice(context, error);
    } finally {
      sendingHots.remove(id);
      if (mounted) _updateHome(() {});
    }
  }
}

class _ViralChallengeStrip extends StatelessWidget {
  const _ViralChallengeStrip({required this.item, required this.onTap});
  final Data item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(7, 2, 7, 6),
    child: _HomeRim(
      radius: 16,
      stroke: 1.2,
      shadows: const [BoxShadow(color: Color(0x49f500a9), blurRadius: 7)],
      fill: const LinearGradient(
        colors: [Color(0xff32134a), Color(0xff1d1028), Color(0xff3e144a)],
      ),
      child: SizedBox(
        height: 46,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: [
              const _GoldLaurel(),
              const Icon(
                Icons.movie_creation_outlined,
                color: _homeGold,
                size: 23,
              ),
              const _GoldLaurel(flipped: true),
              const SizedBox(width: 7),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Viral Challenge',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                        color: Colors.white,
                      ),
                    ),
                    Text(
                      item.string('title', 'Create · Upload · Go Viral'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: _homeMuted, fontSize: 11),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(11),
                child: SizedBox(
                  height: 44,
                  child: Center(
                    child: _HomeRim(
                      radius: 10,
                      fill: _homeAccent,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(8, 5, 5, 5),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              item.flag('joined') ? 'View' : 'Join Now',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                            const Icon(
                              Icons.chevron_right,
                              color: Colors.white,
                              size: 15,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _ViralChallengePage extends StatefulWidget {
  const _ViralChallengePage({required this.shell, required this.id});
  final _ShellState shell;
  final String id;

  @override
  State<_ViralChallengePage> createState() => _ViralChallengePageState();
}

class _ViralChallengePageState extends State<_ViralChallengePage> {
  Data? detail;
  final submissions = <Data>[];
  final elapsed = Stopwatch();
  DateTime? serverTime;
  String? error;
  bool busy = false;
  bool more = false;
  static const pageSize = 20;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load({bool join = false, bool append = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = object(
        await widget.shell.api
            .rpc(join ? 'viral_challenge_join' : 'viral_challenge_detail', {
              'id': widget.id,
              'p_limit': pageSize,
              'p_offset': append ? submissions.length : 0,
            }),
      );
      if (!mounted) return;
      final entries = records(result['submissions']);
      setState(() {
        detail = result;
        if (!append) submissions.clear();
        submissions.addAll(entries);
        more = submissions.length < result.number('submitted');
        serverTime = DateTime.tryParse(result.string('server_time'));
        elapsed
          ..reset()
          ..start();
      });
    } catch (failure) {
      if (mounted) setState(() => error = failure.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _join() async {
    if (busy) return;
    if (await widget.shell.requireAccount() && mounted) await _load(join: true);
  }

  Future<void> _upload(Data challenge) async {
    final posted = await widget.shell.push<String>(
      _UploadPage(shell: widget.shell, viralChallenge: challenge),
    );
    if (mounted && posted != null) await _load();
  }

  String _date(String value) {
    final date = DateTime.tryParse(value);
    if (date == null) return '—';
    return '${MaterialLocalizations.of(context).formatMediumDate(date.toLocal())} · ${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(date.toLocal()))}';
  }

  @override
  Widget build(BuildContext context) {
    final data = detail;
    final challenge = object(data?['challenge']);
    final status = challenge.string('status');
    final end = DateTime.tryParse(challenge.string('ends_at'));
    final start = DateTime.tryParse(challenge.string('starts_at'));
    final banner = challenge.string('banner_path');
    final icon = challenge.string('icon_path');
    final target = challenge.number('target').clamp(1, 1000000);
    final qualified = data?.number('qualified') ?? 0;
    return Scaffold(
      backgroundColor: _homeBackground,
      appBar: AppBar(title: const Text('Viral Challenge')),
      body: SafeArea(
        child: data == null && busy
            ? const _HomeLoading()
            : ListView(
                padding: const EdgeInsets.all(14),
                children: [
                  if (error != null)
                    ListTile(
                      title: Text(error!),
                      trailing: TextButton(
                        onPressed: busy ? null : _load,
                        child: const Text('Retry'),
                      ),
                    ),
                  if (data != null) ...[
                    if (banner.isNotEmpty)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(15),
                        child: Image.network(
                          widget.shell.api.media(banner).toString(),
                          headers: widget.shell.api.headers,
                          height: 150,
                          width: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const SizedBox.shrink(),
                        ),
                      ),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: icon.isEmpty
                          ? const Icon(
                              Icons.emoji_events,
                              color: _homeGold,
                              size: 30,
                            )
                          : Image.network(
                              widget.shell.api.media(icon).toString(),
                              headers: widget.shell.api.headers,
                              width: 34,
                              height: 34,
                              errorBuilder: (_, _, _) => const Icon(
                                Icons.emoji_events,
                                color: _homeGold,
                              ),
                            ),
                      title: Text(
                        challenge.string('title'),
                        style: const TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      subtitle: Text(
                        categories[challenge.string('category')] ??
                            challenge.string('category'),
                      ),
                    ),
                    Text(challenge.string('description')),
                    const SizedBox(height: 10),
                    Text('Starts ${_date(challenge.string('starts_at'))}'),
                    Text('Ends ${_date(challenge.string('ends_at'))}'),
                    if (serverTime != null && end != null)
                      StreamBuilder<int>(
                        stream: Stream.periodic(
                          const Duration(seconds: 1),
                          (value) => value,
                        ),
                        builder: (context, _) {
                          final now = serverTime!.add(elapsed.elapsed);
                          final before =
                              status == 'scheduled' &&
                              start != null &&
                              now.isBefore(start);
                          final left = (before ? start : end).difference(now);
                          final remaining =
                              !left.isNegative &&
                              (before || status == 'active');
                          final label = switch (status) {
                            'scheduled' => 'Upcoming',
                            'paused' => 'Paused',
                            'completed' => 'Completed',
                            'ended' => 'Expired',
                            _ =>
                              !remaining
                                  ? 'Expired'
                                  : data.flag('joined')
                                  ? 'In progress'
                                  : data.flag('can_join')
                                  ? 'Open to join'
                                  : 'Not eligible',
                          };
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 9),
                              Text(
                                label,
                                style: const TextStyle(
                                  color: _homeGold,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              if (remaining)
                                Text(
                                  '${before ? 'Starts in' : 'Ends in'} ${left.inDays}d ${left.inHours % 24}h ${left.inMinutes % 60}m ${left.inSeconds % 60}s',
                                ),
                              if (remaining && !before && data.flag('can_join'))
                                FilledButton(
                                  onPressed: busy ? null : _join,
                                  child: const Text('Join Challenge'),
                                ),
                              if (remaining &&
                                  !before &&
                                  data.flag('can_upload'))
                                FilledButton.icon(
                                  onPressed: busy
                                      ? null
                                      : () => _upload(challenge),
                                  icon: const Icon(Icons.upload),
                                  label: const Text('Upload Challenge Video'),
                                ),
                            ],
                          );
                        },
                      ),
                    const Divider(),
                    Text(
                      'Rules',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    if (challenge.string('rules').isNotEmpty)
                      Text(challenge.string('rules')),
                    const Text(
                      'Submit a public video in the challenge category.',
                    ),
                    Text(
                      '${challenge.number('hots')} Hots · ${challenge.number('shares')} Shares per video',
                    ),
                    Text('Target: $target qualified videos'),
                    if (challenge.string('reward').isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text('Reward: ${challenge.string('reward')}'),
                    ],
                    if (data.flag('joined')) ...[
                      const Divider(),
                      AnimatedSwitcher(
                        duration: _homeMotion(context),
                        child: Text(
                          '$qualified / $target qualified · ${data.number('submitted')} submitted',
                          key: ValueKey(qualified),
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                      const SizedBox(height: 5),
                      LinearProgressIndicator(
                        value: (qualified / target).clamp(0, 1).toDouble(),
                        color: const Color(0xfff500a9),
                      ),
                      const SizedBox(height: 8),
                      if (submissions.isEmpty)
                        const Text('No challenge videos submitted yet.'),
                      for (final video in submissions)
                        ListTile(
                          leading: Icon(
                            video.flag('qualified')
                                ? Icons.check_circle_outline
                                : Icons.movie_creation_outlined,
                          ),
                          title: Text(
                            video.string('caption').isEmpty
                                ? 'Challenge video'
                                : video.string('caption'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            '${video.flag('qualified')
                                ? 'Qualified'
                                : video.string('moderation') == 'excluded'
                                ? 'Excluded'
                                : !video.flag('available')
                                ? 'Unavailable'
                                : 'Pending'} · ${video.number('hots')} Hots · ${video.number('shares')} Shares',
                          ),
                          onTap: video.flag('available')
                              ? () => widget.shell.openPost(
                                  video.string('post_id'),
                                )
                              : null,
                        ),
                      if (more)
                        TextButton(
                          onPressed: busy ? null : () => _load(append: true),
                          child: const Text('Load more videos'),
                        ),
                    ],
                  ],
                ],
              ),
      ),
    );
  }
}
