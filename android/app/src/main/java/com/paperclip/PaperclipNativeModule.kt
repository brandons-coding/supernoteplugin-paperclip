package com.paperclip

import android.graphics.PixelFormat
import android.util.Base64
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter
import java.io.File

// The float (one overlay window at a time) plus the file helpers JS has no
// other way to do: write the sticker PNG and clear old grid previews.
// JS decides what every row means; this side only draws and reports taps.
class PaperclipNativeModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  companion object {
    const val NAME = "PaperclipNative"
    const val EVT_ROW_TAP = "paperclipRowTap"
    const val EVT_FLOAT_CLOSED = "paperclipFloatClosed"
    // floatSpec.ts's close row. Handled here, not in JS, so it still closes
    // the float when PluginHost has suspended JS.
    private const val CLOSE_ROW_ID = "close"
    private const val TAG = "Paperclip"

    // Static so a reloaded JS context (or a second module instance) can still
    // find and remove a float left behind by the previous one.
    @Volatile private var overlay: View? = null
  }

  private val windowManager get() = ctx.getSystemService(WindowManager::class.java)

  override fun getName() = NAME

  // spec: title, rows [{id, text, detail?, icon?}], help?, x, y, width (px). Height
  // wraps the rows. Replaces any float already showing.
  // Block bodies on purpose for every @ReactMethod: an async bridge method
  // must return void, and runOnUiThread returns a boolean.
  @ReactMethod
  fun show(spec: ReadableMap, promise: Promise) {
    onUiThread(promise, "E_SHOW") {
      val parsed = spec.toFloatSpec()
      attach(FloatView(ctx, ::onRowTap).build(parsed), parsed)
      true
    }
  }

  @ReactMethod
  fun hide(promise: Promise) {
    onUiThread(promise, "E_HIDE") { detach() }
  }

  @ReactMethod
  fun isShowing(promise: Promise) {
    promise.resolve(overlay != null)
  }

  // Resolves the byte count written, so JS can log a short write.
  @ReactMethod
  fun writeBase64(path: String, base64: String, promise: Promise) {
    settle(promise, "E_WRITE") {
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      File(path).apply { parentFile?.mkdirs() }.writeBytes(bytes)
      bytes.size
    }
  }

  // Grid previews get a new name per open (RN's Image caches by uri), so the
  // last set is cleared before the next or they pile up in the plugin dir.
  // Resolves how many went.
  @ReactMethod
  fun deleteByPrefix(dir: String, prefix: String, promise: Promise) {
    settle(promise, "E_DELETE") {
      File(dir).listFiles { f -> f.isFile && f.name.startsWith(prefix) }.orEmpty().count { it.delete() }
    }
  }

  // Required by NativeEventEmitter on the JS side; events go out through emit().
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}

  // Rows never remove the float themselves: JS may want to swap in the next
  // state (label list, confirm) instead of closing.
  private fun onRowTap(row: FloatRow) {
    if (row.id == CLOSE_ROW_ID) {
      detach()
      emit(EVT_FLOAT_CLOSED)
    } else {
      emit(EVT_ROW_TAP) { putString("id", row.id) }
    }
  }

  private fun attach(view: View, spec: FloatSpec) {
    detach()
    val params = WindowManager.LayoutParams(
        spec.width,
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        // Keeps key and pen focus on the note; touches outside the panel fall
        // through to the page.
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
        PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = spec.x
      y = spec.y
    }
    windowManager.addView(view, params)
    overlay = view
  }

  private fun detach(): Boolean {
    val view = overlay ?: return false
    overlay = null
    windowManager.removeViewImmediate(view)
    return true
  }

  // A tap with no JS to hear it is lost, not fatal: the float stays usable.
  private fun emit(event: String, fill: WritableMap.() -> Unit = {}) {
    val payload = Arguments.createMap().apply {
      fill()
      putDouble("t", System.currentTimeMillis().toDouble())
    }
    runCatching { ctx.getJSModule(RCTDeviceEventEmitter::class.java).emit(event, payload) }
        .onFailure { Log.w(TAG, "emit $event failed", it) }
  }

  // WindowManager calls have to run on the main thread; bridge methods don't.
  private fun onUiThread(promise: Promise, code: String, block: () -> Any?) {
    UiThreadUtil.runOnUiThread { settle(promise, code, block) }
  }

  private fun settle(promise: Promise, code: String, block: () -> Any?) {
    try {
      promise.resolve(block())
    } catch (e: Throwable) {
      promise.reject(code, e.toString(), e)
    }
  }
}

private const val DEFAULT_WIDTH_PX = 520

private fun ReadableMap.toFloatSpec(): FloatSpec {
  val rows = getArray("rows") ?: throw IllegalArgumentException("spec has no rows")
  return FloatSpec(
      title = string("title").orEmpty(),
      rows = (0 until rows.size()).map { i ->
        rows.getMap(i)?.toFloatRow() ?: throw IllegalArgumentException("row $i is not an object")
      },
      x = int("x", 0),
      y = int("y", 0),
      width = int("width", DEFAULT_WIDTH_PX),
      help = has("help") && getBoolean("help"),
  )
}

private fun ReadableMap.toFloatRow() = FloatRow(
    id = string("id") ?: throw IllegalArgumentException("row has no id"),
    text = string("text").orEmpty(),
    detail = string("detail"),
    icon = OutlineIcon.Kind.of(string("icon")),
)

private fun ReadableMap.has(key: String) = hasKey(key) && !isNull(key)

private fun ReadableMap.string(key: String): String? = if (has(key)) getString(key) else null

// JS numbers arrive as doubles.
private fun ReadableMap.int(key: String, default: Int) = if (has(key)) getDouble(key).toInt() else default
