/// Navigation policy for the WebView — a port of android/.../UrlPolicy.kt. Only the OJASSS
/// web app loads inside the app; everything else opens outside it. Pure logic, unit-tested.
class UrlPolicy {
  UrlPolicy({required this.baseUrl, required this.appHost});

  final Uri baseUrl;
  final String appHost;

  static const _externalSchemes = {'tel', 'mailto', 'whatsapp', 'upi'};
  static final _safePath = RegExp(r'^/[A-Za-z0-9/_\-?=&.%]*$');

  Set<String> get appHosts => {appHost, 'www.$appHost'};

  bool isInternal(Uri uri) {
    if (uri.scheme == baseUrl.scheme &&
        uri.host == baseUrl.host &&
        uri.port == baseUrl.port)
      return true;
    return uri.scheme == 'https' && appHosts.contains(uri.host);
  }

  /// External links we are willing to hand to other apps.
  bool isAllowedExternal(Uri uri) {
    final scheme = uri.scheme.toLowerCase();
    if (scheme == 'https') return uri.host.isNotEmpty;
    return _externalSchemes.contains(
      scheme,
    ); // never http:, intent: or anything else
  }

  /// OAuth must go through Google or the OJASSS auth backend over HTTPS.
  bool isAllowedOAuth(Uri uri) =>
      uri.scheme == 'https' &&
      (uri.host == 'accounts.google.com' || uri.host.endsWith('.supabase.co'));

  /// Only same-site relative paths are accepted from deep links and the page.
  static String safePath(String? path) {
    if (path == null || path.isEmpty) return '/';
    if (!path.startsWith('/') || path.startsWith('//') || path.contains(r'\'))
      return '/';
    return _safePath.hasMatch(path) ? path : '/';
  }

  Uri urlFor(String path, [String? query]) {
    final origin = baseUrl
        .replace(path: '', query: null, fragment: null)
        .toString()
        .replaceAll(RegExp(r'/+$'), '');
    return Uri.parse(
      origin +
          safePath(path) +
          (query == null || query.isEmpty ? '' : '?$query'),
    );
  }

  /// App Link → URL to load inside the app, or null if it isn't ours.
  Uri? deepLinkTarget(Uri link) {
    if (!isInternal(link)) return null;
    return urlFor(link.path, link.query);
  }
}
