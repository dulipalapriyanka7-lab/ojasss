package com.ojasss.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.view.View

/** Scalable line icons for the native navigation and reel controls. */
internal class NativeGlyph(context: Context, private var name: String, color: Int, private var filled: Boolean = false) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
        style = Paint.Style.STROKE
        strokeWidth = 1.8f
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val path = Path()
    fun update(icon: String = name, color: Int = paint.color, fill: Boolean = filled) {
        name = icon
        paint.color = color
        filled = fill
        invalidate()
    }
    override fun onDraw(canvas: Canvas) {
        val side = minOf(width,height).toFloat()
        if(side<=0)return
        canvas.save()
        canvas.translate((width-side)/2,(height-side)/2)
        canvas.scale(side/24,side/24)
        fun line(vararg p:Float) {
            path.reset();path.moveTo(p[0],p[1])
            for(i in 2 until p.size step 2)path.lineTo(p[i],p[i+1])
            canvas.drawPath(path,paint)
        }
        fun rect(l: Float, t: Float, r: Float, b: Float, radius: Float = 2f) =
            canvas.drawRoundRect(l, t, r, b, radius, radius, paint)
        paint.style = if (filled) Paint.Style.FILL_AND_STROKE else Paint.Style.STROKE
        when(name){
            "Home"->{line(3f,10f,12f,3f,21f,10f,21f,21f,15f,21f,15f,14f,9f,14f,9f,21f,3f,21f,3f,10f)}
            "Discover"->{canvas.drawCircle(12f,12f,9f,paint);line(16.5f,7.5f,14f,14f,7.5f,16.5f,10f,10f,16.5f,7.5f)}
            "Create"->{line(12f,5f,12f,19f);line(5f,12f,19f,12f)}
            "One Chance"->{line(12f,2f,14.5f,9.5f,22f,12f,14.5f,14.5f,12f,22f,9.5f,14.5f,2f,12f,9.5f,9.5f,12f,2f);line(20f,3f,20f,7f);line(18f,5f,22f,5f)}
            "Profile"->{canvas.drawCircle(12f,7f,3.6f,paint);path.reset();path.moveTo(4f,22f);path.cubicTo(4f,12f,20f,12f,20f,22f);canvas.drawPath(path,paint)}
            "Fire"->{path.reset();path.moveTo(12f,2f);path.cubicTo(13f,7f,18f,9f,19f,13f);path.cubicTo(21f,20f,15f,23f,11f,22f);path.cubicTo(4f,22f,2f,15f,7f,10f);path.cubicTo(7f,15f,10f,14f,10f,10f);path.cubicTo(10f,7f,13f,6f,12f,2f);canvas.drawPath(path,paint)}
            "Speak"->{canvas.drawRoundRect(9f,2f,15f,14f,3f,3f,paint);path.reset();path.moveTo(5f,11f);path.cubicTo(5f,21f,19f,21f,19f,11f);canvas.drawPath(path,paint);line(12f,18f,12f,22f)}
            "Viral"->{line(13f,2f,4f,14f,10f,14f,9f,22f,20f,9f,13f,9f,13f,2f)}
            "Save"->{line(6f,3f,18f,3f,18f,21f,12f,17f,6f,21f,6f,3f)}
            "Share"->{line(3f,10f,21f,3f,14f,21f,11f,13f,3f,10f);line(11f,13f,21f,3f)}
            "Chat"->{line(7f,15f,3f,19f,3f,5f,16f,5f,16f,15f,7f,15f);line(19f,9f,21f,9f,21f,21f,17f,18f,11f,18f)}
            "Grid"->{rect(3f,3f,10f,10f);rect(14f,3f,21f,10f);rect(3f,14f,10f,21f);rect(14f,14f,21f,21f)}
            "Trophy"->{
                path.reset();path.moveTo(7f,3f);path.lineTo(17f,3f);path.lineTo(17f,10f)
                path.cubicTo(17f,17f,7f,17f,7f,10f);path.close();canvas.drawPath(path,paint)
                line(7f,5f,3f,5f,3f,8f,7f,11f);line(17f,5f,21f,5f,21f,8f,17f,11f);line(12f,15f,12f,21f);line(7f,21f,17f,21f)
            }
            "Announcement"->{line(3f,9f,9f,9f,19f,4f,19f,18f,9f,14f,3f,14f,3f,9f);line(7f,14f,9f,20f,12f,20f,10f,15f)}
            "Chevron"->line(6f,9f,12f,15f,18f,9f)
            "Play"->line(8f,4f,20f,12f,8f,20f,8f,4f)
            "Pause"->{rect(6f,4f,9f,20f,1f);rect(15f,4f,18f,20f,1f)}
            "Sound","Mute"->{
                line(3f,9f,7f,9f,12f,5f,12f,19f,7f,15f,3f,15f,3f,9f)
                if(name=="Mute"){line(16f,9f,21f,14f);line(21f,9f,16f,14f)}
                else {canvas.drawArc(10f,7f,20f,17f,-55f,110f,false,paint);canvas.drawArc(8f,4f,24f,20f,-55f,110f,false,paint)}
            }
            "Videos"->{rect(3f,8f,21f,21f);line(3f,8f,3f,5f,20f,2f,21f,6f,3f,9f);line(8f,4f,10f,7f);line(14f,3f,16f,6f)}
            "Posters"->{rect(3f,3f,21f,21f);canvas.drawCircle(8f,8f,1.4f,paint);line(4f,17f,10f,12f,13f,15f,17f,10f,20f,14f)}
            "Edit"->{line(4f,16f,15f,5f,19f,9f,8f,20f,4f,20f,4f,16f);line(13f,7f,17f,11f)}
            "Calendar"->{rect(3f,5f,21f,21f);line(3f,10f,21f,10f);line(8f,3f,8f,7f);line(16f,3f,16f,7f)}
            "Verify"->{line(12f,2f,16f,4f,20f,5f,21f,10f,22f,12f,20f,16f,19f,20f,14f,21f,12f,22f,8f,20f,4f,19f,3f,14f,2f,12f,4f,8f,5f,4f,10f,3f,12f,2f);line(8f,12f,11f,15f,16f,9f)}
            "Wallet"->{rect(3f,6f,21f,19f);line(21f,10f,15f,10f,15f,15f,21f,15f)}
            "Bell"->{
                path.reset();path.moveTo(4f,17f);path.cubicTo(7f,15f,6f,12f,6f,9f)
                path.cubicTo(6f,2f,18f,2f,18f,9f);path.cubicTo(18f,12f,17f,15f,20f,17f)
                path.close();canvas.drawPath(path,paint);canvas.drawArc(9f,17f,15f,22f,15f,150f,false,paint)
            }
            "More"->{for(x in listOf(5f,12f,19f))canvas.drawCircle(x,12f,1f,paint)}
        }
        canvas.restore()
    }
}
