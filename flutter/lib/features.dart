part of 'main.dart';

class _DataPage extends StatelessWidget {
  const _DataPage({
    required this.title,
    required this.fetch,
    required this.titleKey,
    this.subtitleKey,
    this.onTap,
  });
  final String title;
  final Future<Object?> Function() fetch;
  final String titleKey;
  final String? subtitleKey;
  final void Function(Data)? onTap;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(title)),
    body: _Load(
      fetch: fetch,
      render: (value, reload) => _dataList(
        records(value),
        titleKey,
        subtitleKey: subtitleKey,
        onTap: onTap,
        reload: reload,
      ),
    ),
  );
}

Widget _dataList(
  List<Data> rows,
  String titleKey, {
  String? subtitleKey,
  void Function(Data)? onTap,
  VoidCallback? reload,
}) {
  final content = ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    children: [
      if (rows.isEmpty)
        const Padding(
          padding: EdgeInsets.all(24),
          child: Center(child: Text('Nothing here yet')),
        ),
      for (final row in rows)
        ListTile(
          title: Text(row.string(titleKey)),
          subtitle: subtitleKey == null ? null : Text(row.string(subtitleKey)),
          trailing: onTap == null ? null : const Icon(Icons.chevron_right),
          onTap: onTap == null ? null : () => onTap(row),
        ),
    ],
  );
  return reload == null
      ? content
      : RefreshIndicator(onRefresh: () async => reload(), child: content);
}

class _Discover extends StatefulWidget {
  const _Discover({required this.shell});
  final _ShellState shell;
  @override
  State<_Discover> createState() => _DiscoverState();
}

class _DiscoverState extends State<_Discover> {
  String query = '';
  String category = '';

  @override
  Widget build(BuildContext context) => SafeArea(
    bottom: false,
    child: Column(
      children: [
        const SizedBox(height: 8),
        const _Brand(),
        Padding(
          padding: const EdgeInsets.all(12),
          child: SearchBar(
            leading: const Icon(Icons.search),
            hintText: 'Search OJASSS',
            textInputAction: TextInputAction.search,
            onSubmitted: (value) => setState(() => query = value.trim()),
          ),
        ),
        SizedBox(
          height: 42,
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            scrollDirection: Axis.horizontal,
            children: [
              for (final choice in {'': 'All', ...categories}.entries)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    label: Text(choice.value),
                    selected: category == choice.key,
                    onSelected: (_) => setState(() => category = choice.key),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: _Load(
            key: ValueKey('$query/$category'),
            fetch: () => Future.wait([
              widget.shell.api
                  .rpc(query.isEmpty ? 'trending_posts' : 'search_posts', {
                    'p_q': query,
                    'p_category': category.isEmpty ? null : category,
                    'p_limit': 60,
                  }),
              if (query.isNotEmpty)
                widget.shell.api.rpc('search_users', {
                  'p_q': query,
                  'p_limit': 20,
                }),
            ]),
            render: (value, _) {
              final result = value as List<Object?>;
              return ListView(
                children: [
                  if (result.length > 1)
                    for (final person in records(result[1]))
                      ListTile(
                        leading: _Avatar(
                          widget.shell.api,
                          person.string('avatar_path'),
                          person.string('display_name'),
                        ),
                        title: Text(person.string('display_name')),
                        subtitle: Text('@${person.string('username')}'),
                        onTap: () =>
                            widget.shell.openProfile(person.string('username')),
                      ),
                  _Cards(items: records(result.first), shell: widget.shell),
                ],
              );
            },
          ),
        ),
      ],
    ),
  );
}

class _Comments extends StatefulWidget {
  const _Comments({required this.shell, required this.id});
  final _ShellState shell;
  final String id;
  @override
  State<_Comments> createState() => _CommentsState();
}

class _CommentsState extends State<_Comments> {
  final input = TextEditingController();
  bool busy = false;
  int revision = 0;
  Data? parent;
  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  Future<void> send() async {
    final body = input.text.trim();
    if (body.isEmpty ||
        busy ||
        !await widget.shell.requireAccount() ||
        !mounted)
      return;
    setState(() => busy = true);
    try {
      await widget.shell.api.rpc('add_comment', {
        'p_post_id': widget.id,
        'p_body': body,
        'p_parent_id': parent?['id'],
        'p_language': 'en',
      });
      if (!mounted) return;
      input.clear();
      setState(() {
        revision++;
        parent = null;
      });
    } catch (error) {
      if (mounted) _notice(context, error);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Speak')),
    body: SafeArea(
      child: Column(
        children: [
          Expanded(
            child: _Load(
              key: ValueKey('$revision/${parent?['id']}'),
              fetch: () => widget.shell.api.rpc('list_comments', {
                'p_post_id': widget.id,
                'p_parent_id': parent?['id'],
                'p_limit': 60,
              }),
              render: (value, reload) {
                final comments = records(value);
                return ListView(
                  children: [
                    if (comments.isEmpty)
                      const ListTile(title: Text('Be the first to speak')),
                    for (final item in comments)
                      ListTile(
                        title: Text(item.string('body')),
                        subtitle: Text(
                          item.string(
                            'author_username',
                            item.string('username'),
                          ),
                        ),
                        onTap: parent == null
                            ? () => setState(() => parent = item)
                            : null,
                        trailing: IconButton(
                          tooltip: 'React to comment',
                          icon: const Icon(
                            Icons.local_fire_department_outlined,
                          ),
                          onPressed: () async {
                            if (!await widget.shell.requireAccount()) return;
                            try {
                              await widget.shell.api.rpc(
                                'toggle_comment_fire',
                                {'p_comment_id': item.string('id')},
                              );
                              if (mounted) reload();
                            } catch (error) {
                              if (mounted) _notice(context, error);
                            }
                          },
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
          if (parent != null)
            ListTile(
              title: Text('Replying to ${parent!.string('body')}', maxLines: 1),
              trailing: IconButton(
                onPressed: () => setState(() => parent = null),
                icon: const Icon(Icons.close),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: input,
                    decoration: const InputDecoration(
                      hintText: 'Write a comment',
                    ),
                    onSubmitted: (_) => send(),
                  ),
                ),
                IconButton(
                  tooltip: 'Send',
                  onPressed: busy ? null : send,
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

Future<void> _messageUser(_ShellState shell, String id, String title) async {
  if (!await shell.requireAccount()) return;
  try {
    final result = await shell.api.rpc('get_or_create_conversation', {
      'p_other': id,
    });
    if (shell.mounted && result is String)
      await shell.push<void>(_Chat(shell: shell, id: result, title: title));
  } catch (error) {
    if (shell.mounted) _notice(shell.context, error);
  }
}

class _Inbox extends StatelessWidget {
  const _Inbox({required this.shell});
  final _ShellState shell;

  @override
  Widget build(BuildContext context) => _DataPage(
    title: 'Messages',
    fetch: () async {
      final list = records(
        await shell.api.rpc('list_conversations', {'p_limit': 60}),
      );
      return list.map((item) {
        final person = object(item['other']);
        final last = object(item['last_message']);
        return {
          ...item,
          'label': item.string(
            'other_display_name',
            person.string(
              'display_name',
              person.string('username', 'Conversation'),
            ),
          ),
          'summary': last.string('body', item.string('last_message_preview')),
        };
      }).toList();
    },
    titleKey: 'label',
    subtitleKey: 'summary',
    onTap: (item) => shell.push<void>(
      _Chat(
        shell: shell,
        id: item.string('id', item.string('conversation_id')),
        title: item.string('label'),
      ),
    ),
  );
}

class _Chat extends StatefulWidget {
  const _Chat({required this.shell, required this.id, required this.title});
  final _ShellState shell;
  final String id;
  final String title;
  @override
  State<_Chat> createState() => _ChatState();
}

class _ChatState extends State<_Chat> {
  final input = TextEditingController();
  List<Data> messages = [];
  bool busy = false;
  bool loading = true;
  bool reading = false;
  Object? failure;
  Timer? refresh;
  OjasssApi get api => widget.shell.api;
  @override
  void initState() {
    super.initState();
    unawaited(_load());
    refresh = Timer.periodic(const Duration(seconds: 8), (_) => _load());
  }

  Future<void> _load() async {
    if (reading) return;
    reading = true;
    try {
      final id = Uri.encodeQueryComponent(widget.id);
      final result = records(
        await api.request(
          '/rest/v1/messages?conversation_id=eq.$id&order=created_at.desc&limit=60',
        ),
      );
      if (mounted)
        setState(() {
          messages = result;
          failure = null;
        });
      unawaited(
        api
            .rpc('mark_conversation_read', {'p_conversation_id': widget.id})
            .then<void>((_) {}, onError: (_) {}),
      );
    } catch (error) {
      if (mounted) setState(() => failure = error);
    } finally {
      reading = false;
      if (mounted && loading) setState(() => loading = false);
    }
  }

  Future<void> _send() async {
    final value = input.text.trim();
    if (value.isEmpty || busy) return;
    setState(() => busy = true);
    try {
      await api.rpc('send_message', {
        'p_conversation_id': widget.id,
        'p_body': value,
      });
      if (!mounted) return;
      input.clear();
      await _load();
    } catch (error) {
      if (mounted) _notice(context, error);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    refresh?.cancel();
    input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.title)),
    body: SafeArea(
      child: Column(
        children: [
          Expanded(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : failure != null && messages.isEmpty
                ? Center(
                    child: TextButton(
                      onPressed: _load,
                      child: const Text('Retry messages'),
                    ),
                  )
                : messages.isEmpty
                ? const Center(child: Text('Start the conversation'))
                : ListView.builder(
                    reverse: true,
                    itemCount: messages.length,
                    itemBuilder: (context, i) {
                      final item = messages[i];
                      final own =
                          item.string('sender_id') ==
                          widget.shell.me.string('id');
                      return Align(
                        alignment: own
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          padding: const EdgeInsets.all(10),
                          constraints: BoxConstraints(
                            maxWidth: MediaQuery.sizeOf(context).width * .8,
                          ),
                          decoration: _decoration(
                            color: own ? const Color(0xff3a234b) : _panel,
                          ),
                          child: Text(item.string('body')),
                        ),
                      );
                    },
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: input,
                    decoration: const InputDecoration(hintText: 'Message'),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                IconButton(
                  onPressed: busy ? null : _send,
                  tooltip: 'Send',
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _Notifications extends StatelessWidget {
  const _Notifications({required this.shell});
  final _ShellState shell;
  @override
  Widget build(BuildContext context) => _DataPage(
    title: 'Notifications',
    fetch: () => shell.api.rpc('list_notifications', {'p_limit': 60}),
    titleKey: 'title',
    subtitleKey: 'body',
    onTap: (item) async {
      try {
        await shell.api.rpc('mark_notifications_read', {
          'p_ids': [item.string('id')],
        });
        final path = item.string('link', item.string('href'));
        final uri = Uri.tryParse(path);
        if (uri == null || !shell.mounted) return;
        final parts = uri.pathSegments;
        if (parts.length == 2 && parts.first == 'post')
          shell.openPost(parts.last);
        if (parts.length == 2 && parts.first == 'profile')
          shell.openProfile(parts.last);
      } catch (error) {
        if (context.mounted) _notice(context, error);
      }
    },
  );
}

class _Updates extends StatelessWidget {
  const _Updates({required this.shell});
  final _ShellState shell;
  @override
  Widget build(BuildContext context) => _DataPage(
    title: 'Announcements',
    fetch: () => shell.api.rpc('active_announcements'),
    titleKey: 'title',
    subtitleKey: 'message',
    onTap: (item) {
      final link = item.string('cta_url');
      if (link.startsWith('/post/')) {
        shell.openPost(link.split('/').last);
      } else if (link.startsWith('/profile/')) {
        shell.openProfile(link.split('/').last);
      } else {
        _external(context, link);
      }
    },
  );
}

class _Episodes extends StatelessWidget {
  const _Episodes({required this.shell, required this.postId});
  final _ShellState shell;
  final String postId;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Episodes')),
    body: _Load(
      fetch: () => shell.api.rpc('series_details', {'p_post_id': postId}),
      render: (value, reload) {
        final series = object(value);
        return ListView(
          children: [
            ListTile(title: Text(series.string('title'))),
            for (final item in records(series['episodes']))
              ListTile(
                leading: Icon(
                  item.flag('locked')
                      ? Icons.lock_outline
                      : Icons.play_circle_outline,
                ),
                title: Text('Episode ${item.number('episode_number')}'),
                subtitle: Text(
                  item.string(
                    'lock_reason',
                    item.string('title', item.string('caption')),
                  ),
                ),
                onTap: item.flag('locked')
                    ? () async {
                        if (!await shell.requireAccount() || !context.mounted)
                          return;
                        if (!await _confirm(
                          context,
                          item.string('lock_reason', 'Register your interest?'),
                        ))
                          return;
                        try {
                          await shell.api.rpc('toggle_episode_interest', {
                            'p_post_id': item.string('id'),
                          });
                          if (context.mounted) reload();
                        } catch (error) {
                          if (context.mounted) _notice(context, error);
                        }
                      }
                    : () => shell.openPost(item.string('id')),
              ),
          ],
        );
      },
    ),
  );
}

class _Status extends StatefulWidget {
  const _Status({required this.shell, required this.status});
  final _ShellState shell;
  final Data status;
  @override
  State<_Status> createState() => _StatusState();
}

class _StatusState extends State<_Status> {
  VideoPlayerController? player;
  Object? error;
  late final Data item = {...widget.status};
  @override
  void initState() {
    super.initState();
    if (item.string('mime_type').startsWith('video/')) unawaited(_start());
  }

  Future<void> _start() async {
    final video = VideoPlayerController.networkUrl(
      widget.shell.api.media(item.string('media_path')),
      httpHeaders: widget.shell.api.headers,
    );
    player = video;
    try {
      await video.initialize();
      if (!mounted) return;
      setState(() {});
      await video.play();
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  @override
  void dispose() {
    player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final person = object(item['profile']);
    final video = player;
    return Scaffold(
      appBar: AppBar(title: Text(person.string('display_name', 'Status'))),
      body: Center(
        child: error != null
            ? Text(error.toString())
            : video == null
            ? Image.network(
                widget.shell.api.media(item.string('media_path')).toString(),
              )
            : video.value.isInitialized
            ? AspectRatio(
                aspectRatio: video.value.aspectRatio,
                child: VideoPlayer(video),
              )
            : const CircularProgressIndicator(),
      ),
      bottomNavigationBar: SafeArea(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (item.string('caption').isNotEmpty)
              Flexible(child: Text(item.string('caption'))),
            IconButton(
              tooltip: 'Fire',
              onPressed: () async {
                if (!await widget.shell.requireAccount()) return;
                try {
                  final result = object(
                    await widget.shell.api.rpc('toggle_status_hot', {
                      'p_status_id': item.string('id'),
                    }),
                  );
                  if (mounted) setState(() => item.addAll(result));
                } catch (error) {
                  if (mounted) _notice(context, error);
                }
              },
              icon: Icon(
                Icons.local_fire_department,
                color: item.flag('my_hot') ? Colors.orangeAccent : null,
              ),
            ),
            Text('${item.number('hot_count')}'),
            IconButton(
              tooltip: 'Share',
              onPressed: () => SharePlus.instance.share(
                ShareParams(
                  uri: Uri.parse('$site/profile/${person.string('username')}'),
                ),
              ),
              icon: const Icon(Icons.share_outlined),
            ),
          ],
        ),
      ),
    );
  }
}
