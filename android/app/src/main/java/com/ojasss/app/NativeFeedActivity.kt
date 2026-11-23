package com.ojasss.app

import android.app.AlertDialog
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.text.InputType
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.CheckBox
import android.widget.Spinner
import android.widget.ArrayAdapter
import android.widget.TextView
import android.widget.Toast
import android.widget.VideoView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.net.HttpURLConnection
import java.net.URL
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.abs

private class FeedApi {
    private val base = BuildConfig.BASE_URL.trimEnd('/')
    @Volatile var token: String? = null

    fun rpc(name: String, body: JSONObject = JSONObject()): Any? = post("/api/rest/v1/rpc/$name", body)
    fun history(id: String): JSONArray = request(
        "/api/rest/v1/messages?conversation_id=eq.${Uri.encode(id)}&limit=40"
    ) as JSONArray

    fun publish(file: File, mime: String, extension: String, owner: String, details: JSONObject, uploadedPath: String?): JSONObject {
        val path = uploadedPath ?: "$owner/${UUID.randomUUID()}.$extension"
        if (uploadedPath == null) request(
            "/api/storage-upload?bucket=media&path=${Uri.encode(path)}", "POST", mime, file.length()
        ) { output -> file.inputStream().use { it.copyTo(output) } }
        return try {
            post("/api/functions/v1/create-post", details.put("mediaPath", path)) as JSONObject
        } catch (e: Exception) { throw PublishFailure(path, e) }
    }

    fun signIn(email: String, password: String): JSONObject {
        val session = post("/api/auth/v1/token?grant_type=password", JSONObject().put("email", email).put("password", password)) as JSONObject
        token = session.getString("access_token")
        return try { rpc("get_me") as JSONObject } catch (error: Exception) {
            token = null
            throw error
        }
    }

    fun media(path: String, bucket: String = "media"): Uri = Uri.parse("$base/api/storage/v1/object/public").buildUpon().apply {
        appendPath(bucket)
        path.split('/').filter { it.isNotEmpty() }.forEach { appendPath(it) }
    }.build()

    fun headers(): Map<String, String> = token?.let { mapOf("Authorization" to "Bearer $it") } ?: emptyMap()

    private fun post(path: String, body: JSONObject): Any? {
        val bytes=body.toString().toByteArray(Charsets.UTF_8)
        return request(path, "POST", "application/json; charset=utf-8", bytes.size.toLong()) { it.write(bytes) }
    }

    private fun request(path: String, method: String = "GET", mime: String? = null, length: Long = 0, write: ((java.io.OutputStream) -> Unit)? = null): Any? {
        val request = URL(base + path).openConnection() as HttpURLConnection
        try {
            request.requestMethod = method
            request.connectTimeout = 12000
            request.readTimeout = 16000
            request.instanceFollowRedirects = false
            if(mime!=null)request.setRequestProperty("Content-Type", mime)
            request.setRequestProperty("Accept", "application/json")
            headers().forEach { (name, value) -> request.setRequestProperty(name, value) }
            if(write!=null){
                request.doOutput = true
                request.setFixedLengthStreamingMode(length)
                request.outputStream.use(write)
            }
            val status = request.responseCode
            val stream = if (status in 200..299) request.inputStream else request.errorStream
            val value = stream?.bufferedReader()?.use { JSONTokener(it.readText()).nextValue() }
            if (status !in 200..299) {
                throw IllegalStateException((value as? JSONObject)?.optString("message")?.takeIf { it.isNotBlank() } ?: "OJASSS could not complete this request.")
            }
            return value
        } finally { request.disconnect() }
    }

    fun image(path: String, bucket: String = "media"): android.graphics.Bitmap? {
        val request = URL(media(path, bucket).toString()).openConnection() as HttpURLConnection
        try {
            request.connectTimeout = 10000
            request.readTimeout = 12000
            request.instanceFollowRedirects = false
            headers().forEach { (name, value) -> request.setRequestProperty(name, value) }
            if (request.responseCode != 200) return null
            return request.inputStream.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = 2 }) }
        } finally { request.disconnect() }
    }
}

private class PublishFailure(val path:String, cause:Exception):IOException(cause.message,cause)

class NativeFeedActivity : ComponentActivity() {
    private val api = FeedApi()
    private val executor = Executors.newFixedThreadPool(3)
    private val feed = mutableListOf<JSONObject>()
    private val ink = 0xff100817.toInt()
    private val violet = 0xff341c46.toInt()
    private val accent = 0xffff83d5.toInt()
    private val secondary = 0xffbdb4c7.toInt()
    private val pageBackground = 0xff0d0b12.toInt()
    private lateinit var root: LinearLayout
    private lateinit var stage: FrameLayout
    private lateinit var headerMode: TextView
    private lateinit var header: LinearLayout
    private lateinit var feedAnnouncement: FrameLayout
    private var announcements = JSONArray()
    private var publicSettings = JSONObject()
    private lateinit var nav: LinearLayout
    private var page = "Home"
    private var returnFromPost: (() -> Unit)? = null
    private var feedView="For You"
    private var video: VideoView? = null
    private var player: android.media.MediaPlayer? = null
    private var profile: JSONObject? = null
    private var category = ""
    private var seed = UUID.randomUUID().toString()
    private var index = 0
    private var offset = 0
    private var loadGeneration = 0
    private var loading = false
    private var more = true
    private var feedEndpoint = "feed"
    private var muted = true
    private var reelPaused = false
    private var started = false
    private var downX = 0f
    private var downY = 0f
    private var swipe = false
    private var splashShowing = true
    private val pickUpload = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if(uri!=null) uploadDetails(uri)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        val startupAt = SystemClock.elapsedRealtime()
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(ink)
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        header = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), 0, dp(4), 0)
        }
        val modeTouch = FrameLayout(this).apply {
            contentDescription = "Choose feed"
            setOnClickListener { showFeedModes() }
            isFocusable = true
        }
        headerMode = label("For You  ⌄", 11f, bold = true).apply {
            background = outlined(0xff1b1621.toInt(), 11)
            setPadding(dp(8), 0, dp(8), 0)
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        modeTouch.addView(headerMode, FrameLayout.LayoutParams(-2, dp(30), Gravity.START or Gravity.CENTER_VERTICAL))
        header.addView(modeTouch, LinearLayout.LayoutParams(0, dp(44), 1f))
        header.addView(brandPill().apply { gravity = Gravity.CENTER }, LinearLayout.LayoutParams(dp(100), dp(29)))
        val quick = LinearLayout(this).apply { gravity = Gravity.END or Gravity.CENTER_VERTICAL }
        val buttonWidth = if (resources.configuration.screenWidthDp < 370) 35 else 42
        quick.addView(iconButton("Announcement", "Announcements", ::showAnnouncements, 17), LinearLayout.LayoutParams(dp(buttonWidth), -1))
        quick.addView(iconButton("Grid", "Browse categories", ::showFeedCategories, 18), LinearLayout.LayoutParams(dp(buttonWidth), -1))
        quick.addView(iconButton("Trophy", "Leaderboard", ::showLeaderboard, 18, gradient(16), 32), LinearLayout.LayoutParams(dp(buttonWidth), -1))
        header.addView(quick, LinearLayout.LayoutParams(0, dp(44), 1f))
        root.addView(header, LinearLayout.LayoutParams(-1, dp(44)))
        feedAnnouncement = FrameLayout(this).apply { visibility = View.GONE }
        root.addView(feedAnnouncement, LinearLayout.LayoutParams(-1, dp(48)).apply {
            setMargins(dp(8), 0, dp(8), dp(3))
        })
        stage = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        root.addView(stage, LinearLayout.LayoutParams(-1, 0, 1f))
        nav=LinearLayout(this).apply {
            background=background(0xff181520.toInt(),23)
            gravity=Gravity.CENTER
            setPadding(dp(3),dp(3),dp(3),dp(3))
        }
        root.addView(nav,LinearLayout.LayoutParams(-1,dp(60)).apply{setMargins(dp(12),dp(5),dp(12),dp(9))})
        renderNav()
        val splash = StartupBrandView(this).apply {
            isClickable=true
            contentDescription="Starting OJASSS"
        }
        val content = FrameLayout(this).apply { addView(root,FrameLayout.LayoutParams(-1,-1));addView(splash,FrameLayout.LayoutParams(-1,-1)) }
        root.importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        setContentView(content)
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val previous = returnFromPost
                when {
                    previous != null -> { returnFromPost = null; previous() }
                    page != "Home" || feedView != "For You" -> switchFeed("")
                    else -> finish()
                }
            }
        })
        content.postDelayed({
            if(isDestroyed)return@postDelayed
            splashShowing=false
            root.importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
            content.removeView(splash)
            if(started&&player!=null&&!reelPaused)video?.start()
        }, (3000-(SystemClock.elapsedRealtime()-startupAt)).coerceAtLeast(0))
        switchFeed("")
        runRequest({ api.rpc("active_announcements") as JSONArray }) { result ->
            result.onSuccess { announcements = it; renderFeedAnnouncement() }
        }
        runRequest({ api.rpc("public_settings") as JSONObject }) { result ->
            result.onSuccess {
                publicSettings = it
                if (page == "Home" || page == "Post") feed.getOrNull(index)?.let(::addActionRail)
            }
        }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun background(color: Int, radius: Int = 14) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radius).toFloat()
    }

    private fun label(value: String, size: Float, color: Int = Color.WHITE, bold: Boolean = false) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        gravity = Gravity.CENTER_VERTICAL
        if (bold) setTypeface(null, Typeface.BOLD)
    }

    private fun chip(value: String, action: () -> Unit) = label(value, 13f, bold = true).apply {
        gravity = Gravity.CENTER
        setPadding(dp(8), 0, dp(8), 0)
        minHeight = dp(44)
        background = background(violet)
        isFocusable = true
        setOnClickListener { action() }
        accessibilityDelegate = object : View.AccessibilityDelegate() {
            override fun onInitializeAccessibilityNodeInfo(host: View, info: android.view.accessibility.AccessibilityNodeInfo) {
                super.onInitializeAccessibilityNodeInfo(host, info)
                info.className = android.widget.Button::class.java.name
            }
        }
    }

    private fun gradient(radius:Int)=GradientDrawable(GradientDrawable.Orientation.TL_BR,
        intArrayOf(0xffff7655.toInt(),0xffe6268a.toInt(),0xff8e28ef.toInt())).apply{cornerRadius=dp(radius).toFloat()}

    private fun outlined(color: Int = 0xff1b1723.toInt(), radius: Int = 12) =
        background(color, radius).apply { setStroke(dp(1), 0xff38303f.toInt()) }

    private fun column() = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

    private fun brandPill() = LinearLayout(this).apply {
        gravity = Gravity.CENTER_VERTICAL
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR,
            intArrayOf(0xff302938.toInt(), 0xff17131e.toInt(), 0xff261421.toInt())).apply {
            cornerRadius = dp(10).toFloat()
            setStroke(dp(1), 0xff4b3d50.toInt())
        }
        setPadding(dp(5), 0, dp(8), 0)
        addView(ImageView(context).apply { setImageResource(R.drawable.brand_launcher) }, LinearLayout.LayoutParams(dp(22), dp(22)))
        addView(label("OJASSS", 13f, bold = true).apply { letterSpacing = .075f },
            LinearLayout.LayoutParams(-2, -1).apply { marginStart = dp(5) })
        contentDescription = "OJASSS home"
        isFocusable = true
        setOnClickListener { switchFeed("") }
    }

    private fun openPage(title: String): LinearLayout {
        returnFromPost = null
        page = title
        loadGeneration++
        releaseVideo()
        header.visibility = View.GONE
        feedAnnouncement.visibility = View.GONE
        stage.removeAllViews()
        stage.setBackgroundColor(pageBackground)
        val screen = column()
        stage.addView(screen, FrameLayout.LayoutParams(-1, -1))
        val top = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), 0, dp(8), 0)
            setBackgroundColor(0xff16131e.toInt())
        }
        top.addView(brandPill(), LinearLayout.LayoutParams(-2, dp(32)))
        top.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        if (title == "Profile") {
            top.addView(iconButton("Announcement", "Announcements", ::showAnnouncements, 18), LinearLayout.LayoutParams(dp(44), -1))
            top.addView(iconButton("Wallet", "Earnings", ::showWallet, 18), LinearLayout.LayoutParams(dp(44), -1))
        } else {
            top.addView(iconButton("Chat", "Messages", ::openInbox), LinearLayout.LayoutParams(dp(44), -1))
        }
        top.addView(iconButton("Bell", "Notifications", ::showNotifications), LinearLayout.LayoutParams(dp(44), -1))
        screen.addView(top, LinearLayout.LayoutParams(-1, dp(52)))
        if (title == "Profile") announcements.optJSONObject(0)?.let { newest ->
            screen.addView(announcementBanner(newest), LinearLayout.LayoutParams(-1, dp(46)).apply {
                setMargins(dp(7), dp(3), dp(7), 0)
            })
        }
        val body = column().apply { setPadding(dp(14), dp(12), dp(14), dp(18)) }
        screen.addView(ScrollView(this).apply { addView(body) }, LinearLayout.LayoutParams(-1, 0, 1f))
        renderNav()
        return body
    }

    private fun renderFeedAnnouncement() {
        feedAnnouncement.removeAllViews()
        val newest = announcements.optJSONObject(0)
        feedAnnouncement.visibility = if ((page == "Home" || page == "Post") && newest != null) View.VISIBLE else View.GONE
        if (newest == null) return
        feedAnnouncement.addView(announcementBanner(newest), FrameLayout.LayoutParams(-1, -1))
    }

    private fun announcementBanner(newest: JSONObject): View {
        val banner = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(5), 0, dp(6), 0)
            background = outlined(0xff381d3e.toInt())
        }
        banner.addView(iconButton("Announcement", "View announcement", ::showAnnouncements, 16, gradient(9), 31),
            LinearLayout.LayoutParams(dp(35), -1).apply { marginEnd = dp(5) })
        val copy = column()
        listOf("Announcement · ${newest.string("title")}", newest.string("message")).forEachIndexed { i, value ->
            copy.addView(label(value, if (i == 0) 12f else 11f, if (i == 0) Color.WHITE else secondary, i == 0).apply {
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            })
        }
        banner.addView(copy, LinearLayout.LayoutParams(0, -2, 1f))
        banner.addView(chip("View") { showAnnouncements() }.apply { background = gradient(10) },
            LinearLayout.LayoutParams(dp(55), -1).apply { marginStart = dp(7); topMargin = dp(2); bottomMargin = dp(2) })
        return banner
    }

    private fun showAnnouncements() {
        val body = openPage("Announcements")
        body.addView(label("Announcements", 24f, bold = true))
        for (i in 0 until announcements.length()) {
            val item = announcements.optJSONObject(i) ?: continue
            body.addView(column().apply {
                background = outlined()
                setPadding(dp(12), dp(9), dp(12), dp(9))
                addView(label(item.string("title"), 16f, bold = true))
                addView(label(item.string("message"), 14f, secondary))
            }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        }
    }

    private fun horizontalRow(body: LinearLayout): LinearLayout {
        val row = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        body.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(row)
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(6) })
        return row
    }

    private fun addFilter(row: LinearLayout, title: String, selected: Boolean, action: () -> Unit) {
        row.addView(chip(title, action).apply {
            background = if (selected) gradient(12) else outlined()
            isSelected = selected
        }, LinearLayout.LayoutParams(-2, dp(44)).apply { marginEnd = dp(6) })
    }

    private fun loadMediaGrid(
        grid: LinearLayout, rpc: String, params: JSONObject, empty: String,
        current: () -> Boolean = { true }, onBack: () -> Unit
    ) {
        var offset = 0
        var pendingTileRow: LinearLayout? = null
        fun load() {
            val status = label("Loading…", 13f, secondary)
            grid.addView(status, LinearLayout.LayoutParams(-1, dp(42)))
            runRequest({ api.rpc(rpc, params.put("p_limit", 12).put("p_offset", offset)) as JSONArray }) { result ->
                if (!current() || !grid.isAttachedToWindow) return@runRequest
                grid.removeView(status)
                result.onSuccess { rows ->
                    if (rows.length() == 0 && offset == 0) grid.addView(label(empty, 14f, secondary))
                    for (i in 0 until rows.length()) {
                        val item = rows.optJSONObject(i) ?: continue
                        val row = pendingTileRow ?: LinearLayout(this).also { grid.addView(it) }
                        val tile = mediaTile(item) {
                            feed.clear()
                            feed.add(item)
                            index = 0
                            more = false
                            loadGeneration++
                            returnFromPost = onBack
                            page = "Post"
                            headerMode.text = "For You  ⌄"
                            header.visibility = View.VISIBLE
                            renderFeedAnnouncement()
                            stage.setBackgroundColor(Color.BLACK)
                            renderNav()
                            showPost()
                        }
                        row.addView(tile, LinearLayout.LayoutParams(0, -2, 1f).apply {
                            setMargins(0, 0, if (pendingTileRow == null) dp(6) else 0, dp(8))
                        })
                        pendingTileRow = if (pendingTileRow == null) {
                            row.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f)); row
                        } else { row.removeViewAt(1); null }
                    }
                    offset += rows.length()
                    if (rows.length() == 12) grid.addView(chip("Load more") {
                        grid.removeViewAt(grid.childCount - 1)
                        load()
                    })
                }.onFailure {
                    grid.addView(chip("Could not load · Try again") {
                        grid.removeViewAt(grid.childCount - 1)
                        load()
                    })
                }
            }
        }
        load()
    }

    private fun mediaTile(post: JSONObject, open: () -> Unit): FrameLayout {
        val isVideo = post.optString("kind") == "video"
        val tile = object : FrameLayout(this) {
            override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
                super.onMeasure(widthMeasureSpec, MeasureSpec.makeMeasureSpec(MeasureSpec.getSize(widthMeasureSpec) * 16 / 9, MeasureSpec.EXACTLY))
            }
        }.apply {
            background = outlined(radius = 13)
            clipToOutline = true
            isFocusable = true
            contentDescription = if (isVideo) "Play video" else "Open poster"
            setOnClickListener { open() }
        }
        val cover = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }
        tile.addView(cover, FrameLayout.LayoutParams(-1, -1))
        val path = post.string(if (isVideo) "thumbnail_path" else "media_path")
        if (path.isNotEmpty()) runRequest({ api.image(path) }) { it.getOrNull()?.let(cover::setImageBitmap) }
        val seconds = post.optLong("duration_ms") / 1000
        val title = if (isVideo && seconds > 0) "▶ %d:%02d".format(seconds / 60, seconds % 60)
            else if (isVideo) "▶ Video" else "Poster"
        tile.addView(label(title, 11f, bold = true).apply {
            background = background(0xbb111018.toInt(), 12)
            setPadding(dp(7), 0, dp(7), 0)
        }, FrameLayout.LayoutParams(-2, dp(24), Gravity.TOP or Gravity.START).apply { setMargins(dp(7), dp(7), 0, 0) })
        tile.addView(label("${post.optInt("views_count")} views  ·  ${post.optInt("hot_count")} Hots", 11f, bold = true).apply {
            background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(0, 0xe6000000.toInt()))
            setPadding(dp(8), dp(5), dp(5), 0)
        }, FrameLayout.LayoutParams(-1, dp(36), Gravity.BOTTOM))
        return tile
    }

    private fun JSONObject.string(key: String) = if (isNull(key)) "" else optString(key)

    private fun iconButton(icon: String, description: String, action: () -> Unit, size: Int = 22,
        plate: android.graphics.drawable.Drawable? = null, plateSize: Int = 32): FrameLayout = FrameLayout(this).apply {
        val center = FrameLayout(context).apply { background = plate }
        center.addView(NativeGlyph(context, icon, Color.WHITE), FrameLayout.LayoutParams(dp(size), dp(size), Gravity.CENTER))
        addView(center, FrameLayout.LayoutParams(dp(plateSize), dp(plateSize), Gravity.CENTER))
        contentDescription=description
        isFocusable=true
        setOnClickListener{action()}
    }

    private fun showFeedCategories() {
        val entries = linkedMapOf("" to "All").apply { putAll(categories) }
        AlertDialog.Builder(this).setTitle("Categories").setItems(entries.values.toTypedArray()) { _, i ->
            switchFeed(entries.keys.elementAt(i))
        }.setNegativeButton("Close", null).show()
    }

    private fun renderNav(){
        nav.removeAllViews()
        val links=listOf<Pair<String,()->Unit>>(
            "Home" to {switchFeed("")}, "Discover" to {showCategories()}, "Create" to {chooseUpload()},
            "One Chance" to {switchFeed("one_chance")}, "Profile" to {showProfile()}
        )
        links.forEach{(name,action)->
            val active=name==page && (page!="Home" || feedView!="One Chance") ||
                (name=="One Chance" && page=="Home" && feedView=="One Chance")
            val button=LinearLayout(this).apply{
                orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;contentDescription=name
                isFocusable=true;setOnClickListener{action()}
            }
            val box=FrameLayout(this)
            if(active||name=="Create")box.background=gradient(if(name=="Create")16 else 11)
            box.addView(NativeGlyph(this,name,if(active||name=="Create")Color.WHITE else 0xffc4bacf.toInt()),
                FrameLayout.LayoutParams(dp(if(name=="Create")28 else 21),dp(if(name=="Create")28 else 21),Gravity.CENTER))
            button.addView(box,LinearLayout.LayoutParams(dp(44),dp(if(name=="Create")44 else 30)))
            if(name!="Create")button.addView(label(name,10f,if(active)Color.WHITE else 0xffc4bacf.toInt()).apply{gravity=Gravity.CENTER})
            nav.addView(button,LinearLayout.LayoutParams(0,-1,1f))
        }
    }

    private fun showFeedModes(){
        val labels=arrayOf("For You","Trending","Refresh")
        AlertDialog.Builder(this).setTitle("Choose feed").setItems(labels){_,index->
            when(index){0->switchFeed("");1->switchFeed("","trending_posts");else->switchFeed(category,feedEndpoint)}
        }.show()
    }

    private fun <T> runRequest(work: () -> T, complete: (Result<T>) -> Unit) {
        if (isDestroyed) return
        executor.execute {
            val result = runCatching(work)
            runOnUiThread { if (!isDestroyed) complete(result) }
        }
    }

    private fun switchFeed(filter: String, endpoint:String="feed") {
        returnFromPost = null
        page = "Home"
        header.visibility = View.VISIBLE
        renderFeedAnnouncement()
        stage.setBackgroundColor(Color.BLACK)
        category = filter
        feedEndpoint=endpoint
        seed = UUID.randomUUID().toString()
        feed.clear()
        index = 0
        offset = 0
        more = true
        loadGeneration++
        loading = false
        feedView=when(endpoint){"my_bookmarks"->"Saved";"user_posts"->"Your posts";"search_posts"->"Search";"trending_posts"->"Trending";else->categories[filter]?: "For You"}
        headerMode.text=feedView+" ⌄"
        renderNav()
        message("Loading videos…", busy = true)
        fetch()
    }

    private fun fetch(next: Boolean = false) {
        if (loading || !more) return
        loading = true
        val generation = loadGeneration
        val parameters = JSONObject().put("p_seed",seed).put("p_mode","for_you").put("p_limit",8).put("p_offset",offset)
        if(feedEndpoint=="user_posts")parameters.put("p_user_id",profile?.optString("id"))
        if (category.isNotEmpty()) parameters.put(if(feedEndpoint=="search_posts")"p_q" else "p_category",category)
        val endpoint=feedEndpoint
        runRequest({ api.rpc(endpoint, parameters) as JSONArray }) { result ->
            if (generation != loadGeneration) return@runRequest
            loading = false
            result.onSuccess { items ->
                offset += items.length()
                more = items.length() == 8
                val known = feed.mapTo(mutableSetOf()) { it.optString("id") }
                val previousSize = feed.size
                for (i in 0 until items.length()) {
                    val item = items.optJSONObject(i) ?: continue
                    if (known.add(item.optString("id"))) feed.add(item)
                }
                if (feed.isEmpty()) message("No posts in this feed.", retry = { switchFeed(category,feedEndpoint) })
                else if (previousSize == 0) showPost()
                else if (next && index + 1 < feed.size) { index++; showPost() }
            }.onFailure {
                if (feed.isEmpty()) message("Could not load the feed.", retry = { message("Loading videos…", busy = true); fetch() })
                else toast("Could not load more videos. Swipe again to retry.")
            }
        }
    }

    private fun releaseVideo() {
        video?.stopPlayback()
        video = null
        player = null
    }

    private fun message(text: String, busy: Boolean = false, retry: (() -> Unit)? = null) {
        releaseVideo()
        stage.removeAllViews()
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(20),dp(20),dp(20),dp(20))
        }
        if (busy) box.addView(ProgressBar(this), LinearLayout.LayoutParams(dp(38),dp(38)))
        box.addView(label(text, 15f), LinearLayout.LayoutParams(-2,dp(52)))
        if (retry != null) box.addView(chip("Try again", retry))
        stage.addView(box, FrameLayout.LayoutParams(-1,-1))
    }

    private fun showPost() {
        val post = feed.getOrNull(index) ?: return
        releaseVideo()
        reelPaused = false
        stage.removeAllViews()
        val id = post.optString("id")
        val path = post.optString("media_path")
        val status = label("Loading…", 13f).apply { gravity = Gravity.CENTER }
        stage.addView(status, FrameLayout.LayoutParams(-1,dp(44),Gravity.CENTER))
        if (post.optString("kind") == "video") {
            val surface = VideoView(this)
            video = surface
            stage.addView(surface, 0, FrameLayout.LayoutParams(-1,-1,Gravity.CENTER))
            surface.setOnPreparedListener { prepared ->
                if (video !== surface) return@setOnPreparedListener
                player = prepared
                prepared.isLooping = true
                prepared.setVolume(if (muted) 0f else 1f, if (muted) 0f else 1f)
                status.visibility = View.GONE
                if (started&&!splashShowing&&!reelPaused) surface.start()
            }
            surface.setOnErrorListener { _, _, _ ->
                if (video === surface) status.text = "Video unavailable · tap to retry"
                status.setOnClickListener { showPost() }
                true
            }
            addPlaybackControls(surface)
            surface.setVideoURI(api.media(path), api.headers())
        } else {
            val image = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
            stage.addView(image, 0, FrameLayout.LayoutParams(-1,-1,Gravity.CENTER))
            runRequest({ api.image(path) }) { result ->
                if (image.parent !== stage) return@runRequest
                val bitmap = result.getOrNull()
                if (bitmap != null) { image.setImageBitmap(bitmap); status.visibility = View.GONE }
                else status.text = "Poster unavailable"
            }
        }
        addReelDetails(post)
        addActionRail(post)
    }

    private fun addActionRail(post: JSONObject) {
        stage.findViewWithTag<View>("reel-actions")?.let(stage::removeView)
        val id = post.string("id")
        val actions = column().apply { gravity = Gravity.CENTER }
        val oneChance = category == "one_chance" && page == "Home"
        val isViral = post.optBoolean("is_viral")
        val compact = stage.height in 1..dp(500)
        val circle = if (compact) 36 else 40
        val home = publicSettings.optJSONObject("home.controls")
        fun visible(key: String) = home?.optBoolean(key, true) ?: true
        fun action(name: String, text: String? = null, active: Boolean = false,
            extra: View? = null, invoke: () -> Unit): TextView {
            val tone = when (name) {
                "Fire" -> if (active) 0xffff733d.toInt() else Color.WHITE
                "Viral" -> if (active) 0xffe0b4ff.toInt() else 0xffff9a68.toInt()
                "Save" -> if (active) 0xffe8a6ff.toInt() else Color.WHITE
                else -> Color.WHITE
            }
            val control=LinearLayout(this).apply{
                orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER
                contentDescription=listOfNotNull(name,text).joinToString(", ")
                minimumHeight = dp(44)
                isFocusable=true;setOnClickListener{invoke()}
            }
            val button = FrameLayout(this).apply {
                background = when (name) {
                    "Chat" -> gradient(24)
                    "Viral" -> outlined(if (active) 0xe548245d.toInt() else 0xe538211b.toInt(), 24)
                    else -> outlined(0xbd12111a.toInt(), 24)
                }
            }
            val fill = active && name in listOf("Fire", "Viral", "Save")
            button.addView(NativeGlyph(this, name, tone, fill),
                FrameLayout.LayoutParams(dp(22), dp(22), Gravity.CENTER))
            control.addView(button, LinearLayout.LayoutParams(dp(circle), dp(circle)))
            if (extra != null) control.addView(extra, LinearLayout.LayoutParams(dp(51), -2).apply { topMargin = dp(3) })
            val counter = label(text.orEmpty(), 10f, Color.WHITE, true).apply {
                gravity = Gravity.CENTER
                setPadding(dp(5), 0, dp(5), 0)
                if (name != "Chat") background = background(0xa8000000.toInt(), 8)
            }
            if (text != null) control.addView(counter, LinearLayout.LayoutParams(-2, dp(13)).apply { topMargin = dp(2) })
            actions.addView(control, LinearLayout.LayoutParams(dp(52), -2).apply { topMargin = dp(if (compact) 2 else 4) })
            return counter
        }
        if (visible("hearts") && !oneChance && !(isViral && post.string("kind") == "video")) {
            action("Fire", post.optInt("hot_count").toString(), post.optBoolean("my_hot")) { react(post) }.tag = id
        }
        val hotGoal = maxOf(10, publicSettings.optInt("engagement.hot_threshold", 10))
        val shareGoal = maxOf(10, publicSettings.optInt("engagement.share_threshold", 10))
        val progress = if (oneChance) null else column().apply {
            background = outlined(0xe523182d.toInt(), 8)
            setPadding(dp(4), dp(2), dp(4), dp(2))
            listOf(Triple("Fire", post.optInt("hot_count"), hotGoal), Triple("Share", post.optInt("shares_count"), shareGoal)).forEach { (icon, count, goal) ->
                val color = if (count >= goal) 0xffffcf8c.toInt() else 0xffe1d6e7.toInt()
                addView(LinearLayout(context).apply {
                    gravity = Gravity.CENTER_VERTICAL
                    addView(NativeGlyph(context, icon, color), LinearLayout.LayoutParams(dp(10), dp(10)))
                    addView(label("${minOf(count, goal)}/$goal", 9f, color, true),
                        LinearLayout.LayoutParams(-2, dp(12)).apply { marginStart = dp(3) })
                })
            }
        }
        val source = post.string("source_category").ifBlank { post.string("category") }
        val access = publicSettings.optJSONObject("one_chance.category_access")?.optJSONArray("entry")
        val canEnter = post.string("kind") == "video" && (access?.let { values ->
            (0 until values.length()).any { values.optString(it) == source }
        } ?: (source == "entertainment"))
        if (visible("viral")) action("Viral", if (isViral && canEnter) "Position" else "Viral", isViral, progress) {
            val message=if(isViral)"This video has reached Viral."
                else "${post.optInt("hot_count")}/$hotGoal Fires · ${post.optInt("shares_count")}/$shareGoal Shares"
            AlertDialog.Builder(this).setTitle("Viral").setMessage(message).setPositiveButton("Close",null).show()
        }
        if (visible("speak")) action("Speak",post.optInt("comments_count").toString()){showComments(id)}
        lateinit var save:TextView
        if (visible("save")) save=action("Save",post.optInt("bookmarks_count").toString(),post.optBoolean("my_bookmarked")){
            if(profile==null){showSignIn();return@action}
            val control=save.parent as View
            control.isEnabled=false
            runRequest({api.rpc("toggle_bookmark",JSONObject().put("p_post_id",id)) as JSONObject}){result->
                control.isEnabled=true
                result.onSuccess{
                    val marked=it.optBoolean("bookmarked")
                    post.put("my_bookmarked",marked).put("bookmarks_count",it.optInt("bookmarks_count"))
                    if ((page == "Home" || page == "Post") && feed.getOrNull(index) === post) addActionRail(post)
                }.onFailure{toast(it.message?:"Could not save.")}
            }
        }
        if (visible("share")) action("Share",post.optInt("shares_count").toString()){share(id)}
        if (visible("more")) action("Chat","Chat"){openInbox()}
        if (visible("more")) action("More"){
            AlertDialog.Builder(this).setTitle("Post options").setItems(arrayOf("Share link","Reload video")){_,which->
                if(which==0)share(id) else showPost()
            }.show()
        }
        val scroll = ScrollView(this).apply {
            tag = "reel-actions"
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            addView(actions)
        }
        stage.addView(scroll,FrameLayout.LayoutParams(dp(52),-2,Gravity.END or Gravity.BOTTOM).apply{
            setMargins(0, dp(48), dp(5), dp(9))
        })
    }

    private fun addPlaybackControls(surface: VideoView) {
        val group = LinearLayout(this).apply {
            background = outlined(0xc018151e.toInt(), 24)
            gravity = Gravity.CENTER_VERTICAL
        }
        fun button(icon: String, description: String, fill: Boolean, onTap: (NativeGlyph, View) -> Unit) {
            val glyph = NativeGlyph(this, icon, Color.WHITE, fill)
            group.addView(FrameLayout(this).apply {
                isFocusable = true
                contentDescription = description
                addView(glyph, FrameLayout.LayoutParams(dp(19), dp(19), Gravity.CENTER))
                setOnClickListener { onTap(glyph, this) }
            }, LinearLayout.LayoutParams(dp(43), dp(44)))
        }
        val playback = publicSettings.optJSONObject("home.controls")
        var togglePlay: (() -> Unit)? = null
        if (playback?.optBoolean("pause", true) != false) button("Pause", "Pause video", true) { glyph, control ->
            reelPaused = !reelPaused
            if (reelPaused) surface.pause() else if (player != null) surface.start()
            glyph.update(icon = if (reelPaused) "Play" else "Pause")
            control.contentDescription = if (reelPaused) "Play video" else "Pause video"
        }
        if (group.childCount != 0) togglePlay = { group.getChildAt(0).performClick() }
        surface.setOnClickListener { togglePlay?.invoke() }
        if (playback?.optBoolean("mute", true) != false) button(if (muted) "Mute" else "Sound", if (muted) "Unmute video" else "Mute video", false) { glyph, control ->
            muted = !muted
            val volume = if (muted) 0f else 1f
            player?.setVolume(volume, volume)
            glyph.update(icon = if (muted) "Mute" else "Sound")
            control.contentDescription = if (muted) "Unmute video" else "Mute video"
        }
        if (group.childCount != 0) stage.addView(group, FrameLayout.LayoutParams(-2, dp(44), Gravity.TOP or Gravity.START).apply {
            topMargin = dp(8); marginStart = dp(10)
        })
    }

    private fun addReelDetails(post: JSONObject) {
        val details = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12),dp(13),dp(9),dp(10))
            background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(0, 0xd0000000.toInt()))
        }
        val handle="@"+post.optString("author_username","creator")
        val categoryLabel=categories[post.optString("source_category",post.optString("category"))]
        val origin = post.string("content_origin")
        if (origin == "copy_paste" || origin == "new_content") {
            val copy = origin == "copy_paste"
            details.addView(label(if (copy) "Copy-Paste" else "New Content", 10f, bold = true).apply {
                background = outlined(if (copy) 0xc25c3472.toInt() else 0xc2205652.toInt(), 12)
                setPadding(dp(8), 0, dp(8), 0)
            }, LinearLayout.LayoutParams(-2, dp(22)).apply { bottomMargin = dp(4) })
        }
        val identity = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        val author = JSONObject().put("display_name", post.string("author_display_name")).put("username", post.string("author_username"))
            .put("avatar_path", post.string("author_avatar_path"))
        identity.addView(profileAvatar(author, 34), LinearLayout.LayoutParams(dp(34), dp(34)))
        val lines = column()
        val display = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        display.addView(label(post.string("author_display_name").ifBlank { handle }, 13f, bold = true).apply {
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }, LinearLayout.LayoutParams(-2, -2).apply { weight = 1f })
        if (post.optBoolean("author_verified")) display.addView(NativeGlyph(this, "Verify", 0xff8bbaff.toInt()),
            LinearLayout.LayoutParams(dp(13), dp(13)).apply { marginStart = dp(4) })
        lines.addView(display)
        categoryLabel?.let { lines.addView(label(it, 10f, 0xfff0eaf2.toInt())) }
        val uploaded = runCatching {
            val value = post.string("created_at")
            val iso = if (value.contains('.')) "yyyy-MM-dd'T'HH:mm:ss.SSSXXX" else "yyyy-MM-dd'T'HH:mm:ssXXX"
            val date = java.text.SimpleDateFormat(iso, java.util.Locale.ROOT).parse(value)
            date?.let { java.text.SimpleDateFormat("dd-MM h:mm a", java.util.Locale.getDefault()).format(it) }
        }.getOrNull()
        lines.addView(label(listOfNotNull(handle, uploaded).joinToString(" · "), 10f, 0xffd6cedd.toInt()).apply {
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        })
        identity.addView(lines, LinearLayout.LayoutParams(0, -2, 1f).apply { marginStart = dp(8) })
        details.addView(identity)
        val caption=post.optString("caption").takeIf { it.isNotBlank() && it != "null" }
        if(caption!=null)details.addView(label(caption,11f).apply { maxLines=2; ellipsize = android.text.TextUtils.TruncateAt.END })
        stage.addView(details,FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM).apply { marginEnd = dp(62) })
    }

    private fun react(post: JSONObject) {
        if (profile == null) { showSignIn(); return }
        val id = post.optString("id")
        val control = stage.findViewWithTag<TextView>(id) ?: return
        val tapTarget=control.parent as View
        tapTarget.isEnabled=false
        runRequest({ api.rpc("toggle_engagement", JSONObject().put("p_post_id",id).put("p_kind","hot")) as JSONObject }) { result ->
            tapTarget.isEnabled=true
            result.onSuccess {
                post.put("hot_count",it.optInt("hot_count")).put("my_hot",it.optBoolean("my_hot"))
                if (it.has("is_viral")) post.put("is_viral", it.optBoolean("is_viral"))
                if ((page == "Home" || page == "Post") && feed.getOrNull(index) === post) addActionRail(post)
            }.onFailure { toast(it.message ?: "Could not update reaction.") }
        }
    }

    private fun share(id: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,"https://ojasss.com/post/$id")
        startActivity(Intent.createChooser(send,"Share OJASSS post"))
    }

    private val categories=linkedMapOf(
        "entertainment" to "Entertainment","education" to "Educational","world_education" to "World Education",
        "music_dance" to "Music & Dance","horror_stories" to "Horror Stories","technology" to "Technology",
        "gaming" to "Gaming","lifestyle" to "Lifestyle","business_promotion" to "Business Promotion",
        "news" to "News Reporter","part_time_jobs" to "Part Time","full_time_jobs" to "Full Time","one_chance" to "One Chance"
    )

    private fun showCategories() {
        val body = openPage("Discover")
        body.addView(label("Discover", 24f, bold = true))
        body.addView(label("Fresh videos. New creators.", 13f, secondary))
        val search = EditText(this).apply {
            hint = "Search videos or creators"
            setSingleLine()
            setTextColor(Color.WHITE)
            setHintTextColor(secondary)
            setPadding(dp(12), 0, dp(12), 0)
            background = outlined()
            imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH
        }
        body.addView(search, LinearLayout.LayoutParams(-1, dp(46)).apply { topMargin = dp(12) })
        val categoryRow = horizontalRow(body)
        val types = horizontalRow(body)
        val results = column()
        body.addView(results)
        var filter = ""
        var kind = ""
        var language = ""
        var revision = 0
        val available = linkedMapOf("" to "All")
        available.putAll(categories.filterKeys { it != "one_chance" })
        fun refresh() {
            val request = ++revision
            val term = search.text.toString().trim()
            val searching = term.length >= 2
            results.removeAllViews()
            results.addView(label(if (searching) "Search results" else "Trending", 17f, bold = true), LinearLayout.LayoutParams(-1, dp(43)))
            val grid = column()
            results.addView(grid)
            loadMediaGrid(grid, if (searching) "search_posts" else "trending_posts", JSONObject().apply {
                if (searching) put("p_q", term)
                if (filter.isNotEmpty()) put("p_category", filter)
                if (kind.isNotEmpty()) put("p_kind", kind)
                if (language.isNotEmpty()) put("p_language", language)
            }, "No posts found.", { request == revision }) { showCategories() }
        }
        fun drawFilters() {
            categoryRow.removeAllViews()
            available.forEach { (value, title) ->
                addFilter(categoryRow, title, value == filter) { filter = value; drawFilters(); refresh() }
            }
            types.removeAllViews()
            mapOf("" to "All", "video" to "Videos", "poster" to "Posters").forEach { (value, title) ->
                addFilter(types, title, value == kind) { kind = value; drawFilters(); refresh() }
            }
            val languageOptions = linkedMapOf("" to "All languages", "en" to "English", "te" to "Telugu",
                "hi" to "Hindi", "ta" to "Tamil", "ml" to "Malayalam", "kn" to "Kannada")
            addFilter(types, languageOptions.getValue(language), language.isNotEmpty()) {
                AlertDialog.Builder(this).setTitle("Language").setItems(languageOptions.values.toTypedArray()) { _, i ->
                    language = languageOptions.keys.elementAt(i)
                    drawFilters()
                    refresh()
                }.show()
            }
        }
        search.addTextChangedListener(object : android.text.TextWatcher {
            private val update = Runnable { if (body.isAttachedToWindow) refresh() }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                search.removeCallbacks(update)
                search.postDelayed(update, 350)
            }
            override fun afterTextChanged(s: android.text.Editable?) = Unit
        })
        drawFilters()
        refresh()
    }

    private fun showLeaderboard(){
        if (profile == null) { showSignIn(::showLeaderboard); return }
        val body = openPage("Leaderboard")
        body.addView(label("Leaderboard", 25f, bold = true))
        body.addView(label("Weekly Competition Rankings", 13f, secondary))
        val actions = horizontalRow(body)
        addFilter(actions, "Group Chat", false) {
            if (profile == null) showSignIn()
            else runRequest({ api.rpc("join_one_chance_chat") as String }) { result ->
                result.onSuccess { showChat(it, "Viral Creators") }
                    .onFailure { toast(it.message ?: "Could not open Group Chat.") }
            }
        }
        addFilter(actions, "Create Video", false, ::chooseUpload)
        val status = label("Loading this week’s standings…", 14f, secondary)
        body.addView(status)
        runRequest({ api.rpc("competition_live", JSONObject().put("p_limit", 30)) as JSONObject }) { result ->
            if (!body.isAttachedToWindow) return@runRequest
            body.removeView(status)
            result.onSuccess { standings ->
                val competition = standings.optJSONObject("competition")
                val challenges = competition?.optJSONArray("challenges")
                val challenge = column().apply {
                    background = gradient(16)
                    setPadding(dp(13), dp(10), dp(13), dp(10))
                }
                challenge.addView(label("This week’s challenge", 14f, bold = true))
                if (challenges != null) for (i in 0 until challenges.length()) {
                    challenge.addView(label(challenges.optString(i), 17f, bold = true))
                }
                val end = competition?.string("end").orEmpty()
                val timing = label("", 13f, Color.WHITE, true)
                challenge.addView(timing)
                body.addView(challenge, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
                val endTime = listOf("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX").firstNotNullOfOrNull { pattern ->
                    runCatching { java.text.SimpleDateFormat(pattern, java.util.Locale.ROOT).parse(end)?.time }.getOrNull()
                }
                val timer = object : Runnable {
                    override fun run() {
                        if (!body.isAttachedToWindow) return
                        val left = endTime?.minus(System.currentTimeMillis())
                        timing.text = when {
                            standings.optBoolean("locked") || (left != null && left <= 0) -> "Weekly competition closed"
                            left == null -> "Weekly competition"
                            else -> "Ends in %02dd %02dh %02dm".format(left / 86400000, left / 3600000 % 24, left / 60000 % 60)
                        }
                        if (left != null && left > 0) body.postDelayed(this, 15000)
                    }
                }
                timer.run()
                val totals = standings.optJSONObject("totals") ?: JSONObject()
                val metrics = horizontalRow(body)
                val seconds = standings.optLong("viewer_active_seconds")
                listOf("Total votes" to totals.optInt("votes").toString(), "Total views" to totals.optInt("views").toString(),
                    "Viral videos" to totals.optInt("viral").toString(),
                    "Your active time" to "%02dh %02dm".format(seconds / 3600, seconds / 60 % 60)).forEach { (name, count) ->
                    metrics.addView(column().apply {
                        background = outlined()
                        gravity = Gravity.CENTER
                        addView(label(count, 15f, Color.WHITE, true))
                        addView(label(name, 10f, secondary))
                    }, LinearLayout.LayoutParams(dp(82), dp(56)).apply { marginEnd = dp(5) })
                }
                val targets = competition?.optJSONObject("config")?.optJSONArray("targets")
                val groups = standings.optJSONObject("top_groups")
                listOf("Gold", "Silver", "Platinum", "Emerald", "Bronze").forEachIndexed { i, tier ->
                    val colors = listOf(0xffefc979, 0xffdbe1f1, 0xffe2d4fb, 0xff7ee1b5, 0xffefaa80)
                    val color = colors[i].toInt()
                    val card = column().apply {
                        background = outlined(radius = 14).apply { setStroke(dp(1), color) }
                        setPadding(dp(13), dp(9), dp(13), dp(9))
                    }
                    val target = targets?.optInt(i)?.takeIf { it > 0 }
                    card.addView(label("%02d   %s".format(i + 1, tier), 17f, color, true))
                    val entries = groups?.optJSONArray((i + 1).toString()) ?: JSONArray()
                    if (entries.length() == 0) card.addView(label(
                        if (target == null) "No qualified creators yet" else "Reach $target qualified videos to unlock",
                        13f, secondary))
                    for (j in 0 until entries.length()) {
                        val entry = entries.optJSONObject(j) ?: continue
                        card.addView(label("@${entry.string("username")}  ·  ${entry.optInt("votes")} votes  ·  ${entry.optInt("views")} views", 13f))
                    }
                    body.addView(card, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
                }
            }.onFailure { body.addView(chip("Could not load standings · Try again", ::showLeaderboard)) }
        }
    }

    private fun showComments(id:String) {
        val body=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(16),dp(4),dp(16),dp(8)) }
        val rows=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
        body.addView(ScrollView(this).apply{addView(rows)},LinearLayout.LayoutParams(-1,dp(200)))
        val field=EditText(this).apply{hint="Say what’s on your mind";maxLines=3}
        val status=label("Loading replies…",12f,accent)
        if(profile!=null)body.addView(field)
        body.addView(status)
        val dialog=AlertDialog.Builder(this).setTitle("Speak").setView(body).setNegativeButton("Close",null).setPositiveButton(if(profile==null)"Sign in" else "Send",null).show()
        val args=JSONObject().put("p_post_id",id)
        fun reload(){
            runRequest({api.rpc("list_comments",JSONObject().put("p_post_id",id).put("p_limit",20)) as JSONArray}){result->
                if(!dialog.isShowing)return@runRequest
                result.onSuccess{items->
                    rows.removeAllViews()
                    for(i in 0 until items.length()){
                        val reply=items.optJSONObject(i)?:continue
                        val handle=reply.optJSONObject("author")?.optString("username").orEmpty()
                        rows.addView(label("@$handle\n"+reply.optString("body"),14f).apply{setPadding(0,dp(6),0,dp(6))})
                    }
                    status.text=if(items.length()==0)"No replies yet." else ""
                }.onFailure{status.text=it.message?:"Could not load replies."}
            }
        }
        val send=dialog.getButton(AlertDialog.BUTTON_POSITIVE)
        send.setOnClickListener{
            if(profile==null){dialog.dismiss();showSignIn();return@setOnClickListener}
            val text=field.text.toString().trim()
            if(text.isEmpty()||text.length>1000){status.text="Enter 1–1,000 characters.";return@setOnClickListener}
            send.isEnabled=false
            runRequest({api.rpc("add_comment",args.put("p_body",text).put("p_language",profile?.optString("preferred_language","en")?:"en"))}){result->
                send.isEnabled=true
                result.onSuccess{field.setText("");reload()}.onFailure{status.text=it.message?:"Could not send."}
            }
        }
        reload()
    }

    private fun openInbox() {
        if(profile==null){showSignIn();return}
        val options=arrayOf("Messages","Notifications")
        AlertDialog.Builder(this).setTitle("Inbox").setItems(options){_,index->
            if(index==0) showConversations() else showNotifications()
        }.show()
    }

    private fun listDialog(title:String,subtitle:String="Loading…",work:()->JSONArray,row:(JSONObject)->String,select:((JSONObject)->Unit)?=null) {
        val body=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(4),dp(20),dp(8)) }
        val scroll=ScrollView(this).apply { addView(body) }
        body.addView(label(subtitle,14f))
        val dialog=AlertDialog.Builder(this).setTitle(title).setView(scroll).setNegativeButton("Close",null).show()
        runRequest(work){result->
            if(!dialog.isShowing)return@runRequest
            body.removeAllViews()
            result.onSuccess { items ->
                if(items.length()==0)body.addView(label("Nothing here yet.",14f))
                for(i in 0 until items.length()){
                    val item=items.optJSONObject(i)?:continue
                    val display=row(item)
                    val text=if(select==null) label(display,14f) else chip(display){dialog.dismiss();select(item)}
                    text.setPadding(dp(8),dp(8),dp(8),dp(8))
                    body.addView(text,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(6)})
                }
            }.onFailure { body.addView(label(it.message?:"Could not load. Close and try again.",14f)) }
        }
    }

    private fun showConversations() = listDialog("Messages",work={api.rpc("list_conversations",JSONObject().put("p_limit",30)) as JSONArray},
        row={ it.optString("other_display_name","Conversation") + it.optString("last_message_preview").takeIf { value->value.isNotBlank()&&value!="null" }?.let { value->"\n$value" }.orEmpty() },
        select={ showChat(it.optString("id"),it.optString("other_display_name","Messages")) })

    private fun showChat(id:String,title:String) {
        val body=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,dp(14),dp(8)) }
        val messages=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
        val scroll=ScrollView(this).apply{addView(messages)}
        val field=EditText(this).apply{hint="Write a message";maxLines=3}
        val status=label("",12f,accent)
        body.addView(scroll,LinearLayout.LayoutParams(-1,dp(260)))
        body.addView(field);body.addView(status)
        val dialog=AlertDialog.Builder(this).setTitle(title).setView(body).setNegativeButton("Close",null).setNeutralButton("Refresh",null).setPositiveButton("Send",null).show()
        fun refresh(){
            status.text="Loading messages…"
            runRequest({api.history(id)}){result->
                if(!dialog.isShowing)return@runRequest
                result.onSuccess { items->
                    messages.removeAllViews()
                    for(i in items.length()-1 downTo 0){
                        val item=items.optJSONObject(i)?:continue
                        val mine=item.optString("sender_id")==profile?.optString("id")
                        val text=label((if(mine)"You: " else "")+item.optString("body"),14f)
                        text.setPadding(dp(8),dp(5),dp(8),dp(5))
                        if(mine)text.setBackgroundColor(violet)
                        messages.addView(text)
                    }
                    status.text=if(items.length()==0)"No messages yet." else ""
                    scroll.post{scroll.fullScroll(View.FOCUS_DOWN)}
                    runRequest({api.rpc("mark_conversation_read",JSONObject().put("p_conversation_id",id))}){}
                }.onFailure { status.text=it.message?:"Could not load messages." }
            }
        }
        val send=dialog.getButton(AlertDialog.BUTTON_POSITIVE)
        send.setOnClickListener{
            val message=field.text.toString().trim()
            if(message.isEmpty()||message.length>2000){status.text="Enter 1–2,000 characters.";return@setOnClickListener}
            send.isEnabled=false
            runRequest({api.rpc("send_message",JSONObject().put("p_conversation_id",id).put("p_body",message))}){result->
                send.isEnabled=true
                result.onSuccess { field.setText("");if(dialog.isShowing)refresh() }.onFailure { status.text=it.message?:"Could not send." }
            }
        }
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener{refresh()}
        refresh()
    }

    private fun showNotifications() = listDialog("Notifications",work={api.rpc("list_notifications",JSONObject().put("p_limit",30)) as JSONArray},
        row={it.optString("title")+"\n"+it.optString("body")},select={ item->
            runRequest({api.rpc("mark_notifications_read",JSONObject().put("p_ids",JSONArray().put(item.optString("id"))))}){}
            val link=item.optString("link")
            if(link.matches(Regex("/post/[a-fA-F0-9-]{36}"))){
                runRequest({api.rpc("get_post",JSONObject().put("p_post_id",link.substringAfterLast('/'))) as JSONArray}){result->
                    val post=result.getOrNull()?.optJSONObject(0)
                    if(post==null)toast("Post unavailable.") else {loadGeneration++;loading=false;more=false;feed.clear();feed.add(post);index=0;showPost()}
                }
            }else AlertDialog.Builder(this).setTitle(item.optString("title")).setMessage(item.optString("body")).setPositiveButton("Close",null).show()
        })

    private fun showWallet() {
        runRequest({api.rpc("get_wallet") as JSONObject}){result->
            result.onSuccess { wallet ->
                fun amount(key:String)=java.text.NumberFormat.getCurrencyInstance(java.util.Locale.forLanguageTag("en-IN")).format(wallet.optLong(key)/100.0)
                AlertDialog.Builder(this).setTitle("Wallet")
                    .setMessage("Available  "+amount("available_paise")+"\n\nIn review  "+amount("pending_paise")+"\n\nTotal earned  "+amount("lifetime_paise"))
                    .setPositiveButton("Close",null).show()
            }.onFailure{toast(it.message?:"Could not load wallet.")}
        }
    }

    private fun showTasks() = listDialog("My tasks",work={
        val legacy=api.rpc("my_member_tasks") as JSONArray
        val challenge=(api.rpc("challenge_public") as JSONObject).optJSONArray("tasks")?:JSONArray()
        for(i in 0 until challenge.length())legacy.put(challenge.optJSONObject(i))
        legacy
    },row={ it.optString("title")+"\n"+it.optInt("progress").toString()+"/"+it.optInt("target")+" completed" })

    private fun chooseUpload() {
        if(profile==null){showSignIn();return}
        pickUpload.launch(arrayOf("video/mp4","video/webm","video/quicktime","image/jpeg","image/png","image/webp"))
    }

    private fun uploadDetails(uri:Uri) {
        val owner=profile?:return
        val mime=contentResolver.getType(uri).orEmpty()
        val extension=mapOf("video/mp4" to "mp4","video/webm" to "webm","video/quicktime" to "mov","image/jpeg" to "jpg","image/png" to "png","image/webp" to "webp")[mime]
        if(extension==null){toast("Choose a supported video or image.");return}
        val isVideo=mime.startsWith("video/")
        val form=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(18),0,dp(18),dp(10))}
        val scroll=ScrollView(this).apply{addView(form)}
        val caption=EditText(this).apply{hint=if(isVideo)"Caption (optional)" else "Poster caption";maxLines=4}
        val selectedCategories=categories.filterKeys{it!="one_chance"}
        fun spinner(values:List<String>)=Spinner(this).apply {
            adapter=ArrayAdapter(this@NativeFeedActivity,android.R.layout.simple_spinner_dropdown_item,values)
            minimumHeight=dp(46)
        }
        val categoryInput=spinner(selectedCategories.values.toList())
        val origin=spinner(listOf("New Content","Copy-Paste"))
        val rights=CheckBox(this).apply{text="I have permission to share this video";visibility=View.GONE}
        origin.onItemSelectedListener=object:android.widget.AdapterView.OnItemSelectedListener{
            override fun onNothingSelected(parent:android.widget.AdapterView<*>?)=Unit
            override fun onItemSelected(parent:android.widget.AdapterView<*>?,view:View?,position:Int,id:Long){rights.visibility=if(position==1)View.VISIBLE else View.GONE}
        }
        val country=EditText(this).apply{hint="Country code (e.g. IN)";setSingleLine();setText(owner.optString("country").takeUnless{it=="null"}.orEmpty())}
        val language=EditText(this).apply{hint="Language code (e.g. en, te)";setSingleLine();setText(owner.optString("preferred_language","en"))}
        val status=label("",13f,accent)
        form.addView(caption)
        form.addView(label("Category",13f));form.addView(categoryInput)
        if(isVideo){form.addView(label("Content source",13f));form.addView(origin);form.addView(rights)}
        form.addView(country);form.addView(language);form.addView(status)
        val dialog=AlertDialog.Builder(this).setTitle(if(isVideo)"Publish video" else "Publish poster").setView(scroll)
            .setNegativeButton("Cancel",null).setPositiveButton("Publish",null).show()
        val submit=dialog.getButton(AlertDialog.BUTTON_POSITIVE)
        val cancel=dialog.getButton(AlertDialog.BUTTON_NEGATIVE)
        var uploaded:String?=null
        submit.setOnClickListener {
            val captionText=caption.text.toString().trim()
            val countryCode=country.text.toString().trim().uppercase(java.util.Locale.ROOT)
            val languageCode=language.text.toString().trim().lowercase(java.util.Locale.ROOT)
            val copy=isVideo&&origin.selectedItemPosition==1
            if((!isVideo&&captionText.isEmpty())||captionText.length>2000||!countryCode.matches(Regex("[A-Z]{2}"))||!languageCode.matches(Regex("[a-z]{2,3}"))||(copy&&!rights.isChecked)){
                status.text="Check the caption, country, language and sharing permission.";return@setOnClickListener
            }
            val body=JSONObject().put("kind",if(isVideo)"video" else "poster").put("caption",captionText)
                .put("category",selectedCategories.keys.elementAt(categoryInput.selectedItemPosition)).put("country",countryCode).put("language",languageCode).put("visibility","public")
            if(isVideo)body.put("contentOrigin",if(copy)"copy_paste" else "new_content")
            if(copy)body.put("repost",JSONObject().put("sourceUrl","").put("rightsConfirmed",true))
            val previous=uploaded
            submit.isEnabled=false;cancel.isEnabled=false;dialog.setCancelable(false);status.text="Uploading and publishing…"
            runRequest({
                val file=File.createTempFile("ojasss-upload-",".${extension}",cacheDir)
                try{
                    val settings=api.rpc("public_settings") as JSONObject
                    val maximum=(if(isVideo)settings.optLong("uploads.max_video_mb",100) else settings.optLong("uploads.max_image_mb",10))*1048576
                    contentResolver.openInputStream(uri)?.use { source ->
                        file.outputStream().use { target ->
                            val buffer=ByteArray(65536);var total=0L
                            while(true){val read=source.read(buffer);if(read<0)break;total+=read;require(total<=maximum){"File exceeds the upload limit."};target.write(buffer,0,read)}
                        }
                    }?:throw IOException("Could not read the selected file.")
                    if(isVideo) {
                        val metadata=android.media.MediaMetadataRetriever()
                        try{
                            metadata.setDataSource(file.absolutePath)
                            val duration=metadata.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?:0
                            require(duration in 1..settings.optLong("uploads.max_video_seconds",180)*1000){"Video exceeds the duration limit or could not be read."}
                            body.put("durationMs",duration)
                            metadata.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()?.let{body.put("width",it)}
                            metadata.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()?.let{body.put("height",it)}
                        }finally{metadata.release()}
                    }
                    api.publish(file,mime,extension,owner.optString("id"),body,previous)
                }finally{file.delete()}
            }){result->
                submit.isEnabled=true;cancel.isEnabled=true;dialog.setCancelable(true)
                result.onSuccess{dialog.dismiss();toast(if(it.optString("status")=="published")"Published" else "Submitted");switchFeed("")}
                    .onFailure{if(it is PublishFailure)uploaded=it.path;status.text=it.message?:"Could not publish. Try again."}
            }
        }
    }

    private fun showProfile(tab: String = "Videos") {
        val me = profile
        if (me == null) { showSignIn { showProfile(tab) }; return }
        val body = openPage("Profile")
        val name = me.string("display_name").ifBlank { me.string("username") }
        val stories = horizontalRow(body)
        runRequest({ api.rpc("list_statuses", JSONObject().put("p_limit", 20)) as JSONArray }) { result ->
            if (!stories.isAttachedToWindow) return@runRequest
            result.onSuccess { rows ->
                for (i in 0 until rows.length()) {
                    val story = rows.optJSONObject(i) ?: continue
                    val owner = story.optJSONObject("profile") ?: continue
                    val title = if (story.string("user_id") == me.string("id")) "My Status"
                        else owner.string("display_name").ifBlank { owner.string("username") }
                    stories.addView(column().apply {
                        gravity = Gravity.CENTER
                        contentDescription = "View $title"
                        isFocusable = true
                        setOnClickListener { showStatus(story, tab) }
                        addView(profileAvatar(owner, 52), LinearLayout.LayoutParams(dp(52), dp(52)))
                        addView(label(title, 11f, secondary).apply {
                            gravity = Gravity.CENTER
                            maxLines = 1
                            ellipsize = android.text.TextUtils.TruncateAt.END
                        }, LinearLayout.LayoutParams(-1, dp(22)))
                    }, LinearLayout.LayoutParams(dp(72), dp(76)))
                }
            }
        }
        val identity = column().apply {
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR,
                intArrayOf(0xff331a36.toInt(), 0xff201329.toInt(), 0xff15111e.toInt())).apply {
                cornerRadius = dp(18).toFloat()
                setStroke(dp(1), 0xff453045.toInt())
            }
            setPadding(dp(14), dp(14), dp(14), dp(14))
        }
        val identityRow = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        identityRow.addView(profileAvatar(me, 64), LinearLayout.LayoutParams(dp(64), dp(64)))
        val names = column()
        val display = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        display.addView(label(name, 19f, bold = true).apply {
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }, LinearLayout.LayoutParams(-2, -2).apply { weight = 1f })
        if (me.optBoolean("is_verified")) display.addView(NativeGlyph(this, "Verify", 0xff8bbaff.toInt()),
            LinearLayout.LayoutParams(dp(16), dp(16)).apply { marginStart = dp(5) })
        names.addView(display)
        names.addView(label("@${me.string("username")}", 13f, secondary))
        if (me.optBoolean("has_viral_badge")) names.addView(profileIconLabel("Fire", "VIRAL creator", 0xffeab4ff.toInt(), 10f).apply {
            background = outlined(0xff43234c.toInt(), 12)
            setPadding(dp(7), 0, dp(8), 0)
        }, LinearLayout.LayoutParams(-2, dp(22)).apply { topMargin = dp(4) })
        identityRow.addView(names, LinearLayout.LayoutParams(0, -2, 1f).apply { marginStart = dp(12) })
        identity.addView(identityRow)
        me.string("bio").takeIf { it.isNotEmpty() }?.let {
            identity.addView(label(it, 13f, secondary), LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(9) })
        }
        body.addView(identity, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(7) })
        val actions = LinearLayout(this)
        val profileActions = listOf<Triple<String, String, () -> Unit>>(
            Triple("Edit", "Edit profile", { editProfile(me) }),
            Triple("Trophy", "One Chance", { switchFeed("one_chance") }),
            Triple("Save", "Saved", { showProfile("Saved") })
        )
        profileActions.forEachIndexed { i, (icon, title, tap) ->
            val action = column().apply {
                gravity = Gravity.CENTER
                background = outlined(0xff1a1721.toInt())
                contentDescription = title
                isFocusable = true
                setOnClickListener { tap() }
                addView(NativeGlyph(context, icon, 0xffd7b7ff.toInt()), LinearLayout.LayoutParams(dp(17), dp(17)))
                addView(label(title, 10f, bold = true), LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(3) })
            }
            actions.addView(action, LinearLayout.LayoutParams(0, dp(49), 1f).apply { if (i != 0) marginStart = dp(7) })
        }
        body.addView(actions, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(9) })
        val metrics = LinearLayout(this)
        listOf(Triple("Videos", "Posts", "posts_count"), Triple("Profile", "Respected by", "followers_count"),
            Triple("Verify", "Respecting", "following_count")).forEachIndexed { i, (icon, title, key) ->
            if (i > 0) metrics.addView(View(this).apply { setBackgroundColor(0xff2d2635.toInt()) },
                LinearLayout.LayoutParams(dp(1), dp(36)).apply { gravity = Gravity.CENTER_VERTICAL })
            metrics.addView(column().apply {
                gravity = Gravity.CENTER
                val color = listOf(0xffffad72, 0xffff8fbc, 0xff82cfff)[i].toInt()
                addView(profileIconLabel(icon, me.optInt(key).toString(), color, 17f))
                addView(label(title, 11f, secondary))
            }, LinearLayout.LayoutParams(0, dp(54), 1f))
        }
        body.addView(metrics, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(9) })
        me.string("created_at").take(10).takeIf { it.length == 10 }?.let {
            val joined = runCatching {
                val date = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ROOT).parse(it)
                java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.getDefault()).format(date!!)
            }.getOrDefault(it)
            body.addView(profileIconLabel("Calendar", "Joined $joined", secondary, 12f), LinearLayout.LayoutParams(-1, dp(32)))
        }
        val tools = horizontalRow(body)
        tools.addView(profileIconLabel("Verify", "My tasks", 0xffd7b7ff.toInt(), 12f).apply {
            isFocusable = true
            setOnClickListener { showTasks() }
        }, LinearLayout.LayoutParams(-2, dp(44)).apply { marginEnd = dp(18) })
        tools.addView(profileIconLabel("More", "Account", secondary, 12f).apply {
            isFocusable = true
            setOnClickListener {
                AlertDialog.Builder(context).setTitle("Sign out?").setNegativeButton("Cancel", null)
                    .setPositiveButton("Sign out") { _, _ -> api.token = null; profile = null; switchFeed("") }.show()
            }
        }, LinearLayout.LayoutParams(-2, dp(44)))
        val tabs = LinearLayout(this)
        body.addView(tabs, LinearLayout.LayoutParams(-1, dp(45)))
        val grid = column()
        body.addView(grid, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(9) })
        var revision = 0
        fun select(selected: String) {
            val request = ++revision
            tabs.removeAllViews()
            listOf("Videos" to "Videos", "Posters" to "Posters", "Viral" to "Fire", "Saved" to "Save").forEach { (title, icon) ->
                val current = selected == title
                val color = when {
                    title == "Viral" -> 0xffff88ce.toInt()
                    current -> Color.WHITE
                    else -> secondary
                }
                val item = column().apply {
                    gravity = Gravity.CENTER
                    isSelected = current
                    isFocusable = true
                    contentDescription = title
                    setOnClickListener { select(title) }
                    addView(profileIconLabel(icon, title, color, 11f).apply { gravity = Gravity.CENTER },
                        LinearLayout.LayoutParams(-1, 0, 1f))
                    addView(View(context).apply {
                        if (current) background = gradient(2) else setBackgroundColor(0xff302838.toInt())
                    }, LinearLayout.LayoutParams(-1, dp(2)))
                }
                tabs.addView(item, LinearLayout.LayoutParams(0, -1, 1f))
            }
            grid.removeAllViews()
            val params = JSONObject().put("p_user_id", me.string("id"))
                .put("p_kind", if (selected == "Posters") "poster" else "video")
                .put("p_viral_only", selected == "Viral")
            loadMediaGrid(grid, if (selected == "Saved") "my_bookmarks" else "user_posts", params,
                if (selected == "Viral") "No viral videos yet." else "Nothing to show yet.",
                { request == revision }) { showProfile(selected) }
        }
        select(tab)
    }

    private fun profileIconLabel(icon: String, title: String, color: Int, size: Float) = LinearLayout(this).apply {
        gravity = Gravity.CENTER_VERTICAL
        addView(NativeGlyph(context, icon, color), LinearLayout.LayoutParams(dp(14), dp(14)))
        addView(label(title, size, if (size >= 16) Color.WHITE else color, bold = true).apply {
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }, LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(5) })
    }

    private fun profileAvatar(person: JSONObject, size: Int): FrameLayout {
        val avatar = FrameLayout(this).apply { background = gradient(size) }
        val initial = person.string("display_name").ifBlank { person.string("username") }.take(1).uppercase()
        avatar.addView(label(initial, size * 0.36f, bold = true).apply {
            gravity = Gravity.CENTER
            background = background(violet, size)
        }, FrameLayout.LayoutParams(-1, -1).apply { setMargins(dp(2), dp(2), dp(2), dp(2)) })
        val path = person.string("avatar_path")
        if (path.isNotEmpty()) {
            val image = ImageView(this).apply {
                background = background(violet, size)
                clipToOutline = true
                scaleType = ImageView.ScaleType.CENTER_CROP
                visibility = View.INVISIBLE
            }
            avatar.addView(image, FrameLayout.LayoutParams(-1, -1).apply { setMargins(dp(2), dp(2), dp(2), dp(2)) })
            runRequest({ api.image(path, "avatars") }) { it.getOrNull()?.let { bitmap ->
                image.setImageBitmap(bitmap)
                image.visibility = View.VISIBLE
            } }
        }
        return avatar
    }

    private fun showStatus(story: JSONObject, tab: String) {
        val body = openPage("Status")
        returnFromPost = { showProfile(tab) }
        val author = story.optJSONObject("profile")
        body.addView(label(author?.string("display_name").orEmpty(), 18f, bold = true))
        val path = story.string("media_path")
        if (story.string("mime_type").startsWith("video/")) {
            val view = VideoView(this)
            video = view
            body.addView(view, LinearLayout.LayoutParams(-1, dp(420)))
            view.setOnPreparedListener { if (video === view) { player = it; if (started) view.start() } }
            view.setVideoURI(api.media(path), api.headers())
        } else {
            val image = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER; adjustViewBounds = true }
            body.addView(image, LinearLayout.LayoutParams(-1, -2))
            runRequest({ api.image(path) }) { result ->
                result.getOrNull()?.let(image::setImageBitmap) ?: body.addView(label("Status unavailable.", 14f, secondary))
            }
        }
        story.string("caption").takeIf { it.isNotBlank() }?.let { body.addView(label(it, 14f)) }
    }

    private fun editProfile(me:JSONObject){
        val form=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(18),0,dp(18),dp(8))}
        val name=EditText(this).apply{hint="Display name";setSingleLine();setText(me.optString("display_name"))}
        val bio=EditText(this).apply{hint="Bio";maxLines=4;setText(me.optString("bio").takeUnless{it=="null"}.orEmpty())}
        val status=label("",12f,accent)
        form.addView(name);form.addView(bio);form.addView(status)
        val dialog=AlertDialog.Builder(this).setTitle("Edit profile").setView(form).setNegativeButton("Cancel",null).setPositiveButton("Save",null).show()
        val save=dialog.getButton(AlertDialog.BUTTON_POSITIVE)
        save.setOnClickListener{
            val display=name.text.toString().trim()
            val text=bio.text.toString().trim()
            if(display.isEmpty()||display.length>50||text.length>280){status.text="Use a name up to 50 characters and a bio up to 280.";return@setOnClickListener}
            save.isEnabled=false
            runRequest({api.rpc("update_profile",JSONObject().put("p_display_name",display).put("p_bio",text)) as JSONObject}){result->
                save.isEnabled=true
                result.onSuccess{profile=it;dialog.dismiss();showProfile();toast("Profile saved.")}
                    .onFailure{status.text=it.message?:"Could not save profile."}
            }
        }
    }

    private fun showSignIn(after: () -> Unit = { switchFeed(category) }) {
        val form=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(dp(22),0,dp(22),0) }
        val email=EditText(this).apply { hint="Email address"; inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS }
        val password=EditText(this).apply { hint="Password"; inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }
        val status=label("",12f,accent)
        form.addView(email);form.addView(password);form.addView(status)
        val dialog=AlertDialog.Builder(this).setTitle("Sign in to OJASSS").setView(form)
            .setNegativeButton("Cancel",null).setPositiveButton("Sign in",null).create()
        dialog.show()
        val submit=dialog.getButton(AlertDialog.BUTTON_POSITIVE)
        submit.setOnClickListener {
            if(email.text.isNullOrBlank()||password.text.isNullOrBlank()){status.text="Enter your email and password.";return@setOnClickListener}
            val address=email.text.toString().trim()
            val secret=password.text.toString()
            submit.isEnabled=false;status.text="Signing in…"
            runRequest({api.signIn(address,secret)}){result->
                submit.isEnabled=true
                result.onSuccess { profile=it;dialog.dismiss();after() }
                    .onFailure { status.text=it.message?:"Sign-in failed. Try again." }
            }
        }
    }

    private fun toast(text: String) = Toast.makeText(this,text,Toast.LENGTH_SHORT).show()

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.rawX; downY = event.rawY
                val bounds = android.graphics.Rect()
                swipe = page == "Home" && stage.getGlobalVisibleRect(bounds) && bounds.contains(downX.toInt(),downY.toInt())
            }
            MotionEvent.ACTION_UP -> {
                val dy = event.rawY-downY
                if (swipe && abs(dy)>dp(70) && abs(dy)>abs(event.rawX-downX)*1.25f && feed.isNotEmpty()) {
                    val cancel=MotionEvent.obtain(event)
                    cancel.action=MotionEvent.ACTION_CANCEL
                    super.dispatchTouchEvent(cancel)
                    cancel.recycle()
                    if (dy<0) {
                        if (index+1<feed.size) { index++;showPost() } else fetch(next=true)
                    } else if (index>0) { index--;showPost() }
                    return true
                }
            }
        }
        return super.dispatchTouchEvent(event)
    }

    override fun onStart() { super.onStart(); started=true; if(player!=null&&!splashShowing&&!reelPaused)video?.start() }
    override fun onStop() { started=false; video?.pause(); super.onStop() }
    override fun onDestroy() { releaseVideo(); executor.shutdownNow(); super.onDestroy() }
}

