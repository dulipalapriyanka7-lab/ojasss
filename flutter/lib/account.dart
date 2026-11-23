part of 'main.dart';

class _Field {
  const _Field(
    this.label, {
    this.initial = '',
    this.required = true,
    this.secret = false,
    this.choices,
  });
  final String label;
  final String initial;
  final bool required;
  final bool secret;
  final Map<String, String>? choices;
}

class _FormPage extends StatefulWidget {
  const _FormPage({
    required this.title,
    required this.fields,
    required this.submit,
    this.button = 'Save',
    this.resend,
  });
  final String title;
  final List<_Field> fields;
  final Future<Object?> Function(List<String>) submit;
  final String button;
  final Future<void> Function()? resend;
  @override
  State<_FormPage> createState() => _FormPageState();
}

class _FormPageState extends State<_FormPage> {
  late final controllers = [
    for (final field in widget.fields)
      TextEditingController(text: field.initial),
  ];
  final form = GlobalKey<FormState>();
  bool busy = false;
  bool sendingCode = false;
  final visiblePasswords = <int>{};
  int secondsUntilResend = 0;
  Timer? resendTimer;
  String? error;
  String? status;

  @override
  void initState() {
    super.initState();
    if (widget.resend != null) _startCooldown();
  }

  void _startCooldown() {
    resendTimer?.cancel();
    secondsUntilResend = 60;
    resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      setState(() => secondsUntilResend--);
      if (secondsUntilResend == 0) timer.cancel();
    });
  }

  Future<void> _resend() async {
    if (busy || sendingCode || secondsUntilResend > 0) return;
    setState(() {
      sendingCode = true;
      status = null;
      error = null;
    });
    try {
      await widget.resend!();
      if (!mounted) return;
      setState(() {
        status = 'If this email can receive a code, check your inbox.';
        _startCooldown();
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => sendingCode = false);
    }
  }

  @override
  void dispose() {
    resendTimer?.cancel();
    for (final controller in controllers) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (busy || sendingCode || !form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await widget.submit(
        List.generate(controllers.length, (i) {
          final value = controllers[i].text;
          return widget.fields[i].secret ? value : value.trim();
        }),
      );
      if (mounted) Navigator.pop(context, result ?? true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.title)),
    body: Form(
      key: form,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          for (var i = 0; i < widget.fields.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: widget.fields[i].choices == null
                  ? TextFormField(
                      controller: controllers[i],
                      obscureText:
                          widget.fields[i].secret &&
                          !visiblePasswords.contains(i),
                      keyboardType: widget.fields[i].label == 'Email'
                          ? TextInputType.emailAddress
                          : widget.fields[i].label == 'Email code'
                          ? TextInputType.number
                          : null,
                      autocorrect:
                          !widget.fields[i].secret &&
                          widget.fields[i].label != 'Email',
                      enabled: !busy,
                      decoration: InputDecoration(
                        labelText: widget.fields[i].label,
                        suffixIcon: widget.fields[i].secret
                            ? IconButton(
                                tooltip: visiblePasswords.contains(i)
                                    ? 'Hide password'
                                    : 'Show password',
                                onPressed: busy
                                    ? null
                                    : () => setState(() {
                                        if (!visiblePasswords.remove(i))
                                          visiblePasswords.add(i);
                                      }),
                                icon: Icon(
                                  visiblePasswords.contains(i)
                                      ? Icons.visibility_off_outlined
                                      : Icons.visibility_outlined,
                                ),
                              )
                            : null,
                      ),
                      validator: (value) =>
                          widget.fields[i].required &&
                              (value?.trim().isEmpty ?? true)
                          ? 'Required'
                          : null,
                    )
                  : DropdownButtonFormField<String>(
                      initialValue:
                          widget.fields[i].choices!.containsKey(
                            controllers[i].text,
                          )
                          ? controllers[i].text
                          : null,
                      decoration: InputDecoration(
                        labelText: widget.fields[i].label,
                      ),
                      items: widget.fields[i].choices!.entries
                          .map(
                            (e) => DropdownMenuItem(
                              value: e.key,
                              child: Text(e.value),
                            ),
                          )
                          .toList(),
                      onChanged: busy
                          ? null
                          : (value) => controllers[i].text = value ?? '',
                      validator: (value) =>
                          value == null && widget.fields[i].required
                          ? 'Required'
                          : null,
                    ),
            ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                error!,
                style: const TextStyle(color: Colors.orangeAccent),
              ),
            ),
          FilledButton(
            onPressed: busy || sendingCode ? null : _submit,
            child: Text(busy ? 'Please wait…' : widget.button),
          ),
          if (widget.resend != null) ...[
            TextButton(
              onPressed: busy || sendingCode || secondsUntilResend > 0
                  ? null
                  : _resend,
              child: Text(
                sendingCode
                    ? 'Requesting code…'
                    : secondsUntilResend > 0
                    ? 'Resend in ${secondsUntilResend}s'
                    : 'Resend code',
              ),
            ),
            if (status != null)
              Semantics(liveRegion: true, child: Text(status!)),
          ],
        ],
      ),
    ),
  );
}

class _AuthPage extends StatefulWidget {
  const _AuthPage({required this.api});
  final OjasssApi api;

  @override
  State<_AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<_AuthPage> {
  OjasssApi get api => widget.api;

  Future<void> _flow(BuildContext context, String action) async {
    final create = action == 'signup';
    final password = action == 'password';
    final recovery = action == 'recover';
    final start = await Navigator.of(context).push<Object>(
      MaterialPageRoute(
        builder: (_) => _FormPage(
          title: create
              ? 'Create account'
              : recovery
              ? 'Reset password'
              : password
              ? 'Sign in'
              : 'Email a sign-in code',
          fields: [
            if (create) const _Field('Display name'),
            const _Field('Email'),
            if (create || password) const _Field('Password', secret: true),
          ],
          button: password ? 'Sign in' : 'Continue',
          submit: (values) async {
            final email = values[create ? 1 : 0];
            await api.auth(password ? 'token?grant_type=password' : action, {
              'email': email,
              if (create || password) 'password': values.last,
              if (create) 'data': {'full_name': values.first},
              if (action == 'otp') 'create_user': false,
            });
            return email;
          },
        ),
      ),
    );
    if (!context.mounted || start is! String) return;
    if (!password) {
      final verified = await Navigator.of(context).push<Object>(
        MaterialPageRoute(
          builder: (_) => _FormPage(
            title: 'Verify $start',
            fields: const [_Field('Email code')],
            button: 'Verify',
            resend: () async {
              await api.auth(
                create
                    ? 'resend'
                    : recovery
                    ? 'recover'
                    : 'otp',
                {'email': start},
              );
            },
            submit: (values) => api.auth('verify', {
              'email': start,
              'token': values.first,
              'type': create
                  ? 'signup'
                  : recovery
                  ? 'recovery'
                  : 'email',
            }),
          ),
        ),
      );
      if (!context.mounted || verified == null) return;
      if (recovery) {
        final changed = await Navigator.of(context).push<Object>(
          MaterialPageRoute(
            builder: (_) => _FormPage(
              title: 'Choose a new password',
              fields: const [_Field('New password', secret: true)],
              submit: (values) => api.auth('user', {'password': values.first}),
            ),
          ),
        );
        if (!context.mounted || changed == null) return;
      }
    }
    try {
      final me = object(await api.rpc('get_me'));
      if (me.string('id').isEmpty) {
        throw const ApiError(
          'Sign-in succeeded, but your profile could not be loaded. Try again.',
          502,
        );
      }
      if (context.mounted) Navigator.pop(context, me);
    } catch (error) {
      if (context.mounted) _notice(context, error);
    }
  }

  @override
  Widget build(BuildContext context) =>
      _PremiumLogin(api: api, onFlow: (action) => _flow(context, action));
}

class _EditProfile extends StatelessWidget {
  const _EditProfile({
    required this.api,
    required this.profile,
    required this.onboarding,
  });
  final OjasssApi api;
  final Data profile;
  final bool onboarding;

  @override
  Widget build(BuildContext context) => _FormPage(
    title: onboarding ? 'Set up your profile' : 'Edit profile',
    fields: [
      _Field('Display name', initial: profile.string('display_name')),
      _Field('Username', initial: profile.string('username')),
      _Field('Bio', initial: profile.string('bio'), required: false),
      _Field('Phone', initial: profile.string('phone'), required: false),
      _Field('Address', initial: profile.string('address'), required: false),
      _Field(
        'Country code',
        initial: profile.string('country', 'IN'),
        required: onboarding,
      ),
      if (onboarding) const _Field('Referral code', required: false),
    ],
    submit: (values) =>
        api.rpc(onboarding ? 'complete_onboarding' : 'update_profile', {
          'p_display_name': values[0],
          'p_username': values[1],
          'p_bio': values[2],
          'p_phone': values[3],
          'p_address': values[4],
          'p_country': values[5].toUpperCase(),
          if (onboarding && values[6].isNotEmpty) 'p_referral_code': values[6],
        }),
  );
}

class _Profile extends StatefulWidget {
  const _Profile({
    super.key,
    required this.shell,
    this.handle,
    this.embedded = false,
  });
  final _ShellState shell;
  final String? handle;
  final bool embedded;
  @override
  State<_Profile> createState() => _ProfileState();
}

class _ProfileState extends State<_Profile> {
  int tab = 0;
  _ShellState get shell => widget.shell;
  OjasssApi get api => shell.api;

  @override
  Widget build(BuildContext context) {
    final content = widget.handle == null
        ? _render(shell.me)
        : _Load(
            fetch: () => api.rpc('get_profile', {'p_handle': widget.handle}),
            render: (value, _) => _render(object(value)),
          );
    final page = Column(
      children: [
        SizedBox(
          height: 52,
          child: Row(
            children: [
              if (!widget.embedded)
                const BackButton()
              else
                const SizedBox(width: 12),
              const _Brand(),
              const Spacer(),
              IconButton(
                tooltip: 'Announcements',
                onPressed: shell.openUpdates,
                icon: const Icon(Icons.campaign_outlined),
              ),
              IconButton(
                tooltip: 'Wallet',
                onPressed: () async {
                  if (await shell.requireAccount())
                    await shell.push<void>(_Wallet(shell: shell));
                },
                icon: const Icon(Icons.account_balance_wallet_outlined),
              ),
              IconButton(
                tooltip: 'Notifications',
                onPressed: () async {
                  if (await shell.requireAccount())
                    await shell.push<void>(_Notifications(shell: shell));
                },
                icon: const Icon(Icons.notifications_none),
              ),
            ],
          ),
        ),
        Expanded(child: content),
      ],
    );
    return widget.embedded
        ? SafeArea(bottom: false, child: page)
        : Scaffold(body: SafeArea(child: page));
  }

  Widget _render(Data profile) {
    final own = profile.string('id') == shell.me.string('id');
    final handle = profile.string('username');
    final name = profile.string('display_name', handle);
    final banner = shell.announcements.firstOrNull;
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      children: [
        if (banner != null)
          _Announcement(item: banner, onTap: shell.openUpdates),
        SizedBox(
          height: 76,
          child: _Load(
            fetch: () => api.rpc('list_statuses', {'p_limit': 30}),
            render: (value, reload) {
              final list = records(value);
              return ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
                scrollDirection: Axis.horizontal,
                separatorBuilder: (_, _) => const SizedBox(width: 12),
                itemCount: list.length + (own ? 1 : 0),
                itemBuilder: (context, index) {
                  if (own && index == 0)
                    return _story(Icons.add, 'Add Status', () async {
                      final added = await shell.push<bool>(
                        _UploadPage(shell: shell, status: true),
                      );
                      if (mounted && added == true) reload();
                    });
                  final item = list[index - (own ? 1 : 0)];
                  final person = object(item['profile']);
                  final label = item.string('user_id') == shell.me.string('id')
                      ? 'My Status'
                      : person.string('username');
                  return InkWell(
                    onTap: () =>
                        shell.push<void>(_Status(shell: shell, status: item)),
                    child: SizedBox(
                      width: 62,
                      child: Column(
                        children: [
                          _Avatar(
                            api,
                            person.string('avatar_path'),
                            label,
                            size: 46,
                            ring: true,
                          ),
                          const SizedBox(height: 3),
                          Flexible(
                            child: Text(
                              label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 10,
                                height: 1.15,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 11),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xff392440), Color(0xff24172e), _panel],
            ),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: _line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _Avatar(
                    api,
                    profile.string('avatar_path'),
                    name,
                    size: 56,
                    ring: true,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                name,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 19,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            if (profile.flag('is_verified'))
                              const Padding(
                                padding: EdgeInsets.only(left: 4),
                                child: Icon(
                                  Icons.verified,
                                  size: 16,
                                  color: Colors.lightBlueAccent,
                                ),
                              ),
                          ],
                        ),
                        Text(
                          '@$handle',
                          style: const TextStyle(color: _muted, fontSize: 13),
                        ),
                        if (profile.flag('has_viral_badge'))
                          const Text(
                            'VIRAL creator',
                            style: TextStyle(
                              color: _purple,
                              fontWeight: FontWeight.w700,
                              fontSize: 11,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              if (profile.string('bio').isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 9),
                  child: Text(profile.string('bio')),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        if (own)
          Row(
            children: [
              _action(
                Icons.edit_outlined,
                'Edit profile',
                () => shell.editProfile(),
              ),
              _action(Icons.emoji_events_outlined, 'One Chance', () {
                if (!widget.embedded) Navigator.pop(context);
                shell.select(3);
              }),
              _action(
                Icons.bookmark_border,
                'Saved',
                () => setState(() => tab = 3),
              ),
            ],
          )
        else
          Row(
            children: [
              _action(
                Icons.person_add_outlined,
                profile.flag('is_following') ? 'Respecting' : 'Respect',
                () async {
                  if (!await shell.requireAccount()) return;
                  try {
                    final result = object(
                      await api.rpc('toggle_follow', {
                        'p_user_id': profile.string('id'),
                      }),
                    );
                    if (mounted)
                      setState(() {
                        profile['is_following'] = result['following'];
                        profile['followers_count'] = result['followers_count'];
                      });
                  } catch (error) {
                    if (mounted) _notice(context, error);
                  }
                },
              ),
              _action(
                Icons.chat_bubble_outline,
                'Message',
                () => _messageUser(shell, profile.string('id'), name),
              ),
              _action(
                Icons.flag_outlined,
                'Report',
                () => _report(shell, 'user', profile.string('id')),
              ),
            ],
          ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 9),
          child: Row(
            children: [
              _stat(
                profile.number('posts_count'),
                'Posts',
                Icons.video_library_outlined,
                Colors.orangeAccent,
              ),
              _stat(
                profile.number('followers_count'),
                'Respected by',
                Icons.people_outline,
                Colors.pinkAccent,
                () => _following(profile.string('id'), 'followers'),
              ),
              _stat(
                profile.number('following_count'),
                'Respecting',
                Icons.verified_outlined,
                Colors.lightBlueAccent,
                () => _following(profile.string('id'), 'following'),
              ),
            ],
          ),
        ),
        if (profile.string('created_at').isNotEmpty)
          Row(
            children: [
              const Icon(
                Icons.calendar_today_outlined,
                color: _muted,
                size: 14,
              ),
              const SizedBox(width: 6),
              Text(
                'Joined ${profile.string('created_at').split('T').first}',
                style: const TextStyle(fontSize: 12, color: _muted),
              ),
            ],
          ),
        if (own)
          Padding(
            padding: const EdgeInsets.only(top: 9),
            child: _HomeRim(
              radius: 13,
              fill: const LinearGradient(
                colors: [Color(0xff4d235b), Color(0xff251b3c)],
              ),
              child: Material(
                color: Colors.transparent,
                child: ListTile(
                  dense: true,
                  leading: const Icon(
                    Icons.movie_edit,
                    color: Color(0xfff7a6e6),
                    size: 21,
                  ),
                  title: const Text(
                    'Edit Studio',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: const Text(
                    'Choose a video to edit',
                    style: TextStyle(color: _muted),
                  ),
                  trailing: const Icon(Icons.chevron_right, size: 20),
                  onTap: () => shell.openCreate(openEditor: true),
                ),
              ),
            ),
          ),
        if (own)
          Wrap(
            children: [
              TextButton.icon(
                onPressed: () => shell.push<void>(_Tasks(shell: shell)),
                icon: const Icon(Icons.checklist, size: 17),
                label: const Text('My tasks'),
              ),
              TextButton.icon(
                onPressed: () => shell.push<void>(_Inbox(shell: shell)),
                icon: const Icon(Icons.forum_outlined, size: 17),
                label: const Text('Chat'),
              ),
              TextButton.icon(
                onPressed: () => shell.push<void>(_Settings(shell: shell)),
                icon: const Icon(Icons.settings_outlined, size: 17),
                label: const Text('Settings'),
              ),
            ],
          ),
        Row(
          children: [
            for (var i = 0; i < (own ? 4 : 3); i++)
              Expanded(
                child: InkWell(
                  onTap: () => setState(() => tab = i),
                  child: Container(
                    height: 45,
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(
                          color: tab == i ? _purple : _line,
                          width: 2,
                        ),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          [
                            Icons.video_library_outlined,
                            Icons.image_outlined,
                            Icons.local_fire_department_outlined,
                            Icons.bookmark_outline,
                          ][i],
                          size: 15,
                          color: i == 2 ? Colors.pinkAccent : _muted,
                        ),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            ['Videos', 'Posters', 'Viral', 'Saved'][i],
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 11),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
        if (tab == 2 && shell.me.isNotEmpty)
          TextButton.icon(
            onPressed: () => shell.push<void>(
              _ViralTrendHistory(shell: shell, ownerId: profile.string('id')),
            ),
            icon: const Icon(Icons.history, size: 18),
            label: const Text('Viral Trend History'),
          ),
        _Load(
          key: ValueKey('${profile.string('id')}-$tab'),
          fetch: () => tab == 3
              ? api.rpc('my_bookmarks', {'p_limit': 60})
              : api.rpc('user_posts', {
                  'p_user_id': profile.string('id'),
                  'p_kind': tab == 1 ? 'poster' : 'video',
                  'p_viral_only': tab == 2,
                  'p_limit': 60,
                }),
          render: (value, _) => _Cards(items: records(value), shell: shell),
        ),
      ],
    );
  }

  Future<void> _following(String id, String direction) => shell.push<void>(
    _DataPage(
      title: direction == 'following' ? 'Respecting' : 'Respected by',
      fetch: () =>
          api.rpc('list_follows', {'p_user_id': id, 'p_direction': direction}),
      titleKey: 'display_name',
      subtitleKey: 'username',
      onTap: (row) => shell.openProfile(row.string('username')),
    ),
  );

  Widget _story(IconData icon, String label, VoidCallback tap) => InkWell(
    onTap: tap,
    child: SizedBox(
      width: 62,
      child: Column(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: _purple, width: 2),
            ),
            child: Icon(icon),
          ),
          const SizedBox(height: 3),
          Flexible(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                label,
                style: const TextStyle(fontSize: 10, height: 1.15),
              ),
            ),
          ),
        ],
      ),
    ),
  );

  Widget _action(IconData icon, String label, VoidCallback tap) => Expanded(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 3),
      child: InkWell(
        onTap: tap,
        child: Container(
          height: 44,
          decoration: _decoration(radius: 11),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 15, color: _purple),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );

  Widget _stat(
    int count,
    String label,
    IconData icon,
    Color color, [
    VoidCallback? tap,
  ]) => Expanded(
    child: InkWell(
      onTap: tap,
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 5),
              Text(
                '$count',
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 17,
                ),
              ),
            ],
          ),
          Text(label, style: const TextStyle(fontSize: 11, color: _muted)),
        ],
      ),
    ),
  );
}

class _ViralTrendHistory extends StatelessWidget {
  const _ViralTrendHistory({required this.shell, required this.ownerId});
  final _ShellState shell;
  final String ownerId;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Viral Trend History')),
    body: _Load(
      fetch: () => shell.api.rpc('competition_history', {
        'user_id': ownerId,
        'include_challenges': true,
        'p_limit': 100,
      }),
      render: (value, _) {
        final weeks = records(value);
        if (weeks.isEmpty) {
          return const Center(
            child: Text('Viral videos appear here after the week closes.'),
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.all(12),
          itemCount: weeks.length,
          separatorBuilder: (context, index) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            final week = weeks[index];
            final competition = object(week['competition']);
            final videos = records(week['videos']);
            final rank = object(week['entry']).number('rank');
            final start = DateTime.tryParse(competition.string('start'));
            final date = start == null
                ? 'Past week'
                : MaterialLocalizations.of(context).formatMediumDate(
                    start.toUtc().add(const Duration(hours: 5, minutes: 30)),
                  );
            return Card(
              child: ExpansionTile(
                leading: const Icon(
                  Icons.local_fire_department,
                  color: Colors.orangeAccent,
                ),
                title: Text(date),
                subtitle: Text(
                  '${videos.length} Viral ${videos.length == 1 ? 'video' : 'videos'}${rank > 0 ? ' · Rank #$rank' : ''}',
                ),
                children: [
                  if (videos.isNotEmpty)
                    _Cards(items: videos, shell: shell)
                  else
                    const Padding(
                      padding: EdgeInsets.all(12),
                      child: Text('No archived videos for this week'),
                    ),
                ],
              ),
            );
          },
        );
      },
    ),
  );
}

class _Settings extends StatelessWidget {
  const _Settings({required this.shell});
  final _ShellState shell;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Settings')),
    body: ListView(
      children: [
        ListTile(
          title: const Text('Edit profile'),
          leading: const Icon(Icons.edit_outlined),
          onTap: () => shell.editProfile(),
        ),
        ListTile(
          title: const Text('Change profile photo'),
          leading: const Icon(Icons.photo_outlined),
          onTap: () async {
            try {
              final image = await ImagePicker().pickImage(
                source: ImageSource.gallery,
              );
              if (image == null) return;
              final path = await shell.api.upload(
                image,
                shell.me.string('id'),
                bucket: 'avatars',
              );
              final me = object(
                await shell.api.rpc('update_profile', {'p_avatar_path': path}),
              );
              shell.updateProfile(me);
              if (context.mounted) _notice(context, 'Photo saved');
            } catch (error) {
              if (context.mounted) _notice(context, error);
            }
          },
        ),
        ListTile(
          title: const Text('Category preferences'),
          leading: const Icon(Icons.grid_view),
          onTap: () => shell.openPreferences(closeSettings: true),
        ),
        ListTile(
          title: const Text('Blocked accounts'),
          leading: const Icon(Icons.block_outlined),
          onTap: () => shell.push<void>(
            _DataPage(
              title: 'Blocked accounts',
              fetch: () => shell.api.rpc('my_blocks'),
              titleKey: 'display_name',
              subtitleKey: 'username',
              onTap: (person) async {
                if (!await _confirm(
                  context,
                  'Unblock @${person.string('username')}?',
                ))
                  return;
                try {
                  await shell.api.rpc('unblock_user', {
                    'p_user_id': person.string('id'),
                  });
                  if (context.mounted) Navigator.pop(context);
                } catch (error) {
                  if (context.mounted) _notice(context, error);
                }
              },
            ),
          ),
        ),
        ListTile(
          title: const Text('Request account deletion'),
          leading: const Icon(Icons.person_remove_outlined),
          onTap: () async {
            if (!await _confirm(context, 'Request account deletion?')) return;
            await shell.push<void>(
              _FormPage(
                title: 'Account deletion',
                fields: const [_Field('Reason', required: false)],
                button: 'Submit request',
                submit: (values) => shell.api.rpc(
                  'request_my_account_deletion',
                  {'p_reason': values.first, 'p_source': 'android'},
                ),
              ),
            );
          },
        ),
        ListTile(
          title: const Text('Sign out'),
          leading: const Icon(Icons.logout),
          onTap: () async {
            if (!await _confirm(context, 'Sign out?')) return;
            if (context.mounted) Navigator.pop(context);
            await shell.signOut();
          },
        ),
      ],
    ),
  );
}
