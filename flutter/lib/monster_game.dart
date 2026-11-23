part of 'main.dart';

class _MonsterLobby extends StatefulWidget {
  const _MonsterLobby({required this.shell});
  final _ShellState shell;

  @override
  State<_MonsterLobby> createState() => _MonsterLobbyState();
}

class _MonsterLobbyState extends State<_MonsterLobby> {
  static const _player = MethodChannel('ojasss/monster');
  bool opening = false;

  Future<void> _play() async {
    if (opening) return;
    setState(() => opening = true);
    try {
      bool restart;
      do {
        final api = widget.shell.api;
        final launch = object(await api.rpc('monster_game_play'));
        if (!mounted) return;
        final result = await _player.invokeMapMethod<String, dynamic>('play', {
          'path': launch.string('path'),
        });
        if (!mounted) return;
        final game = object(result);
        final coins = game.number('coins');
        final round = launch.string('round_id');
        restart = game.flag('restart');
        if (round.isEmpty || coins < 1 || coins > 13) continue;
        final reward = coins * launch.number('rate_paise');
        final request = await showDialog<bool>(
          context: context,
          builder: (dialog) => AlertDialog(
            title: const Text('Match reward'),
            content: Text(
              '$coins match coins · ₹${(reward / 100).toStringAsFixed(2)} after approval',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialog, false),
                child: const Text('Later'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialog, true),
                child: const Text('Request review'),
              ),
            ],
          ),
        );
        if (request == true && mounted) {
          await api.rpc('monster_game_reward_submit', {
            'round_id': round,
            'coins': coins,
          });
          if (mounted) _notice(context, 'Reward request sent for review.');
        }
      } while (restart && mounted);
    } catch (error) {
      if (mounted) _notice(context, error);
    } finally {
      if (mounted) setState(() => opening = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Games')),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.sports_esports_outlined, size: 40, color: _purple),
            const SizedBox(height: 12),
            const Text(
              'Monster Fight',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: opening ? null : _play,
              icon: const Icon(Icons.play_arrow_rounded),
              label: Text(opening ? 'Opening…' : 'Play in landscape'),
            ),
          ],
        ),
      ),
    ),
  );
}
