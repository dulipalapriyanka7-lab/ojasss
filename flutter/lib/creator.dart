part of 'main.dart';

class _UploadPage extends StatefulWidget {
  const _UploadPage({
    required this.shell,
    this.status = false,
    this.viralChallenge,
    this.openEditor = false,
  });
  final _ShellState shell;
  final bool status;
  final Data? viralChallenge;
  final bool openEditor;
  @override
  State<_UploadPage> createState() => _UploadPageState();
}

class _UploadPageState extends State<_UploadPage> {
  XFile? media;
  XFile? thumbnail;
  VideoPlayerController? preview;
  String? uploaded;
  String? uploadedThumbnail;
  bool video = true;
  bool busy = false;
  bool rights = false;
  bool episode = false;
  bool complaintAccepted = false;
  bool detectingLocation = false;
  String? error;
  String? locationMessage;
  String? detectedPlace;
  late String category =
      widget.viralChallenge?.string('category') ?? 'entertainment';
  String origin = 'new_content';
  String visibility = 'public';
  String access = 'free';
  final form = GlobalKey<FormState>();
  final caption = TextEditingController();
  final location = TextEditingController();
  final language = TextEditingController(text: 'en');
  final series = TextEditingController();
  final episodeNumber = TextEditingController(text: '1');
  final source = TextEditingController();
  final complaintDetails = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (widget.openEditor) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_pick(true));
      });
    }
  }

  @override
  void dispose() {
    preview?.dispose();
    for (final field in [
      caption,
      location,
      language,
      series,
      episodeNumber,
      source,
      complaintDetails,
    ]) {
      field.dispose();
    }
    super.dispose();
  }

  Future<void> _pick(bool isVideo) async {
    try {
      final picker = ImagePicker();
      final file = isVideo
          ? await picker.pickVideo(source: ImageSource.gallery)
          : await picker.pickImage(source: ImageSource.gallery);
      if (!mounted || file == null) return;
      if (isVideo && !widget.status) {
        await _openStudio(file);
      } else {
        await _setMedia(file, isVideo);
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> _openStudio(XFile file) async {
    await preview?.pause();
    if (!mounted) return;
    final edited = await widget.shell.push<XFile>(_EditStudio(input: file));
    if (!mounted || edited == null) return;
    try {
      await _setMedia(edited, true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> _setMedia(XFile file, bool isVideo) async {
    final firstSelection = media == null;
    final previous = preview;
    final next = isVideo ? VideoPlayerController.file(File(file.path)) : null;
    setState(() {
      media = file;
      video = isVideo;
      preview = next;
      uploaded = null;
      error = null;
    });
    if (!widget.status && firstSelection && location.text.isEmpty) {
      unawaited(_detectLocation());
    }
    await previous?.dispose();
    if (next != null) {
      await next.initialize();
      if (mounted && next == preview) setState(() {});
    }
  }

  Future<void> _detectLocation() async {
    if (detectingLocation) return;
    final original = location.text;
    setState(() {
      detectingLocation = true;
      locationMessage = null;
    });
    try {
      const channel = MethodChannel('ojasss/location');
      final place = await channel.invokeMethod<String>('detect');
      if (!mounted || place == null || location.text != original) return;
      location.text = place;
      detectedPlace = place;
    } on PlatformException catch (e) {
      if (mounted) locationMessage = e.message ?? 'Enter a place or retry.';
    } on MissingPluginException {
      if (mounted) locationMessage = 'Enter a place.';
    } finally {
      if (mounted) setState(() => detectingLocation = false);
    }
  }

  Widget _locationField() => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextFormField(
      controller: location,
      enabled: !busy,
      onChanged: (_) => setState(() => locationMessage = null),
      decoration: InputDecoration(
        labelText: category == 'public_complaint'
            ? 'Location'
            : 'Location (optional)',
        prefixIcon: const Icon(Icons.location_on_outlined),
        helperText: detectingLocation
            ? 'Finding your location…'
            : locationMessage ??
                  (detectedPlace == location.text
                      ? 'Place detected. You can edit or clear it.'
                      : null),
        helperMaxLines: 2,
        suffixIcon: IconButton(
          tooltip: location.text.isEmpty
              ? 'Use current location'
              : 'Remove location',
          onPressed: busy || detectingLocation
              ? null
              : location.text.isEmpty
              ? _detectLocation
              : () => setState(() {
                  location.clear();
                  detectedPlace = null;
                  locationMessage = null;
                }),
          icon: Icon(location.text.isEmpty ? Icons.my_location : Icons.close),
        ),
      ),
      validator: (value) =>
          category == 'public_complaint' && (value?.trim().isEmpty ?? true)
          ? 'Required'
          : null,
    ),
  );

  Widget _mediaChoice(
    IconData icon,
    String title,
    String subtitle,
    Gradient gradient,
    VoidCallback open,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 9),
    child: _HomeRim(
      radius: 15,
      fill: gradient,
      child: Material(
        color: Colors.transparent,
        child: ListTile(
          leading: Icon(icon, color: Colors.white),
          title: Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: Text(
            subtitle,
            style: const TextStyle(fontSize: 12, color: Color(0xffeee0f4)),
          ),
          trailing: const Icon(Icons.chevron_right),
          onTap: open,
        ),
      ),
    ),
  );

  Future<void> _publish() async {
    final file = media;
    if (busy || file == null || !form.currentState!.validate()) return;
    if (!widget.status && video && origin == 'copy_paste' && !rights) {
      setState(() => error = 'Confirm you have the right to share this video.');
      return;
    }
    if (!widget.status &&
        category == 'public_complaint' &&
        !complaintAccepted) {
      setState(() => error = 'Confirm the complaint declaration.');
      return;
    }
    if (!widget.status && video && preview?.value.isInitialized != true) {
      setState(
        () => error = 'Choose a video that can be played on this phone.',
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final api = widget.shell.api;
      final user = widget.shell.me.string('id');
      uploaded ??= await api.upload(file, user);
      if (!mounted) return;
      if (!widget.status && video && thumbnail != null) {
        uploadedThumbnail ??= await api.upload(thumbnail!, user);
      }
      if (!mounted) return;
      final result = await api.invoke(
        widget.status ? 'create-status' : 'create-post',
        {
          'mediaPath': uploaded,
          'caption': caption.text.trim(),
          'visibility': visibility,
          if (!widget.status) ...{
            'kind': video ? 'video' : 'poster',
            if (widget.viralChallenge != null)
              'viralChallengeId': widget.viralChallenge!.string('id'),
            'category': category,
            'language': language.text.trim(),
            'country': widget.shell.me.string('country', 'IN'),
            'location': location.text.trim(),
            'contentOrigin': video ? origin : null,
            'thumbnailPath': video ? uploadedThumbnail : null,
            'width': preview?.value.size.width.round(),
            'height': preview?.value.size.height.round(),
            'durationMs': preview?.value.duration.inMilliseconds,
            if (video && origin == 'copy_paste')
              'repost': {
                'sourceUrl': source.text.trim(),
                'rightsConfirmed': rights,
              },
            if (video && episode)
              'series': {
                'title': series.text.trim(),
                'genre': category,
                'episodeNumber': int.parse(episodeNumber.text.trim()),
                'access': access,
              },
            if (category == 'public_complaint')
              'complaint': {
                'subcategory': 'other',
                'description': complaintDetails.text.trim(),
                'location': location.text.trim(),
                'acceptedDisclaimer': complaintAccepted,
                'forwardRequested': false,
                'legalAssistanceRequested': false,
              },
          },
        },
      );
      if (mounted) {
        final response = object(result);
        final id = response.string('id', response.string('post_id'));
        Navigator.pop(
          context,
          widget.status
              ? true
              : id.isEmpty
              ? null
              : id,
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _field(
    String label,
    TextEditingController controller, {
    bool required = false,
    bool number = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextFormField(
      controller: controller,
      enabled: !busy,
      decoration: InputDecoration(labelText: label),
      keyboardType: number ? TextInputType.number : null,
      validator: (value) {
        if (required && (value?.trim().isEmpty ?? true)) return 'Required';
        if (number && (int.tryParse(value?.trim() ?? '') ?? 0) <= 0)
          return 'Enter a positive number';
        return null;
      },
    ),
  );

  Widget _choice(
    String label,
    String value,
    Map<String, String> options,
    ValueChanged<String> change,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: options.entries
          .map(
            (choice) =>
                DropdownMenuItem(value: choice.key, child: Text(choice.value)),
          )
          .toList(),
      onChanged: busy
          ? null
          : (value) {
              if (value != null) setState(() => change(value));
            },
    ),
  );

  @override
  Widget build(BuildContext context) {
    final playable = preview;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.viralChallenge != null
              ? 'Challenge video'
              : widget.status
              ? 'Add Status'
              : 'Create',
        ),
      ),
      body: SafeArea(
        child: Form(
          key: form,
          child: ListView(
            padding: const EdgeInsets.all(14),
            children: [
              if (widget.viralChallenge != null)
                ListTile(
                  leading: const Icon(Icons.emoji_events_outlined),
                  title: Text(widget.viralChallenge!.string('title')),
                  subtitle: Text(
                    '${categories[category] ?? category} · Public video',
                  ),
                ),
              if (!widget.status && media == null) ...[
                const Padding(
                  padding: EdgeInsets.only(bottom: 16),
                  child: Text(
                    'Choose what to create',
                    style: TextStyle(fontSize: 25, fontWeight: FontWeight.w800),
                  ),
                ),
                _mediaChoice(
                  Icons.movie_edit,
                  'New video',
                  'Edit your own footage in Edit Studio',
                  const LinearGradient(
                    colors: [Color(0xff4f2462), Color(0xff322052)],
                  ),
                  () {
                    origin = 'new_content';
                    _pick(true);
                  },
                ),
                _mediaChoice(
                  Icons.video_library_outlined,
                  'Copy-Paste video',
                  'Edit a video you have permission to share',
                  const LinearGradient(
                    colors: [Color(0xff5b2848), Color(0xff2d193e)],
                  ),
                  () {
                    origin = 'copy_paste';
                    _pick(true);
                  },
                ),
                if (widget.viralChallenge == null)
                  _mediaChoice(
                    Icons.image_outlined,
                    'Upload poster',
                    'Pick a photo from your gallery',
                    const LinearGradient(
                      colors: [Color(0xff233e55), Color(0xff262245)],
                    ),
                    () => _pick(false),
                  ),
                if (error != null)
                  Text(
                    error!,
                    style: const TextStyle(color: Colors.orangeAccent),
                  ),
              ],
              if (widget.status || media != null) ...[
                if (widget.status)
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: busy ? null : () => _pick(true),
                          icon: const Icon(Icons.video_library_outlined),
                          label: const Text('Video'),
                        ),
                      ),
                      if (widget.viralChallenge == null)
                        const SizedBox(width: 8),
                      if (widget.viralChallenge == null)
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: busy ? null : () => _pick(false),
                            icon: const Icon(Icons.image_outlined),
                            label: const Text('Photo'),
                          ),
                        ),
                    ],
                  ),
                if (media != null) ...[
                  const SizedBox(height: 10),
                  if (!video)
                    SizedBox(
                      height: 160,
                      child: Image.file(File(media!.path), fit: BoxFit.contain),
                    ),
                  if (playable?.value.isInitialized == true)
                    SizedBox(
                      height: 160,
                      child: Center(
                        child: AspectRatio(
                          aspectRatio: playable!.value.aspectRatio,
                          child: GestureDetector(
                            onTap: () {
                              if (playable.value.isPlaying) {
                                playable.pause();
                              } else {
                                playable.play();
                              }
                            },
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                VideoPlayer(playable),
                                const Icon(Icons.play_circle_outline, size: 36),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (video && !widget.status)
                        TextButton.icon(
                          onPressed: busy ? null : () => _openStudio(media!),
                          icon: const Icon(Icons.movie_edit, size: 17),
                          label: const Text('Edit Studio'),
                        ),
                      if (!widget.status)
                        TextButton(
                          onPressed: busy
                              ? null
                              : () => setState(() {
                                  unawaited(preview?.dispose());
                                  media = null;
                                  preview = null;
                                  uploaded = null;
                                  thumbnail = null;
                                  uploadedThumbnail = null;
                                  error = null;
                                }),
                          child: const Text('Change file'),
                        ),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(
                      media!.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
                _field('Caption', caption, required: !widget.status && !video),
                if (!widget.status) ...[
                  if (widget.viralChallenge == null)
                    _choice(
                      'Category',
                      category,
                      Map.of(categories)..remove('one_chance'),
                      (v) => category = v,
                    ),
                  _field('Language code', language, required: true),
                  _locationField(),
                  if (category == 'public_complaint') ...[
                    _field(
                      'Complaint details',
                      complaintDetails,
                      required: true,
                    ),
                    CheckboxListTile(
                      value: complaintAccepted,
                      onChanged: busy
                          ? null
                          : (v) =>
                                setState(() => complaintAccepted = v ?? false),
                      title: const Text(
                        'I confirm these details are accurate and can be submitted for review.',
                      ),
                    ),
                  ],
                  if (video) ...[
                    _choice('Video type', origin, const {
                      'new_content': 'New Content',
                      'copy_paste': 'Copy-Paste',
                    }, (v) => origin = v),
                    if (origin == 'copy_paste') ...[
                      _field('Original link (optional)', source),
                      CheckboxListTile(
                        value: rights,
                        onChanged: busy
                            ? null
                            : (v) => setState(() => rights = v ?? false),
                        title: const Text(
                          'I have permission to share this content',
                        ),
                      ),
                    ],
                    ListTile(
                      leading: const Icon(Icons.photo_outlined),
                      title: Text(thumbnail?.name ?? 'Add thumbnail'),
                      onTap: busy
                          ? null
                          : () async {
                              final image = await ImagePicker().pickImage(
                                source: ImageSource.gallery,
                              );
                              if (image != null && mounted)
                                setState(() {
                                  thumbnail = image;
                                  uploadedThumbnail = null;
                                });
                            },
                    ),
                    SwitchListTile(
                      value: episode,
                      title: const Text('Part of an episode series'),
                      onChanged: busy
                          ? null
                          : (v) => setState(() => episode = v),
                    ),
                    if (episode) ...[
                      _field('Series name', series, required: true),
                      _field('Episode number', episodeNumber, number: true),
                      _choice('Episode access', access, const {
                        'free': 'Free',
                        'interest': 'Audience interest',
                        'premium': 'Premium',
                      }, (v) => access = v),
                    ],
                  ],
                ],
                if (widget.viralChallenge == null)
                  _choice('Who can see this', visibility, {
                    'public': 'Everyone',
                    'followers': 'Followers',
                    if (!widget.status) 'private': 'Only me',
                  }, (v) => visibility = v),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text(
                      error!,
                      style: const TextStyle(color: Colors.orangeAccent),
                    ),
                  ),
                FilledButton(
                  onPressed: busy || media == null ? null : _publish,
                  child: Text(busy ? 'Publishing…' : 'Publish'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Tasks extends StatelessWidget {
  const _Tasks({required this.shell});
  final _ShellState shell;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Challenges and tasks')),
    body: _Load(
      fetch: () => Future.wait([
        shell.api.rpc('challenge_public'),
        if (shell.me.isNotEmpty) shell.api.rpc('my_member_tasks'),
        if (shell.me.isNotEmpty) shell.api.rpc('weekly_usage_total'),
      ]),
      render: (value, _) {
        final results = value as List<Object?>;
        final challenge = object(results.first);
        final banner = object(challenge['banner']);
        final assigned = [
          ...records(challenge['tasks']),
          if (results.length > 1)
            ...records(object(results[1])['tasks'] ?? results[1]),
        ];
        return ListView(
          padding: const EdgeInsets.all(12),
          children: [
            if (banner.isNotEmpty)
              ListTile(
                title: Text(banner.string('name')),
                subtitle: Text(banner.string('schedule')),
              ),
            if (results.length > 2)
              ListTile(
                title: const Text('Time this week'),
                subtitle: Text(
                  '${object(results[2]).number('seconds') ~/ 60} minutes',
                ),
              ),
            if (assigned.isEmpty)
              const ListTile(title: Text('No assigned tasks')),
            for (final task in assigned)
              ListTile(
                title: Text(task.string('title')),
                subtitle: Text(
                  '${task.string('description')}\n${task.number('progress')}/${task.number('target')}',
                ),
                trailing: Text(task.string('status').replaceAll('_', ' ')),
              ),
          ],
        );
      },
    ),
  );
}

class _Membership extends StatefulWidget {
  const _Membership({required this.shell});
  final _ShellState shell;
  @override
  State<_Membership> createState() => _MembershipState();
}

class _MembershipState extends State<_Membership> {
  bool busy = false;

  Future<void> _operation(
    Future<Object?> Function() run,
    VoidCallback reload,
  ) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await run();
      if (mounted) reload();
    } catch (error) {
      if (mounted) _notice(context, error);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('One Chance membership')),
    body: _Load(
      fetch: () => widget.shell.api.rpc('one_chance_status'),
      render: (value, reload) {
        final status = object(value);
        final active = object(status['membership']);
        return ListView(
          children: [
            if (active.isNotEmpty)
              ListTile(
                title: Text(active.string('package_name', 'Active membership')),
                subtitle: Text('Until ${active.string('ends_at')}'),
              ),
            for (final plan in records(status['packages']))
              ListTile(
                title: Text(plan.string('name')),
                subtitle: Text(plan.string('description')),
                trailing: FilledButton(
                  onPressed: busy || !status.flag('eligible')
                      ? null
                      : () async {
                          if (!await _confirm(
                            context,
                            'Request ${plan.string('name')} for ${_money(plan.number('price_paise'))}?',
                          ))
                            return;
                          await _operation(
                            () => widget.shell.api.rpc('one_chance_request', {
                              'p_package_id': plan.string('id'),
                            }),
                            reload,
                          );
                        },
                  child: Text(_money(plan.number('price_paise'))),
                ),
              ),
            for (final request in records(status['requests']))
              ListTile(
                title: Text(
                  request.string('package_name', 'Membership request'),
                ),
                subtitle: Text(
                  '${request.string('status').replaceAll('_', ' ')} · ${_money(request.number('amount_paise'))}',
                ),
                onTap: busy || request.string('status') != 'awaiting_payment'
                    ? null
                    : () async {
                        final payee = request.string('upi_id');
                        final pay = Uri(
                          scheme: 'upi',
                          host: 'pay',
                          queryParameters: {
                            'pa': payee,
                            'pn': 'OJASSS',
                            'am': (request.number('amount_paise') / 100)
                                .toStringAsFixed(2),
                            'cu': 'INR',
                          },
                        );
                        await showModalBottomSheet<void>(
                          context: context,
                          showDragHandle: true,
                          builder: (sheet) => SafeArea(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                ListTile(
                                  title: Text(payee),
                                  subtitle: const Text('Payment UPI ID'),
                                  trailing: IconButton(
                                    tooltip: 'Copy UPI ID',
                                    icon: const Icon(Icons.copy),
                                    onPressed: () => Clipboard.setData(
                                      ClipboardData(text: payee),
                                    ),
                                  ),
                                ),
                                ListTile(
                                  title: const Text('Pay with UPI'),
                                  onTap: () => _external(sheet, pay.toString()),
                                ),
                                ListTile(
                                  title: const Text('Submit payment receipt'),
                                  onTap: () async {
                                    Navigator.pop(sheet);
                                    final file = await ImagePicker().pickImage(
                                      source: ImageSource.gallery,
                                    );
                                    if (!mounted || file == null) return;
                                    final result = await widget.shell
                                        .push<Object>(
                                          _FormPage(
                                            title: 'Payment receipt',
                                            fields: const [
                                              _Field('UPI reference number'),
                                            ],
                                            submit: (fields) async {
                                              final api = widget.shell.api;
                                              final path = await api.upload(
                                                file,
                                                widget.shell.me.string('id'),
                                                bucket: 'receipts',
                                              );
                                              return api
                                                  .rpc('one_chance_submit', {
                                                    'p_request_id': request
                                                        .string('id'),
                                                    'p_receipt_path': path,
                                                    'p_utr': fields.first,
                                                  });
                                            },
                                          ),
                                        );
                                    if (mounted && result != null) reload();
                                  },
                                ),
                                ListTile(
                                  title: const Text('Cancel request'),
                                  onTap: () async {
                                    Navigator.pop(sheet);
                                    if (!await _confirm(
                                      this.context,
                                      'Cancel this request?',
                                    ))
                                      return;
                                    await _operation(
                                      () => widget.shell.api.rpc(
                                        'one_chance_cancel',
                                        {'p_request_id': request.string('id')},
                                      ),
                                      reload,
                                    );
                                  },
                                ),
                              ],
                            ),
                          ),
                        );
                      },
              ),
          ],
        );
      },
    ),
  );
}

String _money(int paise) => '₹${(paise / 100).toStringAsFixed(2)}';

class _Wallet extends StatelessWidget {
  const _Wallet({required this.shell});
  final _ShellState shell;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Earnings')),
    body: _Load(
      fetch: () => Future.wait([
        shell.api.rpc('get_wallet'),
        shell.api.rpc('list_my_earnings', {'p_limit': 60}),
        shell.api.rpc('withdrawal_schedule'),
      ]),
      render: (value, reload) {
        final data = value as List<Object?>;
        final wallet = object(data[0]);
        final schedule = object(data[2]);
        return ListView(
          padding: const EdgeInsets.all(12),
          children: [
            ListTile(
              title: const Text('Available'),
              trailing: Text(_money(wallet.number('available_paise'))),
            ),
            ListTile(
              title: const Text('Pending'),
              trailing: Text(_money(wallet.number('pending_paise'))),
            ),
            ListTile(
              title: const Text('Payout details'),
              leading: const Icon(Icons.account_balance_outlined),
              onTap: () => _payout(),
            ),
            ListTile(
              title: const Text('Withdrawal history'),
              leading: const Icon(Icons.history),
              onTap: () => _history(),
            ),
            ListTile(
              title: const Text('Withdraw'),
              subtitle: Text(
                schedule.flag('open') ? 'Open' : 'Currently closed',
              ),
              enabled: schedule.flag('open'),
              onTap: () async {
                final requestKey = randomKey();
                final submitted = await shell.push<Object>(
                  _FormPage(
                    title: 'Withdraw',
                    fields: const [_Field('Amount in rupees')],
                    button: 'Request withdrawal',
                    submit: (fields) {
                      if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(fields.first))
                        throw const FormatException(
                          'Enter a valid amount in rupees.',
                        );
                      final parts = fields.first.split('.');
                      final paise =
                          int.parse(parts.first) * 100 +
                          (parts.length > 1
                              ? int.parse(parts[1].padRight(2, '0'))
                              : 0);
                      return shell.api.rpc('request_withdrawal', {
                        'p_amount_paise': paise,
                        'p_idempotency_key': requestKey,
                      });
                    },
                  ),
                );
                if (context.mounted && submitted != null) reload();
              },
            ),
            for (final item in records(data[1]))
              ListTile(
                title: Text(item.string('type').replaceAll('_', ' ')),
                subtitle: Text(item.string('status')),
                trailing: Text(_money(item.number('amount_paise'))),
              ),
          ],
        );
      },
    ),
  );

  Future<void> _payout() => shell.push<void>(
    _FormPage(
      title: 'Payout details',
      fields: const [
        _Field(
          'Method',
          initial: 'upi',
          choices: {'upi': 'UPI', 'bank': 'Bank account'},
        ),
        _Field('UPI ID', required: false),
        _Field('Account holder', required: false),
        _Field('Account number', required: false),
        _Field('IFSC', required: false),
        _Field('Bank name', required: false),
      ],
      submit: (v) => shell.api.rpc('upsert_payout_detail', {
        'p_method': v[0],
        'p_upi_id': v[1],
        'p_account_holder_name': v[2],
        'p_account_number': v[3],
        'p_ifsc': v[4],
        'p_bank_name': v[5],
      }),
    ),
  );

  Future<void> _history() => shell.push<void>(
    Scaffold(
      appBar: AppBar(title: const Text('Withdrawals')),
      body: _Load(
        fetch: () => shell.api.rpc('list_my_withdrawals', {'p_limit': 60}),
        render: (value, reload) => ListView(
          children: [
            if (records(value).isEmpty)
              const ListTile(title: Text('No withdrawals')),
            for (final item in records(value))
              ListTile(
                title: Text(_money(item.number('amount_paise'))),
                subtitle: Text(item.string('status')),
                trailing: item.string('status') == 'requested'
                    ? TextButton(
                        onPressed: () async {
                          if (!await _confirm(
                            shell.context,
                            'Cancel this withdrawal?',
                          ))
                            return;
                          try {
                            await shell.api.rpc('cancel_withdrawal', {
                              'p_withdrawal_id': item.string('id'),
                            });
                            reload();
                          } catch (error) {
                            if (shell.mounted) _notice(shell.context, error);
                          }
                        },
                        child: const Text('Cancel'),
                      )
                    : null,
              ),
          ],
        ),
      ),
    ),
  );
}

class _WeeklyTaskCard extends StatelessWidget {
  const _WeeklyTaskCard({required this.shell, required this.challenge});
  final _ShellState shell;
  final Data challenge;

  String date(BuildContext context, String value) {
    final instant = DateTime.tryParse(value);
    if (instant == null) return value;
    final india = instant.toUtc().add(const Duration(hours: 5, minutes: 30));
    final locale = MaterialLocalizations.of(context);
    return '${locale.formatShortDate(india)} ${locale.formatTimeOfDay(TimeOfDay.fromDateTime(india))} IST';
  }

  @override
  Widget build(BuildContext context) {
    final banner = object(challenge['banner']);
    final tasks = records(challenge['tasks']);
    if (banner.isEmpty && tasks.isEmpty && !challenge.flag('unavailable')) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: _HomeRim(
        radius: 20,
        fill: const LinearGradient(
          colors: [Color(0xff321149), Color(0xff190e25)],
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.emoji_events_outlined, color: _homeGold),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      banner.isEmpty ? 'Daily Tasks' : 'This week’s challenge',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
              if (challenge.flag('unavailable'))
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('Challenge details could not be loaded.'),
                ),
              if (banner.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  banner.string('name'),
                  style: const TextStyle(
                    color: _homeGold,
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (banner.string('schedule').isNotEmpty)
                  Text(banner.string('schedule')),
                Text(
                  '${date(context, banner.string('starts_at'))} – ${date(context, banner.string('ends_at'))}',
                ),
                Text(
                  banner.string('status').toUpperCase(),
                  style: const TextStyle(color: _homeGold),
                ),
                if (banner.number('max_prize') > 0)
                  Text(
                    'Approx. prize pool  ₹${banner.number('min_prize')} – ₹${banner.number('max_prize')}',
                    style: const TextStyle(
                      color: _homeGold,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
              ],
              if (tasks.isNotEmpty) ...[
                const Divider(),
                const Text(
                  'Today’s tasks',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                for (final task in tasks)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          task.string('title'),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        if (task.string('description').isNotEmpty)
                          Text(task.string('description')),
                        Text(
                          '${task.number('progress')}/${task.number('target')} · ${task.string('status').replaceAll('_', ' ')}',
                        ),
                        LinearProgressIndicator(
                          value:
                              (task.number('progress') /
                                      task.number('target').clamp(1, 1000000))
                                  .clamp(0, 1)
                                  .toDouble(),
                        ),
                        if (task.string('deadline').isNotEmpty)
                          Text('Due ${date(context, task.string('deadline'))}'),
                      ],
                    ),
                  ),
              ],
              TextButton(
                onPressed: () => shell.push<void>(_Tasks(shell: shell)),
                child: const Text('View tasks'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
