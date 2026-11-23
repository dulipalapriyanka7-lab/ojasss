package com.ojasss.app.push

import android.Manifest
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import java.net.URL
import java.io.ByteArrayOutputStream
import javax.net.ssl.HttpsURLConnection
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.ojasss.app.MainActivity
import com.ojasss.app.R
import com.ojasss.app.UrlPolicy

/**
 * Receives FCM pushes sent by the push-dispatch edge function. Only runs when the app was
 * built with a google-services.json; otherwise Firebase is never initialised.
 */
class OjasssMessagingService : FirebaseMessagingService() {

    // Firebase Messaging 25.x deprecates the token API in favour of a newer registration flow;
    // it remains functional. Migrate when upgrading Firebase (see docs/ANDROID.md).
    @Suppress("OVERRIDE_DEPRECATION", "DEPRECATION")
    override fun onNewToken(token: String) {
        PushTokens.onNewToken(applicationContext, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = message.notification?.title ?: data["title"] ?: return
        val body = data["body"] ?: message.notification?.body.orEmpty()
        val channel = message.notification?.channelId ?: when (data["type"]) {
            "message" -> "messages"
            "follow", "new_post", "comment", "engagement" -> "social"
            "reward", "withdrawal" -> "earnings"
            "announcement" -> "announcements"
            else -> "system"
        }
        val path = UrlPolicy.safePath(data["link"])
        val intent = Intent(this, MainActivity::class.java).apply {
            putExtra(MainActivity.EXTRA_PATH, path)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(
            this, path.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.drawable.ic_stat_ojasss)
            .setColor(ContextCompat.getColor(this, R.color.brand))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(if (channel == "messages") NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)

        (data["category_label"] ?: data["category"])?.takeIf { it.isNotBlank() }?.let {
            builder.setSubText(it.replace('_', ' '))
        }
        // A bounded first-party image request; text notifications still arrive if it fails.
        val imageUrl = message.notification?.imageUrl?.toString() ?: data["image_url"]
        runCatching {
            val url = URL(imageUrl ?: return@runCatching)
            if (url.protocol != "https" || url.host !in setOf("ojasss.com", "new.ojasss.com") ||
                !url.path.startsWith("/api/storage/v1/object/public/media/")) return@runCatching
            val connection = url.openConnection() as HttpsURLConnection
            try {
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 4000
                connection.readTimeout = 4000
                if (connection.responseCode != 200) return@runCatching
                val bytes = connection.inputStream.use { input ->
                    val output = ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (output.size() <= 1048576) {
                        val count = input.read(buffer, 0, minOf(buffer.size, 1048577 - output.size()))
                        if (count < 0) break
                        output.write(buffer, 0, count)
                    }
                    output.toByteArray()
                }
                if (bytes.size > 1048576) return@runCatching
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                if (bounds.outWidth !in 1..2000 || bounds.outHeight !in 1..2000) return@runCatching
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.let { bitmap ->
                    builder.setLargeIcon(bitmap).setStyle(NotificationCompat.BigPictureStyle()
                        .bigPicture(bitmap).setSummaryText(body))
                }
            } finally { connection.disconnect() }
        }
        val notification = builder.build()

        val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (granted) NotificationManagerCompat.from(this).notify(data["notification_id"]?.hashCode() ?: title.hashCode(), notification)
    }
}
