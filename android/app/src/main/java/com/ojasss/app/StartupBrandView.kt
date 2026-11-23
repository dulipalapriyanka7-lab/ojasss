package com.ojasss.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.View
import android.view.animation.LinearInterpolator
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/** Shown until the web startup UI is ready to take over. */
class StartupBrandView(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val logo by lazy { BitmapFactory.decodeResource(resources, R.drawable.brand_logo_full, BitmapFactory.Options().apply { inSampleSize = 2 }) }
    private val shape = Path()
    private val image = RectF()
    private var phase = 0f
    private var animator: ValueAnimator? = null
    private fun dp(value: Float) = value * resources.displayMetrics.density

    private fun syncAnimation() {
        if (!isAttachedToWindow || !isShown || windowVisibility != VISIBLE) {
            animator?.cancel()
            animator = null
            return
        }
        if (animator != null) return
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 4000L
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            addUpdateListener { phase = it.animatedValue as Float; invalidate() }
            start()
        }
    }
    override fun onAttachedToWindow() { super.onAttachedToWindow(); syncAnimation() }
    override fun onDetachedFromWindow() { animator?.cancel(); animator = null; super.onDetachedFromWindow() }
    override fun onVisibilityChanged(changedView: View, visibility: Int) { super.onVisibilityChanged(changedView, visibility); syncAnimation() }
    override fun onWindowVisibilityChanged(visibility: Int) { super.onWindowVisibilityChanged(visibility); syncAnimation() }

    private fun star(canvas: Canvas, x: Float, y: Float, radius: Float) {
        shape.reset()
        shape.moveTo(x, y - radius)
        shape.lineTo(x + radius * .23f, y - radius * .24f)
        shape.lineTo(x + radius * .72f, y)
        shape.lineTo(x + radius * .23f, y + radius * .24f)
        shape.lineTo(x, y + radius)
        shape.lineTo(x - radius * .23f, y + radius * .24f)
        shape.lineTo(x - radius * .72f, y)
        shape.lineTo(x - radius * .23f, y - radius * .24f)
        shape.close()
        paint.color = 0xffffe8a2.toInt()
        canvas.drawPath(shape, paint)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (width == 0 || height == 0) return
        val cx = width / 2f
        val cy = height * .40f
        val radius = min(min(width * .425f, height * .29f), dp(170f))
        canvas.drawColor(0xff100516.toInt())
        paint.shader = RadialGradient(cx, cy, radius * 1.8f, intArrayOf(0xff35134b.toInt(), 0xff100516.toInt()), null, Shader.TileMode.CLAMP)
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
        paint.shader = null
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = dp(1f)
        paint.color = 0x53ba72e6
        canvas.drawCircle(cx, cy, radius, paint)
        paint.color = 0x28ba72e6
        canvas.drawCircle(cx, cy, radius * .77f, paint)
        paint.style = Paint.Style.FILL
        val angle = (phase * 2f * Math.PI - Math.PI / 2).toFloat()
        star(canvas, cx + radius * cos(angle), cy + radius * sin(angle), dp(8f))
        val half = radius * .45f
        image.set(cx - half, cy - half, cx + half, cy + half)
        shape.reset()
        shape.addRoundRect(image, half * .36f, half * .36f, Path.Direction.CW)
        canvas.save()
        canvas.clipPath(shape)
        paint.color = Color.WHITE
        canvas.drawRect(image, paint)
        logo?.let { canvas.drawBitmap(it, null, image, paint) }
        canvas.restore()
        paint.textAlign = Paint.Align.CENTER
        paint.typeface = Typeface.create("sans-serif-black", Typeface.BOLD)
        paint.textSize = min(dp(40f), radius * .29f)
        paint.color = 0xfffff5ff.toInt()
        canvas.drawText("OJASSS", cx, cy + radius * 1.18f, paint)
        paint.typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        paint.textSize = min(dp(10f), radius * .076f)
        paint.color = 0xffdac7e8.toInt()
        canvas.drawText("THE INDIAN MASS POWER APP", cx, cy + radius * 1.33f, paint)
        paint.textSize = min(dp(13f), radius * .1f)
        canvas.drawText("Starting OJASSS…", cx, cy + radius * 1.59f, paint)
        val barY = cy + radius * 1.73f
        val barHalf = min(width * .36f, dp(175f))
        paint.color = 0xff40234c.toInt()
        canvas.drawRoundRect(cx-barHalf, barY, cx+barHalf, barY+dp(3f), dp(2f), dp(2f), paint)
        val x = cx - barHalf + barHalf * 1.64f * ((phase * 2) % 1)
        val end = x + barHalf * .36f
        paint.shader = LinearGradient(x, 0f, end, 0f, intArrayOf(0xffa100ff.toInt(),0xffe52abf.toInt(),0xffff6a52.toInt(),0xffffb347.toInt()), null, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(x, barY, end, barY+dp(3f), dp(2f), dp(2f), paint)
        paint.shader = null
        star(canvas, end, barY+dp(1.5f), dp(4f))
    }
}
