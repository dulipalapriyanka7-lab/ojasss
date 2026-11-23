package com.ojasss.app.push

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.ojasss.app.BuildConfig

/**
 * FCM token access that degrades gracefully: when the app is built without Firebase config,
 * push is simply unavailable and nothing else is affected.
 */
object PushTokens {
    private const val TAG = "OjasssPush"
    private var listener: ((String) -> Unit)? = null

    fun available(context: Context): Boolean {
        if (!BuildConfig.PUSH_ENABLED) return false
        return try {
            FirebaseApp.getApps(context).isNotEmpty() || FirebaseApp.initializeApp(context) != null
        } catch (e: IllegalStateException) {
            Log.w(TAG, "Firebase unavailable", e)
            false
        }
    }

    /** Fetch the current token; the callback is invoked on success only. */
    @Suppress("DEPRECATION") // see OjasssMessagingService.onNewToken
    fun fetch(context: Context, onToken: (String) -> Unit) {
        listener = onToken
        if (!available(context)) return
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token -> if (!token.isNullOrBlank()) onToken(token) }
            .addOnFailureListener { e -> Log.w(TAG, "Could not get FCM token", e) }
    }

    fun onNewToken(@Suppress("UNUSED_PARAMETER") context: Context, token: String) {
        listener?.invoke(token)
    }
}
