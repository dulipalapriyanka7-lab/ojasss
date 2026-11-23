part of 'main.dart';

extension _OneChanceFeed on _FeedState {
  Future<void> _loadCompetitionBanner() async {
    try {
      final payload = object(await api.rpc('challenge_public'));
      if (mounted) {
        _updateHome(() => competitionBanner = object(payload['banner']));
      }
    } catch (_) {
      // Rankings remain available when the campaign banner cannot be fetched.
    }
  }

  void _openRanking() => unawaited(
    _overlay(() => widget.shell.push<void>(_Leaderboard(shell: widget.shell))),
  );

  bool _canContestVote(Data post) {
    if (!post.flag('one_chance_ready') || post.flag('my_voted')) return false;
    final author = post.string('author_id');
    if (author.isNotEmpty && author == widget.shell.me.string('id'))
      return false;
    final category = post.string('source_category', post.string('category'));
    final access = object(widget.shell.settings['one_chance.category_access']);
    return ((access['voting'] as List?) ?? ['entertainment']).contains(
      category,
    );
  }

  Future<void> _voteInContest(Data post) async {
    final id = post.string('id');
    if (!_canContestVote(post) || !voting.add(id)) return;
    _updateHome(() {});
    try {
      if ((await _overlay(widget.shell.requireAccount)) != true || !mounted)
        return;
      if (!_canContestVote(post)) return;
      final result = object(
        await api.rpc('vote_one_chance', {'p_post_id': id}),
      );
      if (mounted) _updateHome(() => post.addAll(result));
    } catch (error) {
      if (mounted) _notice(context, error);
    } finally {
      voting.remove(id);
      if (mounted) _updateHome(() {});
    }
  }

  Widget _contestRail(Data post) {
    final id = post.string('id');
    final voted = post.flag('my_voted');
    final pending = voting.contains(id);
    final votes = post.number('votes_count');
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0x8e352147), Color(0x8e14091e), Color(0x921f102e)],
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _HomeRailAction(
              icon: voted ? Icons.favorite : Icons.favorite_border_rounded,
              label: 'Vote',
              value: '$votes',
              valueLabel: pending
                  ? 'Voting…'
                  : voted
                  ? 'Voted'
                  : (votes == 1 ? 'Vote' : 'Votes'),
              color: voted ? const Color(0xffff65ad) : Colors.white,
              compact: true,
              selected: voted,
              enabled: !pending && _canContestVote(post),
              onTap: () => _voteInContest(post),
            ),
            _HomeRailAction(
              icon: Icons.near_me_outlined,
              label: 'Share',
              value: 'Share',
              color: Colors.white,
              compact: true,
              selected: false,
              onTap: () => _shareFromFeed(post),
            ),
            _HomeRailAction(
              icon: post.flag('my_bookmarked')
                  ? Icons.bookmark
                  : Icons.bookmark_border_rounded,
              label: post.flag('my_bookmarked') ? 'Saved' : 'Save',
              value: post.flag('my_bookmarked') ? 'Saved' : 'Save',
              color: Colors.white,
              compact: true,
              selected: post.flag('my_bookmarked'),
              onTap: () => _change(post, 'toggle_bookmark'),
            ),
            _HomeRailAction(
              icon: Icons.forum_outlined,
              label: 'Chat',
              value: 'Chat',
              color: Colors.white,
              compact: true,
              selected: false,
              onTap: () => _overlay(
                () => widget.shell.push<void>(
                  _Comments(shell: widget.shell, id: id),
                ),
              ),
            ),
            _HomeRailAction(
              icon: Icons.more_horiz,
              label: 'More options',
              color: Colors.white,
              compact: true,
              selected: false,
              onTap: () => _options(
                post,
                extraActions: (sheet) => [
                  ListTile(
                    leading: const Icon(Icons.visibility_off_outlined),
                    title: const Text('Hide this video'),
                    subtitle: const Text('For this One Chance session'),
                    onTap: () {
                      Navigator.pop(sheet);
                      unawaited(_hideContestPost(post));
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _shareFromFeed(Data post) async {
    final id = post.string('id');
    try {
      final result = await _overlay(
        () => SharePlus.instance.share(
          ShareParams(uri: Uri.parse('$site/post/$id')),
        ),
      );
      if (mounted &&
          result?.status == ShareResultStatus.success &&
          widget.shell.me.isNotEmpty) {
        await _change(post, 'record_share');
      }
    } catch (error) {
      if (mounted) _notice(context, error);
    }
  }
}

class _CompetitionBanner extends StatelessWidget {
  const _CompetitionBanner({required this.item, required this.onTap});
  final Data item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = item.string('name', 'One Chance');
    final schedule = item.string('schedule').trim();
    final minimum = item.number('min_prize');
    final maximum = item.number('max_prize');
    final prize = minimum > 0 && maximum > minimum
        ? '₹$minimum–₹$maximum'
        : maximum > 0
        ? '₹$maximum'
        : minimum > 0
        ? '₹$minimum'
        : '';
    return Padding(
      padding: const EdgeInsets.fromLTRB(7, 3, 7, 6),
      child: _HomeRim(
        radius: 14,
        stroke: 1,
        edge: const LinearGradient(
          colors: [Color(0xffff82cc), Color(0xffbc24f8), Color(0xfff000bc)],
        ),
        fill: const LinearGradient(
          colors: [Color(0xff382140), Color(0xff1c1129), Color(0xff411833)],
        ),
        shadows: const [BoxShadow(color: Color(0x70a212df), blurRadius: 10)],
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 3, 7, 3),
          child: Row(
            children: [
              const _HomeRim(
                radius: 10,
                fill: LinearGradient(
                  colors: [Color(0xff663d36), Color(0xff42205e)],
                ),
                child: SizedBox(
                  width: 34,
                  height: 34,
                  child: Icon(
                    Icons.emoji_events_outlined,
                    color: _homeGold,
                    size: 21,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: _homeGold,
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      [
                        if (item.string('status') == 'upcoming')
                          'Upcoming'
                        else
                          'Weekly challenge',
                        if (prize.isNotEmpty) prize,
                        if (schedule.isNotEmpty) schedule,
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: _homeMuted, fontSize: 10),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 5),
              _HomeRim(
                radius: 13,
                fill: _homeAccent,
                child: InkWell(
                  onTap: onTap,
                  borderRadius: BorderRadius.circular(12),
                  child: const SizedBox(
                    height: 42,
                    child: Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'View',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Icon(Icons.chevron_right, size: 14),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ContestBadge extends StatelessWidget {
  const _ContestBadge();
  @override
  Widget build(BuildContext context) => const _HomeRim(
    radius: 13,
    edge: LinearGradient(colors: [Color(0xfff6ba55), Color(0xffb642c9)]),
    child: Padding(
      padding: EdgeInsets.fromLTRB(7, 5, 8, 5),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.workspace_premium_outlined, color: _homeGold, size: 20),
          SizedBox(width: 5),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'One Chance',
                style: TextStyle(
                  color: _homeGold,
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                ),
              ),
              Text(
                'Weekly Contest',
                style: TextStyle(color: Color(0xffffa8ed), fontSize: 9),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

class _ContestLabel extends StatelessWidget {
  const _ContestLabel();
  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.only(bottom: 7),
    child: _HomeRim(
      radius: 15,
      fill: LinearGradient(colors: [Color(0xff76431c), Color(0xff591552)]),
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Text(
          'Contest Video',
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: _homeGold,
          ),
        ),
      ),
    ),
  );
}

class _GoldLaurel extends StatelessWidget {
  const _GoldLaurel({this.flipped = false, this.color = _homeGold});
  final bool flipped;
  final Color color;

  @override
  Widget build(BuildContext context) => CustomPaint(
    size: const Size(11, 25),
    painter: _LaurelPainter(flipped, color),
  );
}

class _LaurelPainter extends CustomPainter {
  const _LaurelPainter(this.flipped, this.color);
  final bool flipped;
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    if (flipped) {
      canvas.translate(size.width, 0);
      canvas.scale(-1, 1);
    }
    final gold = Paint()..color = color;
    canvas.drawPath(
      Path()
        ..moveTo(10, 24)
        ..quadraticBezierTo(0, 14, 7, 1),
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = .85,
    );
    for (var i = 0; i < 4; i++) {
      canvas.save();
      canvas.translate((i == 3 ? 6 : 3) + 0.0, 7.0 + i * 4);
      canvas.rotate(-.7 + i * .16);
      canvas.drawOval(
        Rect.fromCenter(center: Offset.zero, width: 2.7, height: 5.5),
        gold,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_LaurelPainter oldDelegate) =>
      oldDelegate.flipped != flipped || oldDelegate.color != color;
}
