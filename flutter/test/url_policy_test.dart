import 'package:flutter_test/flutter_test.dart';
import 'package:ojasss/url_policy.dart';

void main() {
  final p = UrlPolicy(baseUrl: Uri.parse('https://ojasss.com'), appHost: 'ojasss.com');

  test('only the OJASSS origin loads inside the app', () {
    expect(p.isInternal(Uri.parse('https://ojasss.com/post/1')), isTrue);
    expect(p.isInternal(Uri.parse('https://www.ojasss.com/')), isTrue);
    expect(p.isInternal(Uri.parse('http://ojasss.com/')), isFalse);
    expect(p.isInternal(Uri.parse('https://ojasss.com.evil.io/')), isFalse);
    expect(p.isInternal(Uri.parse('https://evil.io/?u=ojasss.com')), isFalse);
  });

  test('a local dev base URL is internal', () {
    final dev = UrlPolicy(baseUrl: Uri.parse('http://localhost:5173'), appHost: 'ojasss.com');
    expect(dev.isInternal(Uri.parse('http://localhost:5173/upload')), isTrue);
    expect(dev.isInternal(Uri.parse('http://localhost:54321/')), isFalse);
  });

  test('external links: https and app schemes only', () {
    expect(p.isAllowedExternal(Uri.parse('https://wa.me/91999')), isTrue);
    expect(p.isAllowedExternal(Uri.parse('tel:+91999')), isTrue);
    expect(p.isAllowedExternal(Uri.parse('upi://pay?pa=x')), isTrue);
    expect(p.isAllowedExternal(Uri.parse('http://example.com')), isFalse);
    expect(p.isAllowedExternal(Uri.parse('intent://x#Intent;end')), isFalse);
    expect(p.isAllowedExternal(Uri.parse('javascript:alert(1)')), isFalse);
    expect(p.isAllowedExternal(Uri.parse('file:///sdcard/x')), isFalse);
  });

  test('OAuth only via Google or Supabase over https', () {
    expect(p.isAllowedOAuth(Uri.parse('https://accounts.google.com/o/oauth2')), isTrue);
    expect(p.isAllowedOAuth(Uri.parse('https://abc.supabase.co/auth/v1/authorize')), isTrue);
    expect(p.isAllowedOAuth(Uri.parse('https://evil.io/supabase.co')), isFalse);
  });

  test('safePath rejects anything but same-site paths', () {
    expect(UrlPolicy.safePath('/post/abc'), '/post/abc');
    expect(UrlPolicy.safePath('//evil.io'), '/');
    expect(UrlPolicy.safePath('https://evil.io'), '/');
    expect(UrlPolicy.safePath(r'/\evil'), '/');
    expect(UrlPolicy.safePath('/x"><script>'), '/');
    expect(UrlPolicy.safePath(null), '/');
  });

  test('deep links keep the query but always use the configured origin', () {
    expect(p.deepLinkTarget(Uri.parse('https://www.ojasss.com/auth/callback?code=abc'))?.toString(),
        'https://ojasss.com/auth/callback?code=abc');
    expect(p.deepLinkTarget(Uri.parse('https://evil.io/post/1')), isNull);
  });
}
