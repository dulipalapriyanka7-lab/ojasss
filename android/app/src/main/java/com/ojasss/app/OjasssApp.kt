package com.ojasss.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.webkit.WebView

class OjasssApp : Application() {
    override fun onCreate() {
        super.onCreate()
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        val channels = listOf(
            NotificationChannel("messages", getString(R.string.channel_messages), NotificationManager.IMPORTANCE_HIGH),
            NotificationChannel("social", getString(R.string.channel_social), NotificationManager.IMPORTANCE_DEFAULT),
            NotificationChannel("earnings", getString(R.string.channel_earnings), NotificationManager.IMPORTANCE_DEFAULT),
            NotificationChannel("announcements", getString(R.string.channel_announcements), NotificationManager.IMPORTANCE_LOW),
            NotificationChannel("system", getString(R.string.channel_system), NotificationManager.IMPORTANCE_DEFAULT),
        )
        nm.createNotificationChannels(channels)
    }
}
