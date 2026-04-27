package expo.modules.applauncher.views

import android.content.Context
import android.widget.FrameLayout
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import expo.modules.applauncher.ui.LoadingOrbCompose

import androidx.compose.runtime.mutableStateOf

class LoadingOrbView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val messageState = mutableStateOf("Hey there! Let me think...")
    private val isTurbulentState = mutableStateOf(false)
    private val pathIntensityState = mutableStateOf(1.0f)
    private val breathIntensityState = mutableStateOf(1.0f)

    var message: String
        get() = messageState.value
        set(value) { messageState.value = value }

    var isTurbulent: Boolean
        get() = isTurbulentState.value
        set(value) { isTurbulentState.value = value }

    var pathIntensity: Float
        get() = pathIntensityState.value
        set(value) { pathIntensityState.value = value }

    var breathIntensity: Float
        get() = breathIntensityState.value
        set(value) { breathIntensityState.value = value }

    /**
     * Standalone lifecycle owner to drive Compose animations.
     * rememberInfiniteTransition() requires the lifecycle to be at least STARTED/RESUMED,
     * otherwise all animations are paused — resulting in a static sphere.
     */
    private val lifecycleOwner = object : LifecycleOwner, SavedStateRegistryOwner {
        val registry = LifecycleRegistry(this)
        val savedStateController = SavedStateRegistryController.create(this)
        override val lifecycle: Lifecycle get() = registry
        override val savedStateRegistry get() = savedStateController.savedStateRegistry
        init {
            savedStateController.performRestore(null)
        }
    }

    private val composeView = ComposeView(context).apply {
        setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool)
        layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
        setContent {
            LoadingOrbCompose(
                message = messageState.value,
                isTurbulent = isTurbulentState.value,
                pathIntensity = pathIntensityState.value,
                breathIntensity = breathIntensityState.value
            )
        }
    }

    init {
        addView(composeView)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        composeView.setViewTreeLifecycleOwner(lifecycleOwner)
        composeView.setViewTreeSavedStateRegistryOwner(lifecycleOwner)
        lifecycleOwner.registry.currentState = Lifecycle.State.RESUMED
    }

    override fun onDetachedFromWindow() {
        // Use CREATED instead of DESTROYED to allow resuming if re-attached
        lifecycleOwner.registry.currentState = Lifecycle.State.CREATED
        super.onDetachedFromWindow()
    }
}
