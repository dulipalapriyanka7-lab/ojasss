import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mime/mime.dart';

typedef Data = Map<String, dynamic>;

Data object(Object? value) => value is Data ? value : <String, dynamic>{};

List<Data> records(Object? value) =>
    value is List ? value.whereType<Data>().toList() : [];

extension Fields on Data {
  String string(String key, [String fallback = '']) =>
      this[key]?.toString() ?? fallback;
  int number(String key) => int.tryParse(string(key)) ?? 0;
  bool flag(String key) => this[key] == true || this[key] == 1;
}

const site = 'https://ojasss.com';
const categories = {
  'entertainment': 'Entertainment',
  'education': 'Educational',
  'world_education': 'World Education',
  'music_dance': 'Music & Dance',
  'horror_stories': 'Horror Stories',
  'technology': 'Technology',
  'gaming': 'Gaming',
  'lifestyle': 'Lifestyle',
  'business_promotion': 'Business Promotion',
  'public_complaint': 'Public Complaint',
  'news': 'News Reporter',
  'part_time_jobs': 'Part Time',
  'full_time_jobs': 'Full Time',
  'one_chance': 'One Chance',
};

String randomKey() {
  final random = Random.secure();
  final bytes = List.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

String googleVerifier() {
  final random = Random.secure();
  return List.generate(
    32,
    (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
}

String googleChallenge(String verifier) =>
    sha256.convert(utf8.encode(verifier)).toString();

class ApiError implements Exception {
  const ApiError(this.message, this.status);
  final String message;
  final int status;
  @override
  String toString() => message;
}

class OjasssApi {
  final _http = HttpClient()..connectionTimeout = const Duration(seconds: 15);
  final _storage = const FlutterSecureStorage();
  Data? _session;
  Future<void>? _refreshing;

  String? get token => _session?['access_token'] as String?;
  Map<String, String> get headers => {
    if (token != null) 'Authorization': 'Bearer $token',
  };

  Future<void> restore() async {
    final saved = await _storage.read(key: 'session');
    if (saved != null) _session = object(jsonDecode(saved));
  }

  Future<void> _save(Data session) async {
    _session = session;
    await _storage.write(key: 'session', value: jsonEncode(session));
  }

  Future<void> signOut() async {
    try {
      if (token != null) await _send('/auth/v1/logout', {});
    } finally {
      _session = null;
      await _storage.delete(key: 'session');
    }
  }

  Future<void> _refresh() async {
    final refresh = _session?['refresh_token'] as String?;
    if (refresh == null) throw const ApiError('Please sign in again.', 401);
    try {
      await _save(
        object(
          await _send('/auth/v1/token?grant_type=refresh_token', {
            'refresh_token': refresh,
          }),
        ),
      );
    } on ApiError catch (error) {
      if (error.status == 400 || error.status == 401) {
        _session = null;
        await _storage.delete(key: 'session');
      }
      rethrow;
    }
  }

  Future<Object?> auth(String action, Data data) async {
    final result = await _send(
      '/auth/v1/$action',
      data,
      method: action == 'user' ? 'PUT' : null,
    );
    final response = object(result);
    final session = response.containsKey('access_token')
        ? response
        : object(response['session']);
    if (action != 'google/poll' && session.containsKey('access_token'))
      await _save(session);
    return result;
  }

  Future<void> completeGoogleSession(Data result) async {
    final session = object(result['session']);
    if (session['access_token'] is! String ||
        session['refresh_token'] is! String) {
      throw const ApiError('Google sign-in did not return a session.', 502);
    }
    await _save(session);
  }

  Future<Object?> rpc(String name, [Data body = const {}]) =>
      request('/rest/v1/rpc/$name', body);
  Future<Object?> invoke(String name, Data body) =>
      request('/functions/v1/$name', body);

  Future<Object?> request(String path, [Data? body]) async {
    final sentToken = token;
    try {
      return await _send(path, body);
    } on ApiError catch (error) {
      if (sentToken == null || error.status != 401) rethrow;
      if (sentToken == token) {
        final refresh = _refreshing ??= _refresh();
        try {
          await refresh;
        } finally {
          if (identical(_refreshing, refresh)) _refreshing = null;
        }
      }
      return _send(path, body);
    }
  }

  Future<Object?> _send(String path, Data? body, {String? method}) async {
    final request = await _http.openUrl(
      method ?? (body == null ? 'GET' : 'POST'),
      Uri.parse('$site/api$path'),
    );
    request.followRedirects = false;
    headers.forEach(request.headers.set);
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    if (body != null) {
      request.headers.contentType = ContentType.json;
      request.add(utf8.encode(jsonEncode(body)));
    }
    return _decode(await request.close().timeout(const Duration(seconds: 25)));
  }

  Future<Object?> _decode(HttpClientResponse response) async {
    final body = await response
        .transform(utf8.decoder)
        .join()
        .timeout(const Duration(seconds: 30));
    Object? result;
    try {
      if (body.isNotEmpty) result = jsonDecode(body);
    } on FormatException {
      if (response.statusCode < 300)
        throw const ApiError('Unexpected server response.', 502);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiError(
        object(
          result,
        ).string('message', 'OJASSS could not complete this request.'),
        response.statusCode,
      );
    }
    return result;
  }

  Uri media(String path, [String bucket = 'media']) => Uri(
    scheme: 'https',
    host: 'ojasss.com',
    pathSegments: [
      'api',
      'storage',
      'v1',
      'object',
      'public',
      bucket,
      ...path.split('/'),
    ],
  );

  Future<String> upload(
    XFile file,
    String user, {
    String bucket = 'media',
  }) async {
    final mime = lookupMimeType(file.name) ?? file.mimeType;
    const extensions = {
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/webm': 'webm',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    final extension = extensions[mime];
    if (extension == null)
      throw const ApiError('Choose a supported photo or video.', 422);
    if (token == null) throw const ApiError('Please sign in first.', 401);
    final expiry = _session?.number('expires_at') ?? 0;
    if (expiry <= DateTime.now().millisecondsSinceEpoch ~/ 1000 + 60) {
      final refresh = _refreshing ??= _refresh();
      try {
        await refresh;
      } finally {
        if (identical(_refreshing, refresh)) _refreshing = null;
      }
    }
    final path = '$user/${randomKey()}.$extension';
    final uri = Uri.parse(
      '$site/api/storage-upload',
    ).replace(queryParameters: {'bucket': bucket, 'path': path});
    final request = await _http.postUrl(uri);
    request.followRedirects = false;
    headers.forEach(request.headers.set);
    request.headers.contentType = ContentType.parse(mime!);
    request.contentLength = await file.length();
    await request
        .addStream(file.openRead())
        .timeout(
          const Duration(minutes: 4),
          onTimeout: () {
            request.abort();
            throw TimeoutException('Media upload timed out.');
          },
        );
    await _decode(await request.close().timeout(const Duration(seconds: 90)));
    return path;
  }
}
