package com.ojasss.ojasss

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.ByteArrayInputStream

class MonsterGameActivity : Activity() {
    companion object {
        private val launchPath = Regex("/play-game/[A-Za-z0-9_-]{1,512}\\.[a-f0-9]{64}/index\\.html")
        fun validPath(path: String) = launchPath.matches(path)
    }

    private var game: WebView? = null
    private var coins = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val path = intent.getStringExtra("path").orEmpty()
        if (!validPath(path)) { finish(); return }
        val folder = path.substringBeforeLast('/') + "/"
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val view = WebView(this)
        view.setBackgroundColor(Color.rgb(12, 14, 22))
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
        }
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !request.isForMainFrame || !isGameUrl(request.url, path)

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                if (isGameUrl(request.url, folder, prefix = true)) return null
                return WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)))
            }
        }
        view.addJavascriptInterface(object {
            @JavascriptInterface fun report(count: Int) = runOnUiThread { coins = count.coerceIn(0, 13) }
            @JavascriptInterface fun close(restart: Boolean) = runOnUiThread { finishGame(restart) }
        }, "NativeMonster")
        game = view
        setContentView(view)
        hideSystemBars()
        view.loadUrl("https://ojasss.com$path")
    }

    private fun isGameUrl(uri: Uri, allowed: String, prefix: Boolean = false): Boolean {
        val path = uri.path ?: return false
        return uri.scheme == "https" && uri.host == "ojasss.com" && uri.port in listOf(-1, 443) &&
            uri.userInfo == null && uri.query == null && uri.fragment == null &&
            (if (prefix) path.startsWith(allowed) else path == allowed)
    }

    private fun hideSystemBars() {
        WindowCompat.getInsetsController(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    @Deprecated("Used for Android back navigation")
    override fun onBackPressed() = finishGame(false)

    private fun finishGame(restart: Boolean) {
        setResult(RESULT_OK, Intent().putExtra("coins", coins).putExtra("restart", restart))
        finish()
    }

    override fun onDestroy() {
        game?.apply {
            removeJavascriptInterface("NativeMonster")
            stopLoading()
            (parent as? android.view.ViewGroup)?.removeView(this)
            destroy()
        }
        game = null
        super.onDestroy()
    }
}
