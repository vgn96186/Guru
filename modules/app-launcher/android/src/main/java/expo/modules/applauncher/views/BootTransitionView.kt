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
import expo.modules.applauncher.ui.BootTransitionCompose

class BootTransitionView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

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
    }

    init {
        addView(composeView)
        updateCompose()
    }

    var bootPhase: String = "booting"
        set(value) { field = value; updateCompose() }

    var isTurbulent: Boolean = true
        set(value) { field = value; updateCompose() }

    private fun updateCompose() {
        composeView.setContent {
            BootTransitionCompose(bootPhase = bootPhase, isTurbulent = isTurbulent)
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        composeView.setViewTreeLifecycleOwner(lifecycleOwner)
        composeView.setViewTreeSavedStateRegistryOwner(lifecycleOwner)
        lifecycleOwner.registry.currentState = Lifecycle.State.RESUMED
    }

    override fun onDetachedFromWindow() {
        lifecycleOwner.registry.currentState = Lifecycle.State.DESTROYED
        super.onDetachedFromWindow()
    }
}

