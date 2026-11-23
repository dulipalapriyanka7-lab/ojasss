package com.ojasss.app

import android.net.Uri
import androidx.core.net.toUri

/**
 * Navigation policy for the WebView. Only the OJASSS web app is loaded inside the app;
 * everything else opens outside it. Pure logic so it can be unit-tested.
 */
object UrlPolicy {
    private val externalSchemes = setOf("tel", "mailto", "whatsapp", "upi")

    /** Hosts whose pages may load inside the WebView. */
    fun appHosts(appHost: String): Set<String> = if (appHost in setOf("ojasss.com", "new.ojasss.com")) setOf("ojasss.com", "www.ojasss.com", "new.ojasss.com", "www.new.ojasss.com") else setOf(appHost, "www.$appHost")

    fun isInternal(uri: Uri, appHost: String, baseUrl: String): Boolean {
        val base = baseUrl.toUri()
        if (uri.scheme == base.scheme && uri.host == base.host && uri.port == base.port) return true
        return uri.scheme == "https" && uri.host in appHosts(appHost)
    }

    /** External links we are willing to hand to other apps / Custom Tabs. */
    fun isAllowedExternal(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        return when (scheme) {
            "https" -> !uri.host.isNullOrBlank()
            "http" -> false // never open cleartext destinations
            in externalSchemes -> true
            "intent" -> false // arbitrary intent: URIs are refused
            else -> false
        }
    }

    /** OAuth must go through Google or the OJASSS auth backend over HTTPS. */
    fun isAllowedOAuth(uri: Uri): Boolean =
        uri.scheme == "https" && (uri.host == "accounts.google.com" || uri.host?.endsWith(".supabase.co") == true)

    /** Only same-site relative paths are accepted from notifications and deep links. */
    fun safePath(path: String?): String {
        if (path.isNullOrBlank()) return "/"
        if (!path.startsWith("/") || path.startsWith("//") || path.contains('\\')) return "/"
        return if (Regex("^/[A-Za-z0-9/_\\-?=&.%]*$").matches(path)) path else "/"
    }

    /** Paths where pull-to-refresh would fight the page's own scrolling. */
    fun refreshAllowed(path: String): Boolean =
        !(path == "/" || path.startsWith("/messages") || path.startsWith("/upload") || path.startsWith("/admin"))
}
