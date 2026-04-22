package expo.modules.applauncher

import android.content.Context
import com.samsung.android.sdk.penremote.AirMotionEvent
import com.samsung.android.sdk.penremote.ButtonEvent
import com.samsung.android.sdk.penremote.SpenRemote
import com.samsung.android.sdk.penremote.SpenUnit
import com.samsung.android.sdk.penremote.SpenUnitManager

class SPenController(private val ctx: Context) {
    private val remote = SpenRemote.getInstance()
    private var manager: SpenUnitManager? = null
    var onButton: (() -> Unit)? = null
    var onAirMotion: ((Float, Float) -> Unit)? = null

    fun isSupported() = remote.isFeatureEnabled(SpenRemote.FEATURE_TYPE_BUTTON)

    fun connect(cb: (Boolean) -> Unit) {
        if (!isSupported()) { cb(false); return }
        remote.connect(ctx, object : SpenRemote.ConnectionResultCallback {
            override fun onSuccess(mgr: SpenUnitManager) {
                manager = mgr
                mgr.getUnit(SpenUnit.TYPE_BUTTON)?.let { unit ->
                    mgr.registerSpenEventListener({ ev ->
                        if (ButtonEvent(ev).action == ButtonEvent.ACTION_UP) onButton?.invoke()
                    }, unit)
                }
                mgr.getUnit(SpenUnit.TYPE_AIR_MOTION)?.let { unit ->
                    mgr.registerSpenEventListener({ ev ->
                        val am = AirMotionEvent(ev)
                        onAirMotion?.invoke(am.deltaX, am.deltaY)
                    }, unit)
                }
                cb(true)
            }
            override fun onFailure(reason: Int) { cb(false) }
        })
    }

    fun disconnect() {
        manager = null
        runCatching { remote.disconnect(ctx) }
    }
}
