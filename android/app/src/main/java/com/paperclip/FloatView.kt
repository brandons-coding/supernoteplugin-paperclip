package com.paperclip

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.roundToInt

internal data class FloatRow(val id: String, val text: String, val detail: String?, val icon: OutlineIcon.Kind?)

// help: a small ? in the title bar, reported to JS as a tap on the row id
// HELP_ROW_ID.
internal data class FloatSpec(
    val title: String,
    val rows: List<FloatRow>,
    val x: Int,
    val y: Int,
    val width: Int,
    val help: Boolean = false,
)

internal const val HELP_ROW_ID = "help"

// The float, drawn to match the Nomad's own side menu (reference/native-menu.png):
// white, thin outline, centred title over a heavier rule, inset hairlines
// between rows, outline icon then plain text. Built in code because PluginHost
// loads our APK and our R ids are not guaranteed to resolve in there. No
// ripple or pressed state on purpose: e-ink shows animation as smear.
internal class FloatView(private val ctx: Context, private val onRowTap: (FloatRow) -> Unit) {

  private companion object {
    const val OUTLINE_DP = 1f
    const val TITLE_RULE_DP = 2f
    const val ROW_RULE_DP = 1f
    const val ROW_HEIGHT_DP = 56f
    // Floor in device pixels, because the Nomad's density is a guess. 96 px
    // rows were fine to tap.
    const val MIN_ROW_PX = 96
    const val SIDE_PAD_DP = 20f
    const val ICON_DP = 26f
    // The ? is a bigger target than a row icon: it is the only thing in the
    // title bar and sits next to a pen-width gap on e-ink.
    const val HELP_DP = 40f
    const val ICON_GAP_DP = 16f
    const val TITLE_SP = 19f
    const val ROW_SP = 17f
  }

  private val Float.dp: Int
    get() = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, this, ctx.resources.displayMetrics).roundToInt()

  private val rowHeight get() = maxOf(ROW_HEIGHT_DP.dp, MIN_ROW_PX)

  fun build(spec: FloatSpec): View = LinearLayout(ctx).apply {
    orientation = LinearLayout.VERTICAL
    background = GradientDrawable().apply {
      setColor(Color.WHITE)
      setStroke(OUTLINE_DP.dp, Color.BLACK)
    }
    // Keeps the title rule and rows off the outline stroke.
    OUTLINE_DP.dp.let { setPadding(it, it, it, it) }

    addView(titleRow(spec.title, spec.help))
    addView(rule(TITLE_RULE_DP, inset = 0f))
    spec.rows.forEachIndexed { i, row ->
      if (i > 0) addView(rule(ROW_RULE_DP, inset = SIDE_PAD_DP))
      addView(rowView(row))
    }
  }

  private fun titleRow(title: String, help: Boolean) = FrameLayout(ctx).apply {
    val label = text(title, TITLE_SP).apply {
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      gravity = Gravity.CENTER
      minHeight = rowHeight
      // A lasso that slipped past the label cap shouldn't grow the float.
      maxLines = 2
      ellipsize = TextUtils.TruncateAt.END
      // Room on both sides so a centred title never runs under the ?.
      SIDE_PAD_DP.dp.let { setPadding(it + HELP_DP.dp, it / 2, it + HELP_DP.dp, it / 2) }
    }
    addView(label, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
    if (help) {
      val mark = ImageView(ctx).apply {
        setImageDrawable(OutlineIcon(OutlineIcon.Kind.HELP))
        setOnClickListener { onRowTap(FloatRow(HELP_ROW_ID, "", null, null)) }
        // The tap target is the whole padded square, not just the drawn ?.
        (HELP_DP / 4).dp.let { setPadding(it, it, it, it) }
      }
      addView(mark, FrameLayout.LayoutParams(HELP_DP.dp, HELP_DP.dp, Gravity.END or Gravity.CENTER_VERTICAL).apply {
        marginEnd = SIDE_PAD_DP.dp / 2
      })
    }
  }

  private fun rowView(row: FloatRow) = LinearLayout(ctx).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    minimumHeight = rowHeight
    setPadding(SIDE_PAD_DP.dp, 0, SIDE_PAD_DP.dp, 0)
    setOnClickListener { onRowTap(row) }

    row.icon?.let { kind ->
      val icon = ImageView(ctx).apply { setImageDrawable(OutlineIcon(kind)) }
      addView(icon, LinearLayout.LayoutParams(ICON_DP.dp, ICON_DP.dp).apply { marginEnd = ICON_GAP_DP.dp })
    }
    addView(text(row.text, ROW_SP), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    row.detail?.let { addView(text(it, ROW_SP)) }
  }

  private fun text(value: String, sp: Float) = TextView(ctx).apply {
    text = value
    typeface = Typeface.SANS_SERIF
    setTextColor(Color.BLACK)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
  }

  private fun rule(thicknessDp: Float, inset: Float) = View(ctx).apply {
    setBackgroundColor(Color.BLACK)
    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, thicknessDp.dp).apply {
      marginStart = inset.dp
      marginEnd = inset.dp
    }
  }
}

// Outline icons on a 24-unit grid, stroked thick with round caps like the
// Nomad's own. Paths instead of vector drawables for the same R-id reason.
internal class OutlineIcon(kind: Kind) : Drawable() {

  enum class Kind(val trace: Path.() -> Unit) {
    PLUS({
      addCircle(12f, 12f, 9f, Path.Direction.CW)
      line(12f, 8f, 12f, 16f)
      line(8f, 12f, 16f, 12f)
    }),
    LIST({
      for (y in floatArrayOf(7f, 12f, 17f)) {
        dot(4.5f, y)
        line(9f, y, 20f, y)
      }
    }),
    CLIP({
      moveTo(15f, 7f)
      lineTo(15f, 16.5f)
      arcTo(RectF(9f, 13.5f, 15f, 19.5f), 0f, 180f)
      lineTo(9f, 5.5f)
      arcTo(RectF(9f, 3.5f, 13f, 7.5f), 180f, 180f)
      lineTo(13f, 15.5f)
      arcTo(RectF(11f, 14.5f, 13f, 16.5f), 0f, 180f)
      lineTo(11f, 8f)
    }),
    TRASH({
      line(4f, 7f, 20f, 7f)
      moveTo(9f, 7f); lineTo(9f, 4f); lineTo(15f, 4f); lineTo(15f, 7f)
      moveTo(6f, 7f); lineTo(7f, 20f); lineTo(17f, 20f); lineTo(18f, 7f)
      line(10f, 11f, 10f, 16f)
      line(14f, 11f, 14f, 16f)
    }),
    CHECK({
      moveTo(5f, 12.5f); lineTo(10f, 17.5f); lineTo(19f, 7f)
    }),
    CLOSE({
      line(6f, 6f, 18f, 18f)
      line(18f, 6f, 6f, 18f)
    }),
    HELP({
      addCircle(12f, 12f, 9f, Path.Direction.CW)
      moveTo(9.5f, 9.5f)
      arcTo(RectF(9.5f, 7f, 14.5f, 12f), 180f, 270f)
      lineTo(12f, 13.5f)
      dot(12f, 16.5f)
    });

    companion object {
      fun of(name: String?): Kind? = entries.firstOrNull { it.name.equals(name, ignoreCase = true) }
    }
  }

  private companion object {
    const val GRID = 24f
    const val STROKE = 2.2f
  }

  private val path = Path().apply(kind.trace)
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = STROKE
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
    color = Color.BLACK
  }

  override fun draw(canvas: Canvas) {
    val saved = canvas.save()
    canvas.translate(bounds.left.toFloat(), bounds.top.toFloat())
    canvas.scale(bounds.width() / GRID, bounds.height() / GRID)
    canvas.drawPath(path, paint)
    canvas.restoreToCount(saved)
  }

  override fun setAlpha(alpha: Int) {
    paint.alpha = alpha
  }

  override fun setColorFilter(colorFilter: ColorFilter?) {
    paint.colorFilter = colorFilter
  }

  @Deprecated("Deprecated in Drawable since API 29 but still abstract")
  override fun getOpacity() = PixelFormat.TRANSLUCENT
}

private fun Path.line(x1: Float, y1: Float, x2: Float, y2: Float) {
  moveTo(x1, y1)
  lineTo(x2, y2)
}

// A round cap on a 0.01-unit segment draws the dot. A zero-length segment is
// not guaranteed to draw at all.
private fun Path.dot(x: Float, y: Float) = line(x, y, x + 0.01f, y)
