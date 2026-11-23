# OJASSS — Flutter Android app

A Flutter version of the Android shell in `../android`. It loads the OJASSS web app in a hardened
WebView and speaks the same `OjasssNative` bridge as `web/src/lib/platform.ts`, so web changes
reach the app without an app update.

Features: splash, back navigation, native share, camera/gallery upload, App Links
(`/post`, `/profile`, `/auth/callback`, …), Custom Tabs for Google sign-in, offline screen.
Not yet ported from the Kotlin shell: FCM push, pull-to-refresh.

Security: only the OJASSS origin loads inside the app; other https links, `tel:`, `mailto:`,
`whatsapp:` and `upi:` open outside it; `http:`/`intent:` are refused; TLS errors are never
bypassed; release builds are HTTPS-only. Unlike the Kotlin shell's origin-restricted
WebMessageListener, Flutter's JavaScript channel is injected into every frame, so bridge
commands are ignored unless the current page is an OJASSS page, and commands are validated.

```bash
flutter build apk --release        # signed with ../android/keystore.properties if present
```

Local QA against `tools/local-api` + the Vite dev server over USB:

```bash
adb reverse tcp:5173 tcp:5173 && adb reverse tcp:54321 tcp:54321
flutter run --dart-define=OJASSS_BASE_URL=http://localhost:5173
```

Application ID is `com.ojasss.app.flutter` so it can sit beside the Kotlin app; change it to
`com.ojasss.app` in `android/app/build.gradle.kts` if this build replaces it on the Play Store.
