part of 'main.dart';

const _homeBackground = Color(0xff100518);
const _homeMuted = Color(0xffd3c7db);
const _homeGold = Color(0xffffc247);
const _homeAccent = LinearGradient(
  colors: [Color(0xffff8a35), Color(0xfff73576), Color(0xffa900ff)],
);
const _homeEdge = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [
    Color(0xffffa153),
    Color(0xfff000c8),
    Color(0xff42234f),
    Color(0xffff7840),
  ],
);

Duration _homeMotion(BuildContext context, [int milliseconds = 200]) =>
    MediaQuery.disableAnimationsOf(context)
    ? Duration.zero
    : Duration(milliseconds: milliseconds);

extension _HomeFeed on _FeedState {
  Future<void> _homeRefreshUnread() async {
    if (widget.shell.me.isEmpty) return;
    try {
      final counts = object(await api.rpc('unread_counts'));
      if (mounted)
        _updateHome(
          () => unreadNotifications = counts.number('notifications') > 0,
        );
    } catch (_) {
      // The notifications page can retry independently.
    }
  }

  void _homeShowControls() {
    controlsTimer?.cancel();
    if (!mounted) return;
    if (!controlsVisible) _updateHome(() => controlsVisible = true);
    controlsTimer = Timer(const Duration(seconds: 5), () {
      if (mounted && !paused && !MediaQuery.disableAnimationsOf(context)) {
        _updateHome(() => controlsVisible = false);
      }
    });
  }

  void _homeUpdates() => unawaited(
    _overlay(() => widget.shell.push<void>(_Updates(shell: widget.shell))),
  );

  Future<void> _homeNotifications() async {
    await _overlay(() async {
      if (await widget.shell.requireAccount() && mounted) {
        await widget.shell.push<void>(_Notifications(shell: widget.shell));
      }
    });
    if (mounted) await _homeRefreshUnread();
  }

  Future<void> _homeMenu() async {
    final choice = await _overlay(
      () => showModalBottomSheet<String>(
        context: context,
        showDragHandle: true,
        builder: (context) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final (id, text, icon) in [
                ('categories', 'Categories', Icons.grid_view_rounded),
                ('updates', 'Announcements', Icons.campaign_outlined),
                ('tasks', 'My tasks', Icons.checklist_outlined),
                ('wallet', 'Wallet', Icons.account_balance_wallet_outlined),
                ('settings', 'Settings', Icons.settings_outlined),
              ])
                ListTile(
                  leading: Icon(icon),
                  title: Text(text),
                  onTap: () => Navigator.pop(context, id),
                ),
            ],
          ),
        ),
      ),
    );
    if (!mounted || choice == null) return;
    switch (choice) {
      case 'categories':
        await _filters(showCategories: true);
      case 'updates':
        _homeUpdates();
      default:
        await _overlay(() async {
          if (!await widget.shell.requireAccount() || !mounted) return;
          await widget.shell.push<void>(switch (choice) {
            'tasks' => _Tasks(shell: widget.shell),
            'wallet' => _Wallet(shell: widget.shell),
            _ => _Settings(shell: widget.shell),
          });
        });
    }
  }

  Future<void> _homeCategory(String nextMode, String nextCategory) async {
    if (mode == nextMode && category == nextCategory) return;
    mode = nextMode;
    category = nextCategory;
    await _reset();
  }

  Future<void> _homeJobs() async {
    final choice = await _overlay(
      () => showModalBottomSheet<String>(
        context: context,
        showDragHandle: true,
        builder: (context) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.work_outline),
                title: const Text('Part Time Jobs · 48hrs'),
                onTap: () => Navigator.pop(context, 'part_time_jobs'),
              ),
              ListTile(
                leading: const Icon(Icons.business_center_outlined),
                title: const Text('Full Time Jobs'),
                onTap: () => Navigator.pop(context, 'full_time_jobs'),
              ),
            ],
          ),
        ),
      ),
    );
    if (mounted && choice != null) await _homeCategory('for_you', choice);
  }

  Widget _homeHeader() => TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: 1),
    duration: _homeMotion(context, 250),
    builder: (_, value, child) => Opacity(opacity: value, child: child),
    child: _HomeHeader(
      menu: _homeMenu,
      search: () => _overlay(
        () => widget.shell.push<void>(_Discover(shell: widget.shell)),
      ),
      notifications: _homeNotifications,
      unread: unreadNotifications,
      leaderboard: _openRanking,
      oneChance: widget.oneChance,
      mode: mode,
      category: category,
      feedMenu: widget.oneChance
          ? () => widget.shell.openHomeFeed('for_you')
          : () => _filters(showCategories: false),
      trending: widget.oneChance
          ? () => widget.shell.openHomeFeed('trending')
          : () => _homeCategory('trending', ''),
      entertainment: widget.oneChance
          ? () => widget.shell.openHomeFeed('for_you', 'entertainment')
          : () => _homeCategory('for_you', 'entertainment'),
      jobs: _homeJobs,
    ),
  );

  Widget _homeReel(Data post, VideoPlayerController? video, bool active) {
    final isVideo = post.string('kind') == 'video';
    final cover = post.string(isVideo ? 'thumbnail_path' : 'media_path');
    final fullscreen = widget.postId != null
        ? postFullscreen
        : widget.shell.homeFullscreen;
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: fullscreen ? 0 : 7),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(fullscreen ? 0 : 14),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final compact = constraints.maxHeight < 555;
            const railWidth = 52.0;
            return ColoredBox(
              color: const Color(0xff130d1b),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (cover.isEmpty &&
                      video == null &&
                      active &&
                      isVideo &&
                      !playbackFailed)
                    const _HomeLoading(),
                  if (cover.isNotEmpty)
                    Image.network(
                      api.media(cover).toString(),
                      fit: isVideo ? BoxFit.cover : BoxFit.contain,
                      errorBuilder: (_, _, _) => const SizedBox.shrink(),
                      excludeFromSemantics: true,
                    ),
                  if (video != null && video.value.isInitialized)
                    TweenAnimationBuilder<double>(
                      key: ObjectKey(video),
                      tween: Tween(begin: 0, end: 1),
                      duration: _homeMotion(context, 220),
                      builder: (_, opacity, child) =>
                          Opacity(opacity: opacity, child: child),
                      child: FittedBox(
                        fit: BoxFit.cover,
                        clipBehavior: Clip.hardEdge,
                        child: SizedBox(
                          width: video.value.size.width,
                          height: video.value.size.height,
                          child: VideoPlayer(video),
                        ),
                      ),
                    ),
                  Positioned.fill(
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: _homeShowControls,
                      onDoubleTap: fullscreen ? _homeToggleFullscreen : null,
                    ),
                  ),
                  if (active &&
                      (playbackFailed || video?.value.hasError == true))
                    Center(
                      child: FilledButton.tonal(
                        onPressed: () => _play(index),
                        child: const Text('Retry playback'),
                      ),
                    ),
                  if (video != null)
                    Center(
                      child: IgnorePointer(
                        child: ValueListenableBuilder<VideoPlayerValue>(
                          valueListenable: video,
                          builder: (_, value, _) =>
                              !value.isInitialized && !value.hasError
                              ? const _HomeLoading()
                              : value.isBuffering && value.isInitialized
                              ? const CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                )
                              : const SizedBox.shrink(),
                        ),
                      ),
                    ),
                  if (!fullscreen) ...[
                    const Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 140,
                      child: IgnorePointer(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [Colors.transparent, Color(0xee100518)],
                            ),
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 17,
                      left: 9,
                      right: railWidth + 10,
                      child: _homeCreator(post),
                    ),
                    Positioned(
                      top: 58,
                      bottom: 48,
                      width: railWidth,
                      right: 2,
                      child: Align(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: SizedBox(
                            width: railWidth,
                            child: widget.oneChance
                                ? _contestRail(post)
                                : _homeRail(post, compact),
                          ),
                        ),
                      ),
                    ),
                  ],
                  if (widget.oneChance &&
                      !fullscreen &&
                      post.flag('one_chance_ready'))
                    const Positioned(left: 10, top: 61, child: _ContestBadge()),
                  if (isVideo && active)
                    Positioned(
                      left: 8,
                      right: 8,
                      top: 9,
                      child: IgnorePointer(
                        ignoring: !controlsVisible,
                        child: AnimatedOpacity(
                          duration: _homeMotion(context),
                          opacity: controlsVisible ? 1 : 0,
                          child: Row(
                            children: [
                              _HomeRound(
                                icon: paused
                                    ? Icons.play_arrow_rounded
                                    : Icons.pause_rounded,
                                label: paused ? 'Play' : 'Pause',
                                onTap: video == null
                                    ? null
                                    : () {
                                        _updateHome(() => paused = !paused);
                                        if (paused) {
                                          unawaited(video.pause());
                                        } else {
                                          unawaited(video.play());
                                        }
                                        _homeShowControls();
                                      },
                              ),
                              const SizedBox(width: 3),
                              _HomeRound(
                                icon: muted
                                    ? Icons.volume_off_outlined
                                    : Icons.volume_up_outlined,
                                label: muted ? 'Unmute' : 'Mute',
                                onTap: () {
                                  _updateHome(
                                    () =>
                                        widget.shell.homeMuted = muted = !muted,
                                  );
                                  video?.setVolume(muted ? 0 : 1);
                                  _homeShowControls();
                                },
                              ),
                              const Spacer(),
                              if (video != null)
                                ValueListenableBuilder<VideoPlayerValue>(
                                  valueListenable: video,
                                  builder: (_, value, _) =>
                                      value.isInitialized &&
                                          (value.size.width < value.size.height
                                                  ? value.size.width
                                                  : value.size.height) >=
                                              720
                                      ? const _HomeHd()
                                      : const SizedBox.shrink(),
                                ),
                              _HomeRound(
                                icon: fullscreen
                                    ? Icons.fullscreen_exit
                                    : Icons.fullscreen,
                                label: fullscreen
                                    ? 'Exit fullscreen'
                                    : 'Fullscreen',
                                onTap: _homeToggleFullscreen,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  if (video != null)
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: _HomeProgress(video: video),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  void _homeToggleFullscreen() {
    _homeShowControls();
    if (widget.postId != null) {
      _updateHome(() => postFullscreen = !postFullscreen);
    } else {
      widget.shell.setHomeFullscreen(!widget.shell.homeFullscreen);
    }
  }

  Widget _homeCreator(Data post) {
    final handle = post.string('author_username');
    final name = post.string('author_display_name', handle);
    final source = widget.oneChance
        ? 'one_chance'
        : post.string('source_category', post.string('category'));
    final author = post.string('author_id');
    final origin = post.string('content_origin');
    final date = DateTime.tryParse(post.string('created_at'))?.toLocal();
    final time = date == null
        ? ''
        : ' · ${date.day.toString().padLeft(2, '0')}-${date.month.toString().padLeft(2, '0')} ${date.hour % 12 == 0 ? 12 : date.hour % 12}:${date.minute.toString().padLeft(2, '0')} ${date.hour < 12 ? 'AM' : 'PM'}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.oneChance)
          const _ContestLabel()
        else if (origin == 'new_content' || origin == 'copy_paste')
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _HomeRim(
              radius: 18,
              edge: origin == 'new_content'
                  ? const LinearGradient(
                      colors: [
                        Color(0xffb5ff30),
                        Color(0xff05cfaa),
                        Color(0xfff000c8),
                      ],
                    )
                  : _homeEdge,
              fill: origin == 'new_content'
                  ? const LinearGradient(
                      colors: [
                        Color(0xff087d60),
                        Color(0xff086a71),
                        Color(0xff771269),
                      ],
                    )
                  : const LinearGradient(
                      colors: [Color(0xff46205d), Color(0xff581c40)],
                    ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      origin == 'new_content' ? 'New Content' : 'Copy-Paste',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (origin == 'new_content') ...[
                      const SizedBox(width: 4),
                      const Icon(
                        Icons.auto_awesome,
                        size: 12,
                        color: _homeGold,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        Row(
          children: [
            Expanded(
              child: InkWell(
                onTap: handle.isEmpty
                    ? null
                    : () => _overlay(
                        () => widget.shell.push<void>(
                          _Profile(shell: widget.shell, handle: handle),
                        ),
                      ),
                child: Row(
                  children: [
                    _Avatar(
                      api,
                      post.string('author_avatar_path'),
                      name,
                      size: 38,
                      ring: post.string('author_status_post_id').isNotEmpty,
                    ),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              if (post.flag('author_verified')) ...[
                                const SizedBox(width: 4),
                                const Icon(
                                  Icons.verified,
                                  color: Color(0xff63b7ff),
                                  size: 14,
                                ),
                              ],
                            ],
                          ),
                          Text(
                            categories[source] ?? source,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              color: Colors.white,
                            ),
                          ),
                          Text(
                            '@$handle$time',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 10,
                              color: _homeMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (!widget.oneChance &&
                author.isNotEmpty &&
                author != widget.shell.me.string('id')) ...[
              const SizedBox(width: 6),
              _HomeRespect(
                following: post.flag('my_following'),
                onTap: () async {
                  if ((await _overlay(widget.shell.requireAccount)) != true)
                    return;
                  try {
                    final result = object(
                      await api.rpc('toggle_follow', {'p_user_id': author}),
                    );
                    if (mounted)
                      _updateHome(() {
                        for (final item in posts.where(
                          (item) => item.string('author_id') == author,
                        )) {
                          item['my_following'] = result['following'];
                        }
                      });
                  } catch (error) {
                    if (mounted) _notice(context, error);
                  }
                },
              ),
            ],
          ],
        ),
        if (post.string('caption').isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              post.string('caption'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, color: _homeMuted),
            ),
          ),
      ],
    );
  }

  Widget _homeRail(Data post, bool compact) {
    final controls = object(widget.shell.settings['home.controls']);
    bool show(String key) => controls[key] != false;
    final id = post.string('id');
    final viral = post.flag('is_viral');
    final fires = post.number('hot_count');
    final shares = post.number('shares_count');
    final fireGoal = widget.shell.settings
        .number('engagement.hot_threshold')
        .clamp(10, 999999);
    final shareGoal = widget.shell.settings
        .number('engagement.share_threshold')
        .clamp(10, 999999);
    final source = post.string('source_category', post.string('category'));
    final access = object(widget.shell.settings['one_chance.category_access']);
    final canVote =
        post.flag('one_chance_ready') &&
        viral &&
        ((access['voting'] as List?) ?? ['entertainment']).contains(source);
    void share() async {
      try {
        final result = await SharePlus.instance.share(
          ShareParams(uri: Uri.parse('$site/post/$id')),
        );
        if (mounted &&
            result.status == ShareResultStatus.success &&
            widget.shell.me.isNotEmpty) {
          await _change(post, 'record_share');
        }
      } catch (error) {
        if (mounted) _notice(context, error);
      }
    }

    void chat() => unawaited(
      _overlay(
        () => widget.shell.push<void>(_Comments(shell: widget.shell, id: id)),
      ),
    );
    void viralProgress() => unawaited(
      _overlay(
        () => showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Viral'),
            content: Text(
              viral
                  ? 'This post has reached Viral.'
                  : '$fires/$fireGoal Hots · $shares/$shareGoal Shares',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Done'),
              ),
            ],
          ),
        ),
      ),
    );
    final showHot =
        show('hearts') && !(viral && post.string('kind') == 'video');
    return LayoutBuilder(
      builder: (context, constraints) {
        Widget action(
          IconData icon,
          String label,
          VoidCallback tap, {
          String? value,
          bool selected = false,
          bool enabled = true,
          Widget? glyph,
          Widget? details,
          Color color = Colors.white,
        }) => _HomeRailAction(
          icon: icon,
          label: label,
          onTap: tap,
          value: value,
          compact: compact,
          selected: selected,
          color: color,
          enabled: enabled,
          glyph: glyph,
          details: details,
          referenceStyle: true,
        );
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (showHot)
                action(
                  Icons.local_fire_department_outlined,
                  'Hots',
                  () => _sendHot(post),
                  enabled:
                      !sendingHots.contains(id) &&
                      widget.shell.me.string('id') != post.string('author_id'),
                  glyph: _HotFlame(
                    selected: post.flag('my_hot'),
                    disabled:
                        sendingHots.contains(id) ||
                        widget.shell.me.string('id') ==
                            post.string('author_id'),
                    pulse: hotAnimations[id] ?? 0,
                  ),
                  value: '$fires',
                  selected: post.flag('my_hot'),
                  color: post.flag('my_hot')
                      ? const Color(0xffff8848)
                      : Colors.white,
                ),
              if (show('viral'))
                action(
                  Icons.bolt_rounded,
                  'Viral progress',
                  viralProgress,
                  details: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _RailProgressLine(
                        Icons.local_fire_department_outlined,
                        '$fires/$fireGoal',
                      ),
                      _RailProgressLine(
                        Icons.near_me_outlined,
                        '$shares/$shareGoal',
                      ),
                    ],
                  ),
                  selected: viral,
                  color: const Color(0xffffac57),
                ),
              if (show('speak'))
                action(
                  Icons.mic_none_rounded,
                  'Speak',
                  () => _overlay(
                    () => widget.shell.push<void>(
                      _Comments(shell: widget.shell, id: id),
                    ),
                  ),
                  value: '${post.number('comments_count')}',
                ),
              if (show('save'))
                action(
                  post.flag('my_bookmarked')
                      ? Icons.bookmark
                      : Icons.bookmark_border_rounded,
                  'Save',
                  () => _change(post, 'toggle_bookmark'),
                  selected: post.flag('my_bookmarked'),
                  value: '${post.number('bookmarks_count')}',
                ),
              if (show('share'))
                action(
                  Icons.near_me_outlined,
                  'Share',
                  share,
                  value: '$shares',
                ),
              if (show('more'))
                action(
                  Icons.forum_outlined,
                  'Chat',
                  chat,
                  value: 'Chat',
                  selected: true,
                ),
              if (show('more') || canVote)
                action(
                  Icons.more_horiz,
                  'More options',
                  () => _options(
                    post,
                    vote: canVote ? () => _voteInContest(post) : null,
                    votes: post.number('votes_count').toInt(),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _HomeRim extends StatelessWidget {
  const _HomeRim({
    required this.child,
    required this.radius,
    this.edge = _homeEdge,
    this.fill,

    this.shadows = const [],
    this.stroke = 1,
  });
  final Widget child;
  final double radius;
  final Gradient edge;
  final Gradient? fill;
  final double stroke;
  final List<BoxShadow> shadows;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(radius),
      gradient: edge,
      boxShadow: shadows,
    ),
    child: Padding(
      padding: EdgeInsets.all(stroke),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xff200b2b),
          gradient: fill,
          borderRadius: BorderRadius.circular(radius - stroke),
        ),
        child: child,
      ),
    ),
  );
}

class _HomeHeader extends StatelessWidget {
  const _HomeHeader({
    required this.menu,
    required this.search,
    required this.notifications,
    required this.unread,
    required this.leaderboard,
    required this.mode,
    required this.category,
    required this.feedMenu,
    required this.trending,
    required this.entertainment,
    required this.jobs,
    required this.oneChance,
  });
  final VoidCallback menu,
      search,
      notifications,
      leaderboard,
      feedMenu,
      trending,
      entertainment,
      jobs;
  final bool unread, oneChance;
  final String mode, category;

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.sizeOf(context).width < 387;
    final jobsSelected =
        category == 'part_time_jobs' || category == 'full_time_jobs';
    final homeSelected =
        !oneChance &&
        mode != 'trending' &&
        category != 'entertainment' &&
        !jobsSelected;
    Widget headerIcon(IconData icon, String label, VoidCallback tap) =>
        SizedBox(
          width: 40,
          height: 48,
          child: IconButton(
            tooltip: label,
            onPressed: tap,
            padding: EdgeInsets.zero,
            icon: Icon(icon, size: oneChance ? 24 : 20, color: Colors.white),
          ),
        );
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: oneChance ? (narrow ? 60 : 63) : 50,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Positioned(left: 7, child: headerIcon(Icons.menu, 'Menu', menu)),
              Positioned(
                left: 54,
                right: 126,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Column(
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (oneChance)
                            const Padding(
                              padding: EdgeInsets.only(right: 4),
                              child: _GoldLaurel(),
                            ),
                          ClipOval(
                            child: Image.asset(
                              'assets/home-flame.png',
                              width: 29,
                              height: 29,
                            ),
                          ),
                          const SizedBox(width: 7),
                          const Text(
                            'OJASSS',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              letterSpacing: .9,
                            ),
                          ),
                          if (oneChance)
                            const Padding(
                              padding: EdgeInsets.only(left: 4),
                              child: _GoldLaurel(flipped: true),
                            ),
                        ],
                      ),
                      if (oneChance) const SizedBox(height: 3),
                      if (oneChance)
                        const Text(
                          'THE INDIAN MASS POWER APP',
                          style: TextStyle(
                            color: Color(0xffede3f1),
                            fontSize: 8.2,
                            letterSpacing: .45,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              Positioned(
                right: 9,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    headerIcon(Icons.search, 'Search', search),
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        headerIcon(
                          Icons.notifications_none,
                          'Notifications',
                          notifications,
                        ),
                        if (unread)
                          const Positioned(
                            right: 6,
                            top: 7,
                            child: IgnorePointer(
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: Color(0xffec1689),
                                  shape: BoxShape.circle,
                                ),
                                child: SizedBox(width: 8, height: 8),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 3),
                    _HomeRim(
                      radius: 13,
                      fill: _homeAccent,
                      shadows: const [
                        BoxShadow(color: Color(0x50e1269a), blurRadius: 10),
                      ],
                      child: SizedBox(
                        width: 37,
                        height: 39,
                        child: IconButton(
                          onPressed: leaderboard,
                          tooltip: 'Leaderboard',
                          padding: EdgeInsets.zero,
                          icon: const Icon(
                            Icons.emoji_events_outlined,
                            color: Colors.white,
                            size: 22,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1, thickness: 1, color: Color(0xff3a164b)),
        SizedBox(
          height: oneChance ? 50 : 40,
          child: LayoutBuilder(
            builder: (context, size) {
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minWidth: size.maxWidth - 18),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _HomeTab(
                        label: mode == 'following'
                            ? 'Following'
                            : homeSelected && category.isNotEmpty
                            ? (categories[category] ?? 'For You')
                            : 'For You',
                        icon: Icons.expand_more,
                        trailing: true,
                        selected: homeSelected,
                        onTap: feedMenu,
                        narrow: narrow,
                      ),
                      _HomeTab(
                        label: 'Trending',
                        icon: oneChance
                            ? Icons.trending_up
                            : Icons.local_fire_department_outlined,
                        selected: mode == 'trending',
                        onTap: trending,
                        narrow: narrow,
                      ),
                      if (oneChance)
                        _HomeTab(
                          label: 'One Chance',
                          icon: Icons.auto_awesome_outlined,
                          selected: true,
                          onTap: () {},
                          narrow: narrow,
                        ),
                      _HomeTab(
                        label: 'Entertainment',
                        icon: Icons.movie_creation_outlined,
                        selected:
                            category == 'entertainment' && mode != 'trending',
                        onTap: entertainment,
                        narrow: narrow,
                      ),
                      if (!oneChance)
                        _HomeTab(
                          label: 'Jobs',
                          icon: Icons.work_outline,
                          selected: jobsSelected,
                          onTap: jobs,
                          narrow: narrow,
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _HomeTab extends StatelessWidget {
  const _HomeTab({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    required this.narrow,
    this.trailing = false,
  });
  final String label;
  final IconData icon;
  final bool selected, narrow, trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Text(
      label,
      style: TextStyle(fontSize: narrow ? 12 : 13, fontWeight: FontWeight.w700),
    );
    final marker = Icon(icon, size: narrow ? 16 : 17);
    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(25),
        child: AnimatedContainer(
          duration: _homeMotion(context),
          height: 35,
          padding: EdgeInsets.symmetric(horizontal: narrow ? 7 : 9),
          decoration: BoxDecoration(
            gradient: selected
                ? const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color(0xff772046),
                      Color(0xff2f0a3a),
                      Color(0xff6d0870),
                    ],
                  )
                : null,
            borderRadius: BorderRadius.circular(25),
            border: Border.all(
              color: selected ? const Color(0xffff6486) : Colors.transparent,
              width: 1.5,
            ),
            boxShadow: selected
                ? const [
                    BoxShadow(color: Color(0x73ef2689), blurRadius: 9),
                    BoxShadow(
                      color: Color(0x56ff9f45),
                      blurRadius: 5,
                      offset: Offset(-2, 1),
                    ),
                  ]
                : [],
          ),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: trailing
                  ? [text, const SizedBox(width: 4), marker]
                  : [marker, const SizedBox(width: 4), text],
            ),
          ),
        ),
      ),
    );
  }
}

class _HomeRound extends StatelessWidget {
  const _HomeRound({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: label,
    onPressed: onTap,
    iconSize: 23,
    padding: EdgeInsets.zero,
    style: IconButton.styleFrom(
      backgroundColor: const Color(0xb5211a27),
      foregroundColor: Colors.white,
      disabledBackgroundColor: const Color(0x80211a27),
      minimumSize: const Size.square(43),
    ),
    icon: Icon(icon),
  );
}

class _HomeHd extends StatelessWidget {
  const _HomeHd();
  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: const Color(0xaa161825),
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: Colors.white38),
    ),
    child: const Padding(
      padding: EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      child: Text(
        'HD',
        style: TextStyle(
          color: Colors.white,
          fontSize: 13,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
  );
}

class _HomeRailAction extends StatelessWidget {
  const _HomeRailAction({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.compact,
    required this.selected,
    required this.color,
    this.value,
    this.valueLabel,
    this.enabled = true,
    this.glyph,
    this.details,
    this.referenceStyle = false,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool compact, selected, enabled;
  final Color color;
  final String? value, valueLabel;
  final Widget? glyph, details;
  final bool referenceStyle;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: label,
    value: [value, valueLabel].nonNulls.join(' '),
    enabled: enabled,
    onTap: enabled ? onTap : null,
    child: ExcludeSemantics(
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: EdgeInsets.only(bottom: compact ? 1 : 3),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: referenceStyle ? 47 : 44,
                height: referenceStyle
                    ? (compact ? 40 : 46)
                    : (value == null ? 44 : 36),
                child: Center(
                  child: AnimatedScale(
                    scale: selected && (label == 'Save' || label == 'Vote')
                        ? 1.07
                        : 1,
                    duration: _homeMotion(context),
                    child: AnimatedContainer(
                      duration: _homeMotion(context),
                      width: referenceStyle
                          ? (compact ? 40 : 46)
                          : (compact ? 29 : 31),
                      height: referenceStyle
                          ? (compact ? 40 : 46)
                          : (compact ? 29 : 31),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: referenceStyle
                            ? (label == 'Viral progress'
                                  ? const Color(0xa8753026)
                                  : const Color(0xb2201721))
                            : const Color(0xa2190d24),
                        gradient: label == 'Chat'
                            ? referenceStyle
                                  ? _homeAccent
                                  : const LinearGradient(
                                      colors: [
                                        Color(0xff822452),
                                        Color(0xff501697),
                                      ],
                                    )
                            : null,
                        border: Border.all(
                          color: selected
                              ? const Color(0xe9e47daf)
                              : const Color(0x14ffffff),
                        ),
                        boxShadow: selected
                            ? const [
                                BoxShadow(
                                  color: Color(0x80ed4b90),
                                  blurRadius: 6,
                                  offset: Offset(1, 2),
                                ),
                              ]
                            : [],
                      ),
                      child:
                          glyph ??
                          Icon(
                            icon,
                            size: referenceStyle
                                ? (compact ? 22 : 25)
                                : (compact ? 18 : 20),
                            color: color,
                          ),
                    ),
                  ),
                ),
              ),
              if (details != null) details!,
              if (value != null)
                Text(
                  value!,
                  softWrap: false,
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                    height: 1.04,
                    fontFeatures: const [FontFeature.tabularFigures()],
                    shadows: const [Shadow(color: Colors.black, blurRadius: 5)],
                  ),
                ),
              if (valueLabel != null)
                Text(
                  valueLabel!,
                  maxLines: 1,
                  style: TextStyle(fontSize: 9, height: 1.2, color: color),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _RailProgressLine extends StatelessWidget {
  const _RailProgressLine(this.icon, this.value);
  final IconData icon;
  final String value;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 10, color: Colors.white),
      const SizedBox(width: 2),
      Flexible(
        child: Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 10,
            shadows: [Shadow(color: Colors.black, blurRadius: 5)],
          ),
        ),
      ),
    ],
  );
}

class _HomeRespect extends StatelessWidget {
  const _HomeRespect({required this.following, required this.onTap});
  final bool following;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: following,
    label: following ? 'Respecting' : 'Respect',
    onTap: onTap,
    child: ExcludeSemantics(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: SizedBox(
          height: 44,
          child: Center(
            child: _HomeRim(
              radius: 12,
              stroke: 1.25,
              edge: const LinearGradient(
                colors: [Color(0xffff82e0), Color(0xffa91eff)],
              ),
              fill: const LinearGradient(
                colors: [Color(0xff27253b), Color(0xff20142d)],
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 6),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AnimatedSwitcher(
                        duration: _homeMotion(context),
                        child: Icon(
                          following
                              ? Icons.verified_outlined
                              : Icons.favorite_border_rounded,
                          key: ValueKey(following),
                          size: 15,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        following ? 'Respecting' : 'Respect',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 11,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class _HomeProgress extends StatelessWidget {
  const _HomeProgress({required this.video});
  final VideoPlayerController video;
  @override
  Widget build(BuildContext context) =>
      ValueListenableBuilder<VideoPlayerValue>(
        valueListenable: video,
        builder: (_, state, _) {
          final duration = state.duration.inMilliseconds;
          final progress = duration == 0
              ? 0.0
              : (state.position.inMilliseconds / duration).clamp(0.0, 1.0);
          return LayoutBuilder(
            builder: (_, box) {
              void seek(double x) => unawaited(
                video.seekTo(
                  Duration(
                    milliseconds:
                        ((x / box.maxWidth).clamp(0.0, 1.0) * duration).round(),
                  ),
                ),
              );
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: duration == 0
                    ? null
                    : (event) => seek(event.localPosition.dx),
                onHorizontalDragEnd: duration == 0
                    ? null
                    : (event) => seek(event.localPosition.dx),
                child: SizedBox(
                  height: 13,
                  child: Align(
                    alignment: Alignment.bottomCenter,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: ColoredBox(
                        color: const Color(0x80aa9ab1),
                        child: SizedBox(
                          height: 3,
                          width: box.maxWidth,
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: FractionallySizedBox(
                              widthFactor: progress,
                              child: const DecoratedBox(
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: [
                                      Color(0xffffa043),
                                      Color(0xffff64af),
                                      Color(0xffe6b8ff),
                                    ],
                                  ),
                                ),
                                child: SizedBox.expand(),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          );
        },
      );
}

class _HomeLoading extends StatelessWidget {
  const _HomeLoading();
  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ClipOval(
          child: Image.asset('assets/home-flame.png', width: 34, height: 34),
        ),
        const SizedBox(height: 9),
        const SizedBox(
          width: 37,
          child: LinearProgressIndicator(
            minHeight: 2,
            color: Color(0xfff63b9d),
          ),
        ),
      ],
    ),
  );
}

class _HomeNavigation extends StatelessWidget {
  const _HomeNavigation({
    required this.onSelect,
    required this.active,
    this.showGames = false,
  });
  final ValueChanged<int> onSelect;
  final int active;
  final bool showGames;
  static const _labels = [
    'Home',
    'Discover',
    'Create',
    'One Chance',
    'Profile',
    'Games',
  ];
  static const _icons = [
    Icons.home_outlined,
    Icons.explore_outlined,
    Icons.add,
    Icons.auto_awesome_outlined,
    Icons.person_outline,
    Icons.sports_esports_outlined,
  ];
  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(8, 5, 8, 5),
      child: _HomeRim(
        radius: 36,
        stroke: 1.2,
        edge: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xffb46067),
            Color(0xff301c40),
            Color(0xff6d176b),
            Color(0xffff996b),
          ],
        ),
        fill: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xff22112b), Color(0xff130819), Color(0xff220c28)],
        ),
        shadows: const [
          BoxShadow(
            color: Color(0x35f044a1),
            blurRadius: 11,
            offset: Offset(1, 3),
          ),
        ],
        child: SizedBox(
          height: 56,
          child: Row(
            children: [
              for (
                var i = 0;
                i < (showGames ? _labels.length : _labels.length - 1);
                i++
              )
                Expanded(
                  child: Semantics(
                    button: true,
                    selected: i == active,
                    label: _labels[i],
                    onTap: () => onSelect(i),
                    child: ExcludeSemantics(
                      child: InkWell(
                        onTap: () => onSelect(i),
                        borderRadius: BorderRadius.circular(28),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            AnimatedContainer(
                              duration: _homeMotion(context),
                              width: i == 2 ? 47 : 42,
                              height: i == 2 ? 47 : 31,
                              decoration: BoxDecoration(
                                gradient: i == active || i == 2
                                    ? _homeAccent
                                    : null,
                                borderRadius: BorderRadius.circular(
                                  i == 2 ? 25 : 13,
                                ),
                                border: i == active || i == 2
                                    ? Border.all(color: const Color(0x99ffa1ce))
                                    : null,
                                boxShadow: i == active || i == 2
                                    ? const [
                                        BoxShadow(
                                          color: Color(0xbcb622ed),
                                          blurRadius: 10,
                                          offset: Offset(2, 1),
                                        ),
                                        BoxShadow(
                                          color: Color(0x70ff486d),
                                          blurRadius: 7,
                                          offset: Offset(-2, 0),
                                        ),
                                      ]
                                    : [],
                              ),
                              child: Icon(
                                _icons[i],
                                color: Colors.white,
                                size: i == 2 ? 34 : 23,
                              ),
                            ),
                            if (i != 2)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text(
                                  _labels[i],
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: i == active
                                        ? Colors.white
                                        : _homeMuted,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 10.5,
                                  ),
                                ),
                              ),
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
    ),
  );
}
