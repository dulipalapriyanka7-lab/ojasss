package com.ojasss.ojasss

import android.app.Activity
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.*
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.media.MediaRecorder
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.media3.common.*
import androidx.media3.common.audio.SpeedProvider
import androidx.media3.common.audio.ChannelMixingAudioProcessor
import androidx.media3.common.audio.ChannelMixingMatrix
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.*
import androidx.media3.transformer.*
import androidx.core.location.LocationManagerCompat
import androidx.core.os.CancellationSignal
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

@UnstableApi
class MainActivity : FlutterActivity() {
    private var exporter: Transformer? = null
    private var output: File? = null
    private var pending: MethodChannel.Result? = null
    private var musicPicker: MethodChannel.Result? = null
    private var recorder: MediaRecorder? = null
    private var voiceFile: File? = null
    private var locationPermission: MethodChannel.Result? = null
    private var monsterGame: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "ojasss/monster").setMethodCallHandler { call, result ->
            if (call.method != "play") { result.notImplemented(); return@setMethodCallHandler }
            val path = call.argument<String>("path").orEmpty()
            if (!MonsterGameActivity.validPath(path) || monsterGame != null) {
                result.error("GAME", "Unable to open the game.", null)
                return@setMethodCallHandler
            }
            monsterGame = result
            try {
                startActivityForResult(Intent(this, MonsterGameActivity::class.java).putExtra("path", path), 5420)
            } catch (error: Exception) {
                monsterGame = null
                result.error("GAME", error.message, null)
            }
        }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "ojasss/location").setMethodCallHandler { call, result ->
            if (call.method == "detect") requestPostLocation(result) else result.notImplemented()
        }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "ojasss/studio").setMethodCallHandler { call, result ->
            when (call.method) {
                "export" -> export(call.arguments as Map<*, *>, result)
                "progress" -> {
                    val progress = ProgressHolder()
                    result.success(if (exporter?.getProgress(progress) == Transformer.PROGRESS_STATE_AVAILABLE) progress.progress else null)
                }
                "cancel" -> {
                    exporter?.cancel()
                    finishExport("Export cancelled")
                    result.success(null)
                }
                "music" -> {
                    if (musicPicker != null) { result.error("BUSY", "Music picker is open", null); return@setMethodCallHandler }
                    musicPicker = result
                    try {
                        startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("audio/*")
                            .addCategory(Intent.CATEGORY_OPENABLE), 5412)
                    } catch (error: Exception) {
                        musicPicker = null
                        result.error("PICK", error.message, null)
                    }
                }
                "startVoice" -> {
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 5413)
                        result.error("PERMISSION", "Allow microphone access, then tap Record again.", null)
                    } else try {
                        check(recorder == null) { "Recording is already running." }
                        val file = File.createTempFile("studio-voice-", ".m4a", cacheDir)
                        voiceFile = file
                        @Suppress("DEPRECATION")
                        val created = MediaRecorder()
                        recorder = created
                        created.setAudioSource(MediaRecorder.AudioSource.MIC)
                        created.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                        created.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                        created.setOutputFile(file.absolutePath)
                        created.prepare()
                        created.start()
                        result.success(null)
                    } catch (error: Exception) {
                        recorder?.release(); recorder = null
                        voiceFile?.delete(); voiceFile = null
                        result.error("RECORD", error.message, null)
                    }
                }
                "stopVoice" -> {
                    val current = recorder
                    try {
                        checkNotNull(current).stop()
                        result.success(voiceFile?.let { Uri.fromFile(it).toString() })
                    } catch (error: Exception) {
                        voiceFile?.delete()
                        result.error("RECORD", "Record a longer voiceover and try again.", null)
                    } finally {
                        current?.release(); recorder = null; voiceFile = null
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun requestPostLocation(result: MethodChannel.Result) {
        if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            detectPostLocation(result)
        } else if (locationPermission == null) {
            locationPermission = result
            requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION), 5414)
        } else {
            result.error("BUSY", "A location permission request is already open.", null)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != 5414) return
        val result = locationPermission ?: return
        locationPermission = null
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            detectPostLocation(result)
        } else {
            result.error("PERMISSION", "Allow location access in Settings or enter a place.", null)
        }
    }

    @Suppress("DEPRECATION")
    private fun detectPostLocation(result: MethodChannel.Result) {
        val manager = getSystemService(LocationManager::class.java)
        val provider = listOf("fused", LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
            .firstOrNull { it in manager.allProviders && manager.isProviderEnabled(it) }
        if (provider == null) {
            result.error("LOCATION_OFF", "Turn on device location or enter a place.", null)
            return
        }
        val handler = Handler(Looper.getMainLooper())
        val cancellation = CancellationSignal()
        var completed = false
        fun finish(label: String?) {
            if (completed) return
            completed = true
            cancellation.cancel()
            if (label == null) result.error("UNAVAILABLE", "Could not find a place name. Enter it manually or retry.", null)
            else result.success(label)
        }
        val timeout = Runnable { finish(null) }
        fun resolve(fix: Location?) {
            if (completed) return
            if (fix == null) {
                handler.removeCallbacks(timeout)
                finish(null)
                return
            }
            Thread {
                val label = runCatching {
                    val address = Geocoder(applicationContext).getFromLocation(fix.latitude, fix.longitude, 1)?.firstOrNull()
                    listOfNotNull(
                        address?.subLocality,
                        address?.locality ?: address?.subAdminArea,
                        address?.adminArea,
                        address?.countryName,
                    ).filter { it.isNotBlank() }.distinct().joinToString(", ").takeIf { it.isNotEmpty() }
                }.getOrNull()
                handler.post {
                    handler.removeCallbacks(timeout)
                    finish(label)
                }
            }.start()
        }
        handler.postDelayed(timeout, 14000)
        try {
            val recent = manager.getLastKnownLocation(provider)?.takeIf {
                SystemClock.elapsedRealtimeNanos() - it.elapsedRealtimeNanos < 120_000_000_000L
            }
            if (recent != null) resolve(recent)
            else LocationManagerCompat.getCurrentLocation(manager, provider, cancellation, { handler.post(it) }, ::resolve)
        } catch (_: SecurityException) {
            handler.removeCallbacks(timeout)
            finish(null)
        }
    }

    @Deprecated("Activity result callback from Android's document picker")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 5420) {
            monsterGame?.success(mapOf("coins" to (data?.getIntExtra("coins", 0) ?: 0), "restart" to (data?.getBooleanExtra("restart", false) ?: false)))
            monsterGame = null
            return
        }
        if (requestCode != 5412) return
        val result = musicPicker ?: return
        musicPicker = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) { result.success(null); return }
        try { contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: SecurityException) {}
        result.success(uri.toString())
    }

    private fun export(args: Map<*, *>, result: MethodChannel.Result) {
        if (pending != null) { result.error("BUSY", "An export is already running", null); return }
        pending = result
        try {
            val input = File(args["path"] as String)
            require(input.isFile) { "The original video is unavailable." }
            val speed = (args["speed"] as Number).toFloat()
            val music = args["music"] as String?
            val voice = args["voice"] as String?
            val mute = args["mute"] == true
            val effects = mutableListOf<Effect>()
            val rotation = (args["rotation"] as Number).toFloat()
            val flip = args["flip"] == true
            val scale = (args["zoom"] as Number).toFloat()
            if (scale > 1) effects.add(Crop(-1 / scale, 1 / scale, -1 / scale, 1 / scale))
            if (rotation != 0f || flip) effects.add(ScaleAndRotateTransformation.Builder()
                .setRotationDegrees(-rotation).setScale(if (flip) -1f else 1f, 1f).build())
            val ratio = (args["ratio"] as Number).toFloat()
            if (ratio > 0) effects.add(Presentation.createForAspectRatio(ratio, Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP))
            effects.add(Presentation.createForShortSide((args["quality"] as Number).toInt()))
            val saturation = (args["saturation"] as Number).toFloat()
            val brightness = (args["brightness"] as Number).toFloat()
            val contrast = (args["contrast"] as Number).toFloat()
            if (saturation != 0f) effects.add(HslAdjustment.Builder().adjustSaturation(saturation).build())
            if (brightness != 0f) effects.add(Brightness(brightness))
            if (contrast != 0f) effects.add(Contrast(contrast))
            val videoSegments = args["segments"] as List<*>
            val audioTracks = if (mute) setOf(C.TRACK_TYPE_VIDEO) else setOf(C.TRACK_TYPE_AUDIO, C.TRACK_TYPE_VIDEO)
            val main = EditedMediaItemSequence.Builder(audioTracks)
            var offsetUs = 0L
            for (entry in videoSegments) {
                val segment = entry as List<*>
                val start = (segment[0] as Number).toLong()
                val end = (segment[1] as Number).toLong()
                val layers = effects.toMutableList()
                val text = args["text"] as String
                val sticker = args["sticker"] as String
                if (text.isNotBlank() || sticker != "none") layers.add(OverlayEffect(listOf(StudioTitle(
                    text, args["template"] as String, args["animation"] as String, sticker, offsetUs, speed
                ))))
                val media = MediaItem.Builder().setUri(Uri.fromFile(input))
                    .setClippingConfiguration(MediaItem.ClippingConfiguration.Builder()
                        .setStartPositionMs(start).setEndPositionMs(end).build()).build()
                val originalGain = (args["originalVolume"] as Number).toFloat()
                val item = EditedMediaItem.Builder(media).setRemoveAudio(mute)
                    .setEffects(Effects(if (mute || originalGain == 1f) emptyList() else listOf(gain(originalGain)), layers))
                if (speed != 1f) item.setSpeed(object : SpeedProvider {
                    override fun getSpeed(presentationTimeUs: Long) = speed
                    override fun getNextSpeedChangeTimeUs(timeUs: Long) = C.TIME_UNSET
                })
                main.addItem(item.build())
                offsetUs += ((end - start) * 1000 / speed).toLong()
            }
            val sequences = mutableListOf(main.build())
            if (!music.isNullOrEmpty()) {
                sequences.add(EditedMediaItemSequence.Builder(setOf(C.TRACK_TYPE_AUDIO))
                    .addItem(EditedMediaItem.Builder(MediaItem.fromUri(music)).setRemoveVideo(true)
                        .setEffects(Effects(listOf(gain((args["musicVolume"] as Number).toFloat())), emptyList())).build())
                    .setIsLooping(true).build())
            }
            if (!voice.isNullOrEmpty()) {
                val recorded = MediaItem.Builder().setUri(voice)
                    .setClippingConfiguration(MediaItem.ClippingConfiguration.Builder()
                        .setEndPositionMs(offsetUs / 1000).build()).build()
                sequences.add(EditedMediaItemSequence.Builder(setOf(C.TRACK_TYPE_AUDIO))
                    .addItem(EditedMediaItem.Builder(recorded).setRemoveVideo(true).build()).build())
            }
            output = File(cacheDir, "ojasss-studio-${System.currentTimeMillis()}.mp4")
            exporter = Transformer.Builder(this).setVideoMimeType(MimeTypes.VIDEO_H264)
                .setAudioMimeType(MimeTypes.AUDIO_AAC).addListener(object : Transformer.Listener {
                    override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                        finishExport(if ((output?.length() ?: 0L) > 0) null else "The encoder returned an empty video")
                    }
                    override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                        finishExport(exportException.message ?: "The video could not be encoded")
                    }
                }).build()
            exporter!!.start(Composition.Builder(sequences).build(), output!!.absolutePath)
        } catch (error: Exception) {
            finishExport(error.message ?: "Export could not start")
        }
    }

    private fun finishExport(error: String?) {
        val result = pending ?: return
        pending = null
        exporter = null
        if (error == null) result.success(output?.absolutePath)
        else {
            output?.delete()
            result.error("EXPORT", error, null)
        }
        output = null
    }

    override fun onDestroy() {
        recorder?.release()
        voiceFile?.delete()
        exporter?.cancel()
        finishExport("Editor closed")
        super.onDestroy()
    }

    private fun gain(volume: Float) = ChannelMixingAudioProcessor().apply {
        for (count in 1..8) putChannelMixingMatrix(ChannelMixingMatrix.create(count, count).scaleBy(volume))
    }
}

@UnstableApi
private class StudioTitle(
    private val text: String,
    private val template: String,
    private val animation: String,
    private val sticker: String,
    private val offsetUs: Long,
    private val speed: Float,
) : BitmapOverlay() {
    private var frame = -1L
    private var bitmap: Bitmap? = null

    override fun getBitmap(presentationTimeUs: Long): Bitmap {
        val tick = ((presentationTimeUs / speed).toLong() + offsetUs).coerceAtLeast(0L) / 50_000L
        val step = tick.coerceAtMost(60L)
        val key = if (sticker != "none") tick else if (animation == "none") 0L else step
        if (frame == key && bitmap != null) return bitmap!!
        frame = key
        val output = Bitmap.createBitmap(720, 720, Bitmap.Config.ARGB_8888)
        bitmap = output
        val canvas = Canvas(output)
        if (sticker == "sparkle") {
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xffffcb67.toInt() }
            canvas.save()
            canvas.rotate((tick * 6 % 360).toFloat(), 600f, 165f)
            canvas.drawPath(Path().apply {
                moveTo(600f, 117f); lineTo(613f, 151f); lineTo(647f, 165f)
                lineTo(613f, 178f); lineTo(600f, 211f); lineTo(587f, 178f)
                lineTo(553f, 165f); lineTo(587f, 151f); close()
            }, paint)
            canvas.restore()
        }
        if (text.isBlank()) return output
        val theme = when (template) {
            "offer" -> intArrayOf(0xff9f1b2e.toInt(), 0xffe75316.toInt())
            "news" -> intArrayOf(0xff022e53.toInt(), 0xff12628a.toInt())
            "glass" -> intArrayOf(0xb918173a.toInt(), 0xa95e276b.toInt())
            else -> intArrayOf(0xff3c126b.toInt(), 0xffa82f77.toInt())
        }
        val opacity = if (animation == "fade") (step * 23).coerceAtMost(255).toInt() else 255
        val visibleText = if (animation == "typing") {
            val iterator = java.text.BreakIterator.getCharacterInstance().apply { setText(text) }
            var end = iterator.first()
            repeat(step.toInt().coerceAtLeast(1)) { val next = iterator.next(); if (next >= 0) end = next }
            text.substring(0, end)
        } else text
        val top = if (animation == "slide") 508f + (12L - step).coerceAtLeast(0L) * 4 else 508f
        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE; alpha = opacity; textSize = 37f
            typeface = Typeface.create("sans-serif", Typeface.BOLD)
        }
        val layout = StaticLayout.Builder.obtain(visibleText, 0, visibleText.length, paint, 572)
            .setAlignment(Layout.Alignment.ALIGN_CENTER).setMaxLines(3)
            .setEllipsize(android.text.TextUtils.TruncateAt.END).build()
        val back = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(54f, top, 666f, top + layout.height, theme, null, Shader.TileMode.CLAMP)
            alpha = opacity
        }
        canvas.drawRoundRect(54f, top - 10, 666f, top + layout.height + 10, 24f, 24f, back)
        canvas.translate(74f, top)
        layout.draw(canvas)
        return output
    }
}
