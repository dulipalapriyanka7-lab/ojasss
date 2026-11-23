part of 'main.dart';

class _EditStudio extends StatefulWidget {
  const _EditStudio({required this.input});
  final XFile input;

  @override
  State<_EditStudio> createState() => _EditStudioState();
}

class _EditStudioState extends State<_EditStudio> {
  static const engine = MethodChannel('ojasss/studio');
  late final player = VideoPlayerController.file(File(widget.input.path));
  final title = TextEditingController();
  int tool = 0, rotation = 0, quality = 720;
  double speed = 1, zoom = 1, ratio = 0;
  double saturation = 0, brightness = 0, contrast = 0;
  bool flip = false, mute = false, busy = false, ready = false;
  bool recording = false;
  double originalVolume = 1, musicVolume = .45;
  String template = 'glow', animation = 'none';
  String sticker = 'none';
  String? music, voice, error;
  int? progress;
  RangeValues? cut;
  Timer? timer;
  bool seeking = false;
  final removed = <RangeValues>[];
  final splits = <int>{};
  int get duration => player.value.duration.inMilliseconds;
  int get playhead => player.value.position.inMilliseconds;

  @override
  void initState() {
    super.initState();
    player.addListener(followEdits);
    player.initialize().then(
      (_) {
        if (mounted)
          setState(() {
            ready = true;
            cut = RangeValues(0, duration.toDouble());
          });
      },
      onError: (_) {
        if (mounted) setState(() => error = 'This video could not be opened.');
      },
    );
  }

  @override
  void dispose() {
    player.removeListener(followEdits);
    if (recording)
      unawaited(
        engine
            .invokeMethod<String>('stopVoice')
            .then<void>((_) {}, onError: (_) {}),
      );
    timer?.cancel();
    title.dispose();
    player.dispose();
    super.dispose();
  }

  Future<void> followEdits() async {
    if (!ready || seeking || !player.value.isPlaying) return;
    final clips = segments;
    final position = playhead;
    if (clips.any((clip) => position >= clip[0] && position < clip[1])) return;
    seeking = true;
    try {
      final next = clips.where((clip) => clip[0] > position).firstOrNull;
      if (next == null) {
        await player.pause();
      } else {
        await player.seekTo(Duration(milliseconds: next[0]));
      }
    } finally {
      seeking = false;
    }
  }

  List<List<int>> get segments {
    final start = cut!.start.round(), end = cut!.end.round();
    final points = <int>{
      start,
      end,
      ...splits.where((point) => point > start && point < end),
      for (final range in removed) ...[
        range.start.round().clamp(start, end),
        range.end.round().clamp(start, end),
      ],
    }.toList()..sort();
    return [
      for (var i = 1; i < points.length; i++)
        if (!removed.any(
          (range) => points[i - 1] >= range.start && points[i] <= range.end,
        ))
          [points[i - 1], points[i]],
    ];
  }

  Future<void> export() async {
    if (busy || recording || !ready) return;
    final clips = segments;
    final length =
        clips.fold(0, (int total, clip) => total + clip[1] - clip[0]) / speed;
    if (length < 300) {
      setState(() => error = 'Keep at least 0.3 seconds of video.');
      return;
    }
    await player.pause();
    if (!mounted || busy) return;
    setState(() {
      busy = true;
      error = null;
      progress = null;
    });
    timer = Timer.periodic(const Duration(milliseconds: 400), (_) async {
      try {
        final current = await engine.invokeMethod<int>('progress');
        if (mounted && busy) setState(() => progress = current);
      } on PlatformException {
        // Progress may be unavailable until the encoder has opened.
      }
    });
    try {
      final path = await engine.invokeMethod<String>('export', {
        'path': widget.input.path,
        'segments': clips,
        'speed': speed,
        'zoom': zoom,
        'rotation': rotation,
        'flip': flip,
        'ratio': ratio,
        'music': music,
        'voice': voice,
        'musicVolume': musicVolume,
        'originalVolume': originalVolume,
        'sticker': sticker,
        'mute': mute,
        'quality': quality,
        'saturation': saturation,
        'brightness': brightness,
        'contrast': contrast,
        'text': title.text.trim(),
        'template': template,
        'animation': animation,
      });
      if (path == null ||
          !await File(path).exists() ||
          await File(path).length() == 0) {
        throw const FormatException('The edited video could not be saved.');
      }
      if (mounted) Navigator.pop(context, XFile(path, mimeType: 'video/mp4'));
    } on PlatformException catch (failure) {
      if (mounted)
        setState(
          () => error = failure.message ?? 'The video could not be exported.',
        );
    } catch (failure) {
      if (mounted) setState(() => error = failure.toString());
    } finally {
      timer?.cancel();
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> pickMusic() async {
    try {
      final selected = await engine.invokeMethod<String>('music');
      if (mounted && selected != null) setState(() => music = selected);
    } on PlatformException catch (failure) {
      if (mounted) setState(() => error = failure.message);
    }
  }

  Future<void> recordVoice() async {
    try {
      if (recording) {
        final result = await engine.invokeMethod<String>('stopVoice');
        if (mounted)
          setState(() {
            recording = false;
            voice = result;
          });
      } else {
        await player.pause();
        await engine.invokeMethod<void>('startVoice');
        if (mounted)
          setState(() {
            recording = true;
            error = null;
          });
      }
    } on PlatformException catch (failure) {
      if (mounted)
        setState(() {
          recording = false;
          error = failure.message;
        });
    }
  }

  String time(double ms) {
    final t = Duration(milliseconds: ms.round());
    return '${t.inMinutes}:${(t.inSeconds % 60).toString().padLeft(2, '0')}.${(t.inMilliseconds % 1000) ~/ 100}';
  }

  Widget slider(
    String label,
    double value,
    double min,
    double max,
    ValueChanged<double> update,
  ) => Row(
    children: [
      SizedBox(width: 88, child: Text(label)),
      Expanded(
        child: Slider(
          value: value,
          min: min,
          max: max,
          label: value.toStringAsFixed(1),
          onChanged: (value) => setState(() => update(value)),
        ),
      ),
      Text(value.toStringAsFixed(1)),
    ],
  );

  Widget choices<T>(
    Map<T, String> options,
    T current,
    ValueChanged<T> choose,
  ) => Wrap(
    spacing: 6,
    runSpacing: 4,
    children: [
      for (final item in options.entries)
        ChoiceChip(
          label: Text(item.value),
          selected: current == item.key,
          onSelected: (_) => setState(() => choose(item.key)),
        ),
    ],
  );

  ColorFilter get previewFilter {
    final s = 1 + saturation / 100,
        c = 1 + contrast,
        k = (1 - c) * 128 + brightness * 255;
    final r = .213 * (1 - s), g = .715 * (1 - s), b = .072 * (1 - s);
    return ColorFilter.matrix([
      c * (r + s),
      c * g,
      c * b,
      0,
      k,
      c * r,
      c * (g + s),
      c * b,
      0,
      k,
      c * r,
      c * g,
      c * (b + s),
      0,
      k,
      0,
      0,
      0,
      1,
      0,
    ]);
  }

  Widget preview() {
    final aspect = player.value.aspectRatio;
    final shownAspect = rotation % 180 == 0 ? aspect : 1 / aspect;
    return SizedBox(
      height: 280,
      child: Center(
        child: AspectRatio(
          aspectRatio: ratio > 0 ? ratio : shownAspect,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: ColoredBox(
              color: Colors.black,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  FittedBox(
                    fit: BoxFit.cover,
                    child: SizedBox(
                      width: shownAspect * 240,
                      height: 240,
                      child: Transform.scale(
                        scale: zoom,
                        child: Transform.flip(
                          flipX: flip,
                          child: RotatedBox(
                            quarterTurns: rotation ~/ 90,
                            child: ColorFiltered(
                              colorFilter: previewFilter,
                              child: VideoPlayer(player),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  ValueListenableBuilder(
                    valueListenable: player,
                    builder: (_, state, _) {
                      final text = title.text.trim();
                      final position = state.position.inMilliseconds;
                      final elapsed = segments.fold<int>(
                        0,
                        (total, clip) =>
                            total +
                            (position - clip[0]).clamp(0, clip[1] - clip[0]),
                      );
                      final ticks = elapsed ~/ (speed * 50);
                      final visible = animation == 'typing'
                          ? text.characters.take(ticks + 1).toString()
                          : text;
                      return Stack(
                        fit: StackFit.expand,
                        children: [
                          if (sticker == 'sparkle')
                            Align(
                              alignment: const Alignment(.67, -.54),
                              child: Transform.rotate(
                                angle: ticks * .10472,
                                child: const Icon(
                                  Icons.auto_awesome,
                                  color: Color(0xffffcb67),
                                  size: 28,
                                ),
                              ),
                            ),
                          Align(
                            alignment: Alignment.bottomCenter,
                            child: Padding(
                              padding: EdgeInsets.fromLTRB(
                                12,
                                0,
                                12,
                                animation == 'slide'
                                    ? (ticks.clamp(0, 12) * 2 + 18).toDouble()
                                    : 40,
                              ),
                              child: Opacity(
                                opacity: animation == 'fade'
                                    ? (ticks / 12).clamp(0, 1).toDouble()
                                    : 1,
                                child: visible.isEmpty
                                    ? const SizedBox.shrink()
                                    : DecoratedBox(
                                        decoration: BoxDecoration(
                                          gradient: LinearGradient(
                                            colors: switch (template) {
                                              'offer' => [
                                                const Color(0xff9f1b2e),
                                                const Color(0xffe75316),
                                              ],
                                              'news' => [
                                                const Color(0xff022e53),
                                                const Color(0xff12628a),
                                              ],
                                              'glass' => [
                                                const Color(0xb918173a),
                                                const Color(0xa95e276b),
                                              ],
                                              _ => [
                                                const Color(0xff3c126b),
                                                const Color(0xffa82f77),
                                              ],
                                            },
                                          ),
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
                                        ),
                                        child: Padding(
                                          padding: const EdgeInsets.all(8),
                                          child: Text(
                                            visible,
                                            textAlign: TextAlign.center,
                                            maxLines: 3,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ),
                                      ),
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy && !recording,
    child: Scaffold(
      backgroundColor: _homeBackground,
      appBar: AppBar(
        title: const Text('OJASSS Edit'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilledButton(
              onPressed: ready && !busy && !recording ? export : null,
              child: const Text('Export'),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            if (error != null)
              Text(error!, style: const TextStyle(color: Colors.orangeAccent)),
            if (!ready && error == null) const LinearProgressIndicator(),
            if (ready) ...[
              preview(),
              ValueListenableBuilder(
                valueListenable: player,
                builder: (_, state, _) => Row(
                  children: [
                    IconButton(
                      tooltip: state.isPlaying
                          ? 'Pause'
                          : 'Preview original timeline',
                      onPressed: busy
                          ? null
                          : () async {
                              if (state.isPlaying) {
                                await player.pause();
                                return;
                              }
                              if (playhead < cut!.start || playhead >= cut!.end)
                                await player.seekTo(
                                  Duration(milliseconds: cut!.start.round()),
                                );
                              await player.setPlaybackSpeed(speed);
                              await player.setVolume(mute ? 0 : originalVolume);
                              await player.play();
                            },
                      icon: Icon(
                        state.isPlaying ? Icons.pause : Icons.play_arrow,
                      ),
                    ),
                    Text(time(state.position.inMilliseconds.toDouble())),
                    Expanded(
                      child: Slider(
                        value: playhead.toDouble().clamp(
                          0,
                          duration.toDouble(),
                        ),
                        max: duration.toDouble(),
                        onChanged: busy
                            ? null
                            : (value) => player.seekTo(
                                Duration(milliseconds: value.round()),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
              if (busy) ...[
                LinearProgressIndicator(
                  value: progress == null ? null : progress! / 100,
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      progress == null
                          ? 'Preparing video…'
                          : 'Exporting ${progress!}%',
                    ),
                    TextButton(
                      onPressed: () => engine.invokeMethod<void>('cancel'),
                      child: const Text('Cancel export'),
                    ),
                  ],
                ),
              ] else ...[
                choices(
                  const {
                    0: 'Cut',
                    1: 'Motion',
                    2: 'Color',
                    3: 'Text & templates',
                    4: 'Audio',
                  },
                  tool,
                  (n) => tool = n,
                ),
                const SizedBox(height: 8),
                if (tool == 0) ...[
                  Text('Trim ${time(cut!.start)} – ${time(cut!.end)}'),
                  RangeSlider(
                    values: cut!,
                    max: duration.toDouble(),
                    onChanged: (range) => setState(() => cut = range),
                  ),
                  Wrap(
                    spacing: 5,
                    children: [
                      OutlinedButton(
                        onPressed: () {
                          if (playhead > cut!.start && playhead < cut!.end)
                            setState(() => splits.add(playhead));
                        },
                        child: const Text('Split at playhead'),
                      ),
                      OutlinedButton(
                        onPressed: () {
                          final clip = segments
                              .where(
                                (clip) =>
                                    playhead >= clip[0] && playhead < clip[1],
                              )
                              .firstOrNull;
                          if (clip != null && segments.length > 1)
                            setState(
                              () => removed.add(
                                RangeValues(
                                  clip[0].toDouble(),
                                  clip[1].toDouble(),
                                ),
                              ),
                            );
                        },
                        child: const Text('Remove segment'),
                      ),
                      if (removed.isNotEmpty || splits.isNotEmpty)
                        TextButton(
                          onPressed: () => setState(() {
                            removed.clear();
                            splits.clear();
                          }),
                          child: const Text('Reset cuts'),
                        ),
                    ],
                  ),
                  Text(
                    segments
                        .map(
                          (clip) =>
                              '${time(clip[0].toDouble())} – ${time(clip[1].toDouble())}',
                        )
                        .join('  ·  '),
                  ),
                ],
                if (tool == 1) ...[
                  choices(
                    {
                      0.25: '0.25×',
                      0.5: '0.5×',
                      0.75: '0.75×',
                      1.0: '1×',
                      1.5: '1.5×',
                      2.0: '2×',
                    },
                    speed,
                    (value) {
                      speed = value;
                      unawaited(player.setPlaybackSpeed(value));
                    },
                  ),
                  choices(
                    {
                      0.0: 'Original',
                      9.0 / 16: '9:16',
                      1.0: '1:1',
                      16.0 / 9: '16:9',
                    },
                    ratio,
                    (v) => ratio = v,
                  ),
                  slider('Crop zoom', zoom, 1, 2.5, (v) => zoom = v),
                  Wrap(
                    spacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: () =>
                            setState(() => rotation = (rotation + 90) % 360),
                        icon: const Icon(Icons.rotate_right),
                        label: Text('Rotate ${rotation}°'),
                      ),
                      FilterChip(
                        selected: flip,
                        label: const Text('Mirror'),
                        onSelected: (v) => setState(() => flip = v),
                      ),
                    ],
                  ),
                ],
                if (tool == 2) ...[
                  Wrap(
                    spacing: 6,
                    children: [
                      for (final (name, sat, light, tone) in [
                        ('Original', 0.0, 0.0, 0.0),
                        ('Mono', -100.0, .0, .16),
                        ('Vivid', 32.0, .03, .14),
                        ('Soft', -12.0, .06, -.13),
                        ('Cinema', -25.0, -.05, .23),
                      ])
                        ActionChip(
                          label: Text(name),
                          onPressed: () => setState(() {
                            saturation = sat;
                            brightness = light;
                            contrast = tone;
                          }),
                        ),
                    ],
                  ),
                  slider(
                    'Saturation',
                    saturation,
                    -100,
                    100,
                    (v) => saturation = v,
                  ),
                  slider(
                    'Brightness',
                    brightness,
                    -.5,
                    .5,
                    (v) => brightness = v,
                  ),
                  slider('Contrast', contrast, -.5, .5, (v) => contrast = v),
                ],
                if (tool == 3) ...[
                  choices(
                    const {'none': 'No sticker', 'sparkle': 'Animated sparkle'},
                    sticker,
                    (v) => sticker = v,
                  ),
                  TextField(
                    controller: title,
                    maxLines: 3,
                    maxLength: 160,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(
                      labelText: 'Title or caption',
                    ),
                  ),
                  choices(
                    const {
                      'glow': 'Neon title',
                      'offer': 'Business offer',
                      'news': 'News lower third',
                      'glass': 'Glass quote',
                    },
                    template,
                    (v) => template = v,
                  ),
                  const SizedBox(height: 8),
                  choices(
                    const {
                      'none': 'Static',
                      'typing': 'Typing',
                      'fade': 'Fade',
                      'slide': 'Slide',
                    },
                    animation,
                    (v) => animation = v,
                  ),
                ],
                if (tool == 4) ...[
                  OutlinedButton.icon(
                    onPressed: recordVoice,
                    icon: Icon(recording ? Icons.stop : Icons.mic_none),
                    label: Text(
                      recording
                          ? 'Stop voiceover'
                          : voice == null
                          ? 'Record voiceover'
                          : 'Record again',
                    ),
                  ),
                  if (voice != null && !recording)
                    TextButton(
                      onPressed: () => setState(() => voice = null),
                      child: const Text('Remove voiceover'),
                    ),
                  if (!mute)
                    slider('Video audio', originalVolume, 0, 1, (v) {
                      originalVolume = v;
                      unawaited(player.setVolume(v));
                    }),
                  if (music != null)
                    slider(
                      'Music level',
                      musicVolume,
                      0,
                      1,
                      (v) => musicVolume = v,
                    ),
                  SwitchListTile(
                    title: const Text('Mute original audio'),
                    value: mute,
                    onChanged: (value) {
                      setState(() => mute = value);
                      unawaited(player.setVolume(value ? 0 : 1));
                    },
                  ),
                  OutlinedButton.icon(
                    onPressed: pickMusic,
                    icon: const Icon(Icons.library_music_outlined),
                    label: Text(
                      music == null
                          ? 'Add music from your device'
                          : 'Replace music',
                    ),
                  ),
                  if (music != null)
                    TextButton(
                      onPressed: () => setState(() => music = null),
                      child: const Text('Remove music'),
                    ),
                  if (music != null)
                    const Text(
                      'The music track is mixed into the exported video.',
                    ),
                ],
                const SizedBox(height: 12),
                choices(
                  const {720: '720p', 1080: '1080p'},
                  quality,
                  (v) => quality = v,
                ),
              ],
            ],
          ],
        ),
      ),
    ),
  );
}
