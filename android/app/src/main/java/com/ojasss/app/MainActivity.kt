package com.ojasss.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.RecognitionListener
import android.view.HapticFeedbackConstants
import android.view.View
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.net.toUri
import androidx.core.view.isVisible
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.ojasss.app.push.PushTokens
import org.json.JSONObject
import java.io.File

/**
 * OJASSS Android shell. Hosts the OJASSS web app (the same client and backend as ojasss.com)
 * and adds native capabilities: splash, back navigation, share sheet, camera/gallery upload,
 * external links, deep links, offline handling and push notifications.
 */
class MainActivity : ComponentActivity() {

    companion object {
        const val EXTRA_PATH = "ojasss_path"
    }

    private lateinit var web: WebView
    private lateinit var startupView: View
    private lateinit var errorView: LinearLayout

    private val baseUri: Uri by lazy { BuildConfig.BASE_URL.toUri() }
    private var webModalOpen = false
    private var currentPath = "/"
    private var mainFrameFailed = false
    private var replyProxy: JavaScriptReplyProxy? = null
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingCaptures: List<Uri> = emptyList()
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var pendingLocation: Pair<String, GeolocationPermissions.Callback>? = null
    private var speechRequestId: String? = null
    private var speechRecognizer: SpeechRecognizer? = null
    private var pendingSpeechLanguage: String? = null
    private val microphonePermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val language = pendingSpeechLanguage
        pendingSpeechLanguage = null
        if (speechRequestId != null && language != null) {
            if (granted) beginSpeech(language) else finishSpeech(error = "Microphone permission was denied. Allow it in Android app permissions to record.")
        }
    }
    private val locationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        pendingLocation?.let { (origin, callback) -> callback.invoke(origin, granted, false) }
        pendingLocation = null
    }

    private val fileChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = filePathCallback ?: return@registerForActivityResult
        filePathCallback = null
        val picked = mutableListOf<Uri>()
        if (result.resultCode == RESULT_OK) {
            val data = result.data
            data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) picked += clip.getItemAt(i).uri }
            data?.data?.let { picked += it }
            if (picked.isEmpty()) {
                // Camera capture: the result is in whichever capture file received data.
                pendingCaptures.firstOrNull { uri -> captureFileFor(uri)?.let { it.exists() && it.length() > 0 } == true }
                    ?.let { picked += it }
            }
        }
        pendingCaptures = emptyList()
        callback.onReceiveValue(if (picked.isEmpty()) null else picked.distinct().toTypedArray())
    }

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) sendPushToken()
    }

    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            when {
                errorView.isVisible && web.canGoBack() -> { hideError(); web.goBack() }
                webModalOpen -> postToPage(JSONObject().put("type", "back"))
                web.canGoBack() -> web.goBack()
                currentPath != "/" && !mainFrameFailed -> web.loadUrl(urlFor("/"))
                else -> { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_main)
        web = findViewById(R.id.web)
        startupView = findViewById(R.id.startupView)
        errorView = findViewById(R.id.errorView)
        applyInsets()

        configureWebView()
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        if (android.os.Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        installBridge()
        // Never leave people staring at the splash: show the page after 6 s even if a slow asset is still loading.
        web.postDelayed({ if (!mainFrameFailed) hideStartup() }, 6000)

        findViewById<Button>(R.id.retry).setOnClickListener { retry() }

        onBackPressedDispatcher.addCallback(this, backCallback)
        registerNetworkCallback()

        val hasLaunchDestination = intent?.action == Intent.ACTION_VIEW || intent?.action == "OPEN_OJASSS_LINK" || intent?.hasExtra(EXTRA_PATH) == true
        if (!hasLaunchDestination && savedInstanceState != null && web.restoreState(savedInstanceState) != null) {
            hideStartup()
        } else {
            web.loadUrl(initialUrl(intent))
        }
    }

    // ---------------------------------------------------------------- insets (edge-to-edge)

    private var gameImmersive = false

    private fun setGameImmersive(enabled: Boolean) {
        if (gameImmersive == enabled) return
        gameImmersive = enabled
        requestedOrientation = if (enabled) android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            else android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        WindowCompat.getInsetsController(window, window.decorView).apply {
            systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            if (enabled) hide(WindowInsetsCompat.Type.systemBars()) else show(WindowInsetsCompat.Type.systemBars())
        }
        ViewCompat.requestApplyInsets(findViewById(R.id.root))
    }

    private fun applyInsets() {
        val root = findViewById<View>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            if (gameImmersive) v.setPadding(0, 0, 0, 0)
            else v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }
    }

    // ---------------------------------------------------------------- WebView

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            setGeolocationEnabled(true)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            builtInZoomControls = false
            displayZoomControls = false
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_DEFAULT
            // Faster first paint and smoother video scrolling.
            offscreenPreRaster = true
            userAgentString = "$userAgentString OjasssAndroid/${BuildConfig.VERSION_NAME}"
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebSettingsCompat.setSafeBrowsingEnabled(web.settings, true)
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            // The web app has its own dark theme; never let the WebView invert colours.
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(web.settings, false)
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, false)
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (UrlPolicy.isInternal(uri, BuildConfig.APP_HOST, BuildConfig.BASE_URL)) return false
                openExternal(uri)
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                mainFrameFailed = false
                webModalOpen = false
                replyProxy = null
            }

            override fun onPageCommitVisible(view: WebView, url: String) {
                if (!mainFrameFailed) hideError()
            }

            override fun onPageFinished(view: WebView, url: String) {
                // Wait one frame after scripts finish so the app UI is painted before the loader fades.
                if (!mainFrameFailed && view.url == url) view.postDelayed({ hideStartup() }, 150)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showError(offline = !isOnline())
            }

            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                if (request.isForMainFrame && response.statusCode >= 500) showError(offline = false)
            }

            @SuppressLint("WebViewClientOnReceivedSslError")
            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                // Never proceed past certificate errors.
                handler.cancel()
                showError(offline = false)
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // Renderer crashed or was killed: rebuild the activity instead of crashing the app.
                recreate()
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                val uri = origin.toUri()
                if (uri.scheme != baseUri.scheme || uri.host != baseUri.host || uri.port != baseUri.port || !currentPath.startsWith("/upload")) {
                    callback.invoke(origin, false, false)
                    return
                }
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false)
                } else {
                    pendingLocation?.let { (oldOrigin, oldCallback) -> oldCallback.invoke(oldOrigin, false, false) }
                    pendingLocation = origin to callback
                    locationPermission.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                }
            }

            override fun onGeolocationPermissionsHidePrompt() {
                pendingLocation?.let { (origin, callback) -> callback.invoke(origin, false, false) }
                pendingLocation = null
            }
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    fileChooser.launch(buildChooser(params))
                    true
                } catch (e: ActivityNotFoundException) {
                    filePathCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                // Media capture is native; voice typing uses SpeechRecognizer with runtime mic consent.
                request.deny()
            }
        }

        web.setDownloadListener { url, _, _, _, _ ->
            val uri = url.toUri()
            if (UrlPolicy.isAllowedExternal(uri)) openExternal(uri)
        }
    }

    // ---------------------------------------------------------------- JS bridge (message channel)

    /**
     * Exposes `window.OjasssNative` ONLY to https://ojasss.com (and www). No addJavascriptInterface:
     * the page can send small JSON commands, each validated here; it cannot call arbitrary methods.
     */
    private fun installBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        val origins = mutableSetOf("https://ojasss.com", "https://www.ojasss.com")
        val base = "${baseUri.scheme}://${baseUri.host}${if (baseUri.port != -1) ":${baseUri.port}" else ""}"
        if (BuildConfig.DEBUG || base.startsWith("https://")) origins += base
        WebViewCompat.addWebMessageListener(web, "OjasssNative", origins) { _, message, _, isMainFrame, proxy ->
            if (!isMainFrame) return@addWebMessageListener
            replyProxy = proxy
            val json = runCatching { JSONObject(message.data ?: "") }.getOrNull() ?: return@addWebMessageListener
            handleCommand(json)
        }
    }

    private fun handleCommand(cmd: JSONObject) {
        when (cmd.optString("type")) {
            "ui_ready" -> hideStartup()
            "modal" -> webModalOpen = cmd.optBoolean("open")
            "route" -> {
                currentPath = UrlPolicy.safePath(cmd.optString("path"))
                if (currentPath.substringBefore('?') != "/games") setGameImmersive(false)
            }
            "game_immersive" -> {
                val enabled = cmd.optBoolean("enabled") && web.url?.toUri()?.path == "/games"
                setGameImmersive(enabled)
                postToPage(JSONObject().put("type", "game_immersive").put("enabled", gameImmersive))
            }
            "share" -> share(cmd.optString("title"), cmd.optString("text"), cmd.optString("url"))
            "open_external" -> cmd.optString("url").toUri().takeIf { UrlPolicy.isAllowedExternal(it) }?.let(::openExternal)
            "open_oauth" -> cmd.optString("url").toUri().takeIf { UrlPolicy.isAllowedOAuth(it) }?.let(::openCustomTab)
            "haptic" -> web.performHapticFeedback(
                when {
                    cmd.optString("kind") == "light" -> HapticFeedbackConstants.KEYBOARD_TAP
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.R -> HapticFeedbackConstants.CONFIRM
                    else -> HapticFeedbackConstants.VIRTUAL_KEY
                },
            )
            "request_push_token" -> requestPush()
            "speech_capabilities" -> postToPage(JSONObject().put("type", "speech_capabilities").put("requestId", cmd.optString("requestId").take(80)).put("internal", true).put("available", SpeechRecognizer.isRecognitionAvailable(this)))
            "speech_start" -> {
                if (speechRequestId != null) return
                val requestId = cmd.optString("requestId").take(80)
                val language = cmd.optString("language")
                if (!Regex("^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$").matches(language)) return
                speechRequestId = requestId
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) beginSpeech(language)
                else { pendingSpeechLanguage = language; microphonePermission.launch(Manifest.permission.RECORD_AUDIO) }
            }
            "speech_stop" -> if (cmd.optString("requestId") == speechRequestId) speechRecognizer?.stopListening()
            "speech_cancel" -> if (cmd.optString("requestId") == speechRequestId) finishSpeech(error = "cancelled")
        }
    }

    private fun postToPage(payload: JSONObject) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        runCatching { replyProxy?.postMessage(payload.toString()) }
    }

    // ---------------------------------------------------------------- native capabilities

    private fun hideStartup() {
        if (startupView.visibility != View.VISIBLE || startupView.tag == "hiding") return
        startupView.tag = "hiding"
        startupView.animate().alpha(0f).setDuration(220).withEndAction {
            startupView.visibility = View.GONE
            startupView.alpha = 1f
            startupView.tag = null
        }.start()
    }

    private fun finishSpeech(text: String? = null, error: String? = null) {
        val requestId = speechRequestId ?: return
        speechRequestId = null
        pendingSpeechLanguage = null
        val recognizer = speechRecognizer
        speechRecognizer = null
        recognizer?.destroy()
        val payload = JSONObject().put("type", "speech_result").put("requestId", requestId)
        if (!text.isNullOrBlank()) payload.put("text", text.take(1000)) else payload.put("error", error ?: "No speech detected. Try again.")
        postToPage(payload)
    }

    private fun beginSpeech(language: String) {
        val requestId = speechRequestId ?: return
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { finishSpeech(error = "Speech recognition is unavailable on this device."); return }
        try {
            val recognizer = SpeechRecognizer.createSpeechRecognizer(this)
            speechRecognizer = recognizer
            recognizer.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
                override fun onPartialResults(results: Bundle?) {
                    if (speechRequestId == requestId) postToPage(JSONObject().put("type", "speech_partial").put("requestId", requestId).put("text", results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.take(1000) ?: ""))
                }
                override fun onResults(results: Bundle?) {
                    if (speechRequestId == requestId) finishSpeech(text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull())
                }
                override fun onError(error: Int) {
                    if (speechRequestId != requestId) return
                    finishSpeech(error = when (error) {
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Allow microphone access to use voice typing."
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech detected. Tap Record to try again."
                        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "This language is unavailable in your speech service. Choose another language or type your message."
                        else -> "Voice typing stopped. Check your connection and try again."
                    })
                }
            })
            recognizer.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            })
        } catch (_: Exception) { finishSpeech(error = "Could not start voice typing. Check microphone permission and try again.") }
    }

    private fun share(title: String, text: String, url: String) {
        val link = url.toUri()
        if (!UrlPolicy.isInternal(link, BuildConfig.APP_HOST, BuildConfig.BASE_URL) && link.scheme != "https") return
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title.take(200))
            putExtra(Intent.EXTRA_TEXT, listOf(text.take(300), url).filter { it.isNotBlank() }.joinToString("\n"))
        }
        startActivity(Intent.createChooser(send, getString(R.string.share_via)))
    }

    private fun openExternal(uri: Uri) {
        if (!UrlPolicy.isAllowedExternal(uri)) return
        if (uri.scheme == "https") {
            openCustomTab(uri)
            return
        }
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    private fun openCustomTab(uri: Uri) {
        val colors = CustomTabColorSchemeParams.Builder().setToolbarColor(ContextCompat.getColor(this, R.color.ink)).build()
        try {
            CustomTabsIntent.Builder().setDefaultColorSchemeParams(colors).setShowTitle(true).build().launchUrl(this, uri)
        } catch (e: ActivityNotFoundException) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (e2: ActivityNotFoundException) {
                Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun requestPush() {
        if (!PushTokens.available(this)) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            sendPushToken()
        }
    }

    private fun sendPushToken() {
        PushTokens.fetch(this) { token ->
            runOnUiThread { postToPage(JSONObject().put("type", "push_token").put("token", token)) }
        }
    }

    private fun buildChooser(params: WebChromeClient.FileChooserParams): Intent {
        val accept = params.acceptTypes.flatMap { it.split(',') }.map { it.trim() }.filter { it.isNotEmpty() }
        val wantsImage = accept.isEmpty() || accept.any { it.startsWith("image/") }
        val wantsVideo = accept.isEmpty() || accept.any { it.startsWith("video/") }

        val content = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            if (accept.isNotEmpty()) putExtra(Intent.EXTRA_MIME_TYPES, accept.toTypedArray())
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
        }

        val captures = mutableListOf<Intent>()
        val uris = mutableListOf<Uri>()
        if (wantsImage) newCaptureUri("jpg")?.let { uri ->
            uris += uri
            captures += Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri)
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        if (wantsVideo) newCaptureUri("mp4")?.let { uri ->
            uris += uri
            captures += Intent(MediaStore.ACTION_VIDEO_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri)
                .putExtra(MediaStore.EXTRA_DURATION_LIMIT, 180)
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        pendingCaptures = uris
        return Intent.createChooser(content, getString(R.string.choose_media))
            .putExtra(Intent.EXTRA_INITIAL_INTENTS, captures.toTypedArray())
    }

    private fun newCaptureUri(ext: String): Uri? = runCatching {
        val dir = File(cacheDir, "captures").apply { mkdirs() }
        dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86_400_000 }
            ?.forEach { it.delete() }
        val file = File(dir, "capture-${System.currentTimeMillis()}.$ext")
        FileProvider.getUriForFile(this, "$packageName.files", file)
    }.getOrNull()

    private fun captureFileFor(uri: Uri): File? = uri.lastPathSegment?.let { File(File(cacheDir, "captures"), it) }

    // ---------------------------------------------------------------- errors & connectivity

    private fun showError(offline: Boolean) {
        mainFrameFailed = true
        hideStartup()
        findViewById<TextView>(R.id.errorTitle).setText(if (offline) R.string.offline_title else R.string.error_title)
        findViewById<TextView>(R.id.errorBody).setText(if (offline) R.string.offline_body else R.string.error_body)
        errorView.visibility = View.VISIBLE
    }

    private fun hideError() {
        errorView.visibility = View.GONE
    }

    private fun retry() {
        hideError()
        if (web.url.isNullOrBlank() || web.url == "about:blank") web.loadUrl(urlFor(currentPath)) else web.reload()
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return true
        return cm.activeNetwork != null
    }

    private fun registerNetworkCallback() {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                runOnUiThread {
                    if (errorView.isVisible) retry()
                    postToPage(JSONObject().put("type", "network").put("online", true))
                }
            }

            override fun onLost(network: Network) {
                runOnUiThread { postToPage(JSONObject().put("type", "network").put("online", false)) }
            }
        }
        cm.registerDefaultNetworkCallback(cb)
        networkCallback = cb
    }

    // ---------------------------------------------------------------- deep links

    private fun urlFor(path: String): String = baseUri.buildUpon().encodedPath(null).build().toString().trimEnd('/') + UrlPolicy.safePath(path)

    /** App Links (https://ojasss.com/post/…), notification taps, or the home page. */
    private fun initialUrl(intent: Intent?): String {
        intent?.data?.let { uri ->
            if (intent.action == Intent.ACTION_VIEW && UrlPolicy.isInternal(uri, BuildConfig.APP_HOST, BuildConfig.BASE_URL)) {
                // Keep the query (e.g. /auth/callback?code=…) but always load from our configured origin.
                val path = UrlPolicy.safePath(uri.encodedPath)
                return urlFor(path) + (uri.encodedQuery?.let { "?$it" } ?: "")
            }
        }
        intent?.getStringExtra(EXTRA_PATH)?.let { return urlFor(it) }
        if (intent?.action == "OPEN_OJASSS_LINK") intent.getStringExtra("link")?.let { return urlFor(it) }
        return urlFor("/")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // Opening the launcher again should resume the current WebView. Only
        // an explicit link or notification should navigate to another page.
        if (intent.action == Intent.ACTION_MAIN && intent.data == null && !intent.hasExtra(EXTRA_PATH)) return
        val target = initialUrl(intent)
        val path = target.toUri().encodedPath ?: "/"
        val googleReturn = path == "/auth/callback" && target.toUri().getQueryParameter("google_flow") != null
        if (replyProxy != null && (googleReturn || (!path.startsWith("/auth/callback") && !path.startsWith("/reset-password") && target.toUri().encodedQuery == null))) {
            // SPA navigation keeps state (no reload).
            postToPage(JSONObject().put("type", "deep_link").put("path", path + (if (googleReturn) target.toUri().encodedQuery?.let { "?$it" } ?: "" else "")))
        } else {
            web.loadUrl(target)
        }
    }

    // ---------------------------------------------------------------- lifecycle

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        backCallback.isEnabled = true
        postToPage(JSONObject().put("type", "resume"))
    }

    override fun onPause() {
        if (speechRecognizer != null) finishSpeech(error = "cancelled")
        web.onPause() // pauses video playback and timers
        super.onPause()
    }

    override fun onDestroy() {
        speechRequestId = null
        pendingSpeechLanguage = null
        speechRecognizer?.destroy()
        speechRecognizer = null
        pendingLocation?.let { (origin, callback) -> callback.invoke(origin, false, false) }
        pendingLocation = null
        networkCallback?.let { cb -> runCatching { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(cb) } }
        filePathCallback?.onReceiveValue(null)
        (web.parent as? android.view.ViewGroup)?.removeView(web)
        web.destroy()
        super.onDestroy()
    }
}
