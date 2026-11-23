# OJASSS release shrinking rules.
# No JavaScript interfaces are exposed (bridge uses WebViewCompat.addWebMessageListener),
# so no @JavascriptInterface keep rules are needed.

# Firebase Messaging service is referenced from the manifest (kept by default rules).
-keep class com.ojasss.app.push.OjasssMessagingService { *; }

# Keep line numbers for readable crash reports, hide original source file names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
