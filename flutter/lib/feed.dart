part of 'main.dart';

class _Feed extends StatefulWidget {
  const _Feed({
    super.key,
    required this.shell,
    this.oneChance = false,
    this.postId,
    this.initialCategory = '',
    this.initialMode = 'for_you',
  });
  final _ShellState shell;
  final bool oneChance;
  final String? postId;
  final String initialCategory;
  final String initialMode;
  @override
  State<_Feed> createState() => _FeedState();
}

class _FeedState extends State<_Feed> with WidgetsBindingObserver {
  final posts = <Data>[];
  final hiddenContestPosts = <String>{};
  final pages = PageController(keepPage: false);
  final seed = randomKey();
  VideoPlayerController? player;
  VideoPlayerController? prepared;
  Future<void>? preparation;
  int preparedIndex = -1;
  int offset = 0;
  int playbackRequest = 0;
  int direction = 1;
  bool playbackFailed = false;
  bool foreground = true;
  int index = 0;
  int generation = 0;
  bool muted = true;
  bool loading = false;
  bool more = true;
  bool paused = false;
  Object? failure;
  late String category = widget.initialCategory;
  late String mode = widget.initialMode;
  OjasssApi get api => widget.shell.api;
  bool get home => !widget.oneChance && widget.postId == null;
  bool postFullscreen = false;
  bool get immersive => home || widget.oneChance;
  Data competitionBanner = {};
  Data viralChallengeBanner = {};
  final sendingHots = <String>{};
  final hotAnimations = <String, int>{};
  final voting = <String>{};
  Timer? controlsTimer;
  bool controlsVisible = true;
  bool unreadNotifications = false;
  void _updateHome(VoidCallback update) => setState(update);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (immersive) {
      muted = widget.shell.homeMuted;
      unawaited(_homeRefreshUnread());
    }
    if (!home) unawaited(_loadCompetitionBanner());
    if (home) unawaited(_loadViralChallenge());
    unawaited(_load());
  }

  Future<void> _load() async {
    if (loading || !more) return;
    setState(() {
      loading = true;
      failure = null;
    });
    final expected = generation;
    try {
      final result = widget.postId != null
          ? await api.rpc('get_post', {'p_post_id': widget.postId})
          : await api.rpc(mode == 'trending' ? 'trending_posts' : 'feed', {
              'p_limit': 10,
              'p_offset': offset,
              'p_mode': mode,
              'p_seed': seed,
              'p_category': widget.oneChance
                  ? 'one_chance'
                  : (category.isEmpty ? null : category),
            });
      if (!mounted || generation != expected) return;
      final batch = records(result);
      final first = posts.isEmpty;
      final known = posts.map((post) => post.string('id')).toSet();
      setState(() {
        offset += batch.length;
        posts.addAll(
          batch.where((post) {
            final id = post.string('id');
            return !hiddenContestPosts.contains(id) && known.add(id);
          }),
        );
        more = widget.postId == null && batch.length == 10;
      });
      if (first && posts.isNotEmpty) unawaited(_play(0));
      if (posts.isEmpty && more) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && generation == expected) unawaited(_load());
        });
      }
      if (!first && index < posts.length && player?.value.isPlaying == true)
        _prepareNeighbour();
    } catch (error) {
      if (mounted && generation == expected) setState(() => failure = error);
    } finally {
      if (mounted && generation == expected) setState(() => loading = false);
    }
  }

  Future<void> _reset() async {
    generation++;
    playbackRequest++;
    offset = 0;
    _discardPrepared();
    final current = player;
    player = null;
    setState(() {
      posts.clear();
      index = 0;
      loading = false;
      more = true;
    });
    if (pages.hasClients) pages.jumpToPage(0);
    await current?.dispose();
    if (mounted) await _load();
  }

  VideoPlayerController? _controllerFor(int position) {
    final post = posts[position];
    final path = post.string('media_path');
    if (post.string('kind') != 'video' || path.isEmpty) return null;
    return VideoPlayerController.networkUrl(
      api.media(path),
      httpHeaders: api.headers,
    );
  }

  void _discardPrepared() {
    final video = prepared;
    prepared = null;
    preparation = null;
    preparedIndex = -1;
    if (video != null) unawaited(video.dispose());
  }

  void _prepareNeighbour() {
    if (!foreground || widget.postId != null) return;
    final adjacent = index + direction;
    if (adjacent < 0 || adjacent >= posts.length || preparedIndex == adjacent)
      return;
    _discardPrepared();
    final video = _controllerFor(adjacent);
    if (video == null) return;
    prepared = video;
    preparedIndex = adjacent;
    preparation = video.initialize();
    unawaited(
      preparation!.then<void>(
        (_) {},
        onError: (_) {
          if (prepared == video) _discardPrepared();
        },
      ),
    );
  }

  Future<void> _play(int position) async {
    if (position >= posts.length) return;
    final request = ++playbackRequest;
    final previous = player;
    final post = posts[position];
    final usePrepared = preparedIndex == position;
    final next = usePrepared ? prepared : _controllerFor(position);
    final initialize = usePrepared ? preparation : null;
    if (usePrepared) {
      prepared = null;
      preparation = null;
      preparedIndex = -1;
    } else {
      _discardPrepared();
    }
    setState(() {
      if (index != position) direction = position > index ? 1 : -1;
      player = next;
      index = position;
      paused = false;
      playbackFailed = false;
    });
    if (immersive) _homeShowControls();
    if (previous != null) unawaited(previous.dispose());
    if (position >= posts.length - 3) unawaited(_load());
    if (next == null) {
      _prepareNeighbour();
      return;
    }
    try {
      await (initialize ?? next.initialize()).timeout(
        const Duration(seconds: 12),
      );
      if (!mounted || player != next) return;
      await next.setLooping(true);
      await next.setVolume(muted ? 0 : 1);
      if (!mounted || player != next) return;
      if (foreground && !paused && (ModalRoute.of(context)?.isCurrent ?? true))
        await next.play();
      if (mounted && player == next) setState(() {});
      if (mounted && player == next) _prepareNeighbour();
      if (widget.shell.me.isNotEmpty) {
        unawaited(
          api
              .rpc('record_view', {'p_post_id': post.string('id')})
              .then<void>((_) {}, onError: (_) {}),
        );
      }
    } catch (_) {
      if (mounted && request == playbackRequest && player == next) {
        setState(() {
          player = null;
          playbackFailed = true;
        });
        unawaited(next.dispose());
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    foreground = state == AppLifecycleState.resumed;
    if (foreground && home) unawaited(_loadViralChallenge());
    if (foreground && !home) unawaited(_loadCompetitionBanner());
    if (!foreground) _discardPrepared();
    final video = player;
    if (foreground && playbackFailed && !paused) {
      unawaited(_play(index));
      return;
    }
    if (video == null || !video.value.isInitialized) return;
    if (state == AppLifecycleState.resumed &&
        !paused &&
        (ModalRoute.of(context)?.isCurrent ?? false)) {
      unawaited(video.play());
    } else {
      unawaited(video.pause());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    controlsTimer?.cancel();
    pages.dispose();
    _discardPrepared();
    player?.dispose();
    super.dispose();
  }

  Future<T?> _overlay<T>(Future<T?> Function() open) async {
    final current = player;
    await current?.pause();
    final result = await open();
    if (mounted &&
        foreground &&
        (ModalRoute.of(context)?.isCurrent ?? false) &&
        !paused &&
        current == player &&
        current?.value.isInitialized == true)
      await current?.play();
    return result;
  }

  Future<void> _hideContestPost(Data post) async {
    hiddenContestPosts.add(post.string('id'));
    await _reset();
  }

  Future<void> _change(Data post, String name, [Data params = const {}]) async {
    if ((await _overlay(widget.shell.requireAccount)) != true) return;
    try {
      final updated = object(
        await api.rpc(name, {'p_post_id': post.string('id'), ...params}),
      );
      if (!mounted) return;
      setState(() {
        post.addAll(updated);
        if (updated.containsKey('bookmarked'))
          post['my_bookmarked'] = updated['bookmarked'];
      });
    } catch (error) {
      if (mounted) _notice(context, error);
    }
  }

  Future<void> _filters({required bool showCategories}) async {
    final choice = await _overlay(
      () => showModalBottomSheet<String>(
        context: context,
        showDragHandle: true,
        builder: (context) {
          final options = showCategories
              ? {'': 'All categories', ...categories}
              : {
                  'for_you': 'For You',
                  'following': 'Following',
                  'trending': 'Trending',
                };
          return SafeArea(
            child: ListView(
              shrinkWrap: true,
              children: options.entries
                  .map(
                    (option) => ListTile(
                      title: Text(option.value),
                      onTap: () => Navigator.pop(context, option.key),
                    ),
                  )
                  .toList(),
            ),
          );
        },
      ),
    );
    if (choice == null || !mounted) return;
    if (choice == 'following' &&
        (await _overlay(widget.shell.requireAccount)) != true)
      return;
    if (!mounted) return;
    if (showCategories) {
      category = choice;
    } else {
      mode = choice;
    }
    await _reset();
  }

  Widget _header() => SizedBox(
    height: 44,
    child: Stack(
      alignment: Alignment.center,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: widget.postId != null
                ? () => Navigator.maybePop(context)
                : () => _filters(showCategories: false),
            child: Text(
              widget.postId != null
                  ? 'Back'
                  : widget.oneChance
                  ? 'One Chance'
                  : switch (mode) {
                      'following' => 'Following ⌄',
                      'trending' => 'Trending ⌄',
                      _ => 'For You ⌄',
                    },
              style: const TextStyle(fontSize: 12, color: Colors.white),
            ),
          ),
        ),
        const _Brand(),
        Align(
          alignment: Alignment.centerRight,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _headerIcon(
                Icons.campaign_outlined,
                'Announcements',
                () => _overlay(
                  () => widget.shell.push<void>(_Updates(shell: widget.shell)),
                ),
              ),
              _headerIcon(
                Icons.grid_view_rounded,
                'Categories',
                () => _filters(showCategories: true),
              ),
              _headerIcon(
                Icons.emoji_events_outlined,
                'Leaderboard',
                () => _overlay(
                  () => widget.shell.push<void>(
                    _Leaderboard(shell: widget.shell),
                  ),
                ),
                gradient: true,
              ),
            ],
          ),
        ),
      ],
    ),
  );

  Widget _headerIcon(
    IconData icon,
    String label,
    VoidCallback onPressed, {
    bool gradient = false,
  }) => SizedBox(
    width: MediaQuery.sizeOf(context).width < 370 ? 35 : 42,
    height: 44,
    child: IconButton(
      tooltip: label,
      padding: EdgeInsets.zero,
      onPressed: onPressed,
      icon: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: gradient ? _gradient : null,
        ),
        child: Icon(icon, size: 18),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final banner = widget.shell.announcements.firstOrNull;
    final body = SafeArea(
      bottom: widget.postId != null,
      child: Column(
        children: [
          if (immersive && !widget.shell.homeFullscreen) _homeHeader(),
          if (!immersive && !postFullscreen) _header(),
          if (!(immersive ? widget.shell.homeFullscreen : postFullscreen) &&
              competitionBanner.isNotEmpty &&
              competitionBanner.string('status') != 'closed')
            _CompetitionBanner(item: competitionBanner, onTap: _openRanking),
          if (home &&
              !widget.shell.homeFullscreen &&
              viralChallengeBanner.isNotEmpty)
            _ViralChallengeStrip(
              item: viralChallengeBanner,
              onTap: _openViralChallenge,
            ),
          if (!immersive && !postFullscreen && banner != null)
            _Announcement(
              item: banner,
              onTap: () => _overlay(
                () => widget.shell.push<void>(_Updates(shell: widget.shell)),
              ),
            ),
          Expanded(
            child: posts.isEmpty
                ? Center(
                    child: loading
                        ? immersive
                              ? const _HomeLoading()
                              : const CircularProgressIndicator()
                        : TextButton(
                            onPressed: _load,
                            child: Text(
                              failure == null
                                  ? 'No posts yet. Refresh'
                                  : 'Could not load posts. Retry',
                            ),
                          ),
                  )
                : PageView.builder(
                    controller: pages,
                    scrollDirection: Axis.vertical,
                    itemCount:
                        posts.length + ((more || failure != null) ? 1 : 0),
                    onPageChanged: (page) {
                      if (page < posts.length) {
                        _play(page);
                      } else {
                        paused = true;
                        player?.pause();
                        if (failure == null) _load();
                      }
                    },
                    itemBuilder: (context, page) => page == posts.length
                        ? Center(
                            child: failure == null
                                ? const CircularProgressIndicator()
                                : TextButton(
                                    onPressed: _load,
                                    child: const Text('Retry'),
                                  ),
                          )
                        : _homeReel(
                            posts[page],
                            page == index ? player : null,
                            page == index,
                          ),
                  ),
          ),
        ],
      ),
    );
    return widget.postId != null
        ? Scaffold(
            body: PopScope(
              canPop: !postFullscreen,
              onPopInvokedWithResult: (popped, _) {
                if (!popped && postFullscreen)
                  setState(() => postFullscreen = false);
              },
              child: body,
            ),
          )
        : body;
  }

  Future<void> _options(
    Data post, {
    VoidCallback? vote,
    int votes = 0,
    List<Widget> Function(BuildContext)? extraActions,
  }) async {
    final id = post.string('id');
    final own = widget.shell.me.string('id') == post.string('author_id');
    await _overlay(
      () => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (context) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              ...?extraActions?.call(context),
              if (vote != null)
                ListTile(
                  leading: const Icon(Icons.how_to_vote_outlined),
                  title: const Text('Vote in One Chance'),
                  trailing: Text('$votes'),
                  onTap: () {
                    Navigator.pop(context);
                    vote();
                  },
                ),
              ListTile(
                leading: const Icon(Icons.link),
                title: const Text('Copy link'),
                onTap: () {
                  Clipboard.setData(ClipboardData(text: '$site/post/$id'));
                  Navigator.pop(context);
                },
              ),
              if (post.string('series_id').isNotEmpty)
                ListTile(
                  leading: const Icon(Icons.video_library_outlined),
                  title: const Text('Episodes'),
                  onTap: () {
                    Navigator.pop(context);
                    _overlay(
                      () => widget.shell.push<void>(
                        _Episodes(shell: widget.shell, postId: id),
                      ),
                    );
                  },
                ),
              if (post.flag('has_cta'))
                ListTile(
                  leading: const Icon(Icons.open_in_new),
                  title: const Text('Open post link'),
                  onTap: () async {
                    Navigator.pop(context);
                    try {
                      final result = object(
                        await api.rpc('record_cta_click', {'p_post_id': id}),
                      );
                      if (mounted)
                        await _external(this.context, result.string('url'));
                    } catch (error) {
                      if (mounted) _notice(this.context, error);
                    }
                  },
                ),
              if (own)
                ListTile(
                  leading: const Icon(Icons.delete_outline),
                  title: const Text('Delete post'),
                  onTap: () async {
                    Navigator.pop(context);
                    if (!mounted ||
                        !await _confirm(this.context, 'Delete this post?'))
                      return;
                    try {
                      await api.rpc('delete_post', {'p_post_id': id});
                      if (mounted) await _reset();
                    } catch (error) {
                      if (mounted) _notice(this.context, error);
                    }
                  },
                ),
              if (!own)
                ListTile(
                  leading: const Icon(Icons.flag_outlined),
                  title: const Text('Report post'),
                  onTap: () {
                    Navigator.pop(context);
                    _overlay(() => _report(widget.shell, 'post', id));
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Announcement extends StatelessWidget {
  const _Announcement({required this.item, required this.onTap});
  final Data item;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    child: Container(
      margin: const EdgeInsets.fromLTRB(7, 0, 7, 4),
      padding: const EdgeInsets.all(6),
      decoration: _decoration(color: const Color(0xff391e41)),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              gradient: _gradient,
              borderRadius: BorderRadius.circular(9),
            ),
            child: const Icon(Icons.campaign_outlined, size: 19),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Announcement · ${item.string('title')}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  item.string('message'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: _muted, fontSize: 11),
                ),
              ],
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 7),
            child: Text('View ›', style: TextStyle(fontSize: 11)),
          ),
        ],
      ),
    ),
  );
}

Future<bool> _confirm(BuildContext context, String title) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    ) ??
    false;

Future<void> _report(_ShellState shell, String type, String id) async {
  if (!await shell.requireAccount() || !shell.mounted) return;
  await shell.push<void>(
    _FormPage(
      title: 'Report $type',
      fields: const [
        _Field(
          'Reason',
          choices: {
            'spam': 'Spam',
            'harassment': 'Harassment',
            'other': 'Other',
          },
        ),
        _Field('Details', required: false),
      ],
      submit: (values) => shell.api.rpc('create_report', {
        'p_target_type': type,
        'p_target_id': id,
        'p_reason': values[0],
        'p_description': values[1],
      }),
    ),
  );
}
