package expo.modules.applauncher.views

import android.content.Context
import android.widget.FrameLayout
import androidx.compose.runtime.mutableStateOf
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

    private val bootPhaseState = mutableStateOf("booting")
    private val isTurbulentState = mutableStateOf(true)
    private var isAttached = false

    private val lifecycleOwner = object : LifecycleOwner, SavedStateRegistryOwner {
        val registry = LifecycleRegistry(this)
        val savedStateController = SavedStateRegistryController.create(this)
        override val lifecycle: Lifecycle get() = registry
        override val savedStateRegistry get() = savedStateController.savedStateRegistry
        init {
            savedStateController.performRestore(null)
        }
    }

    private val composeView = object : ComposeView(context) {
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            if (!isAttachedToWindow) {
                setMeasuredDimension(0, 0)
                return
            }
            super.onMeasure(widthMeasureSpec, heightMeasureSpec)
        }
    }.apply {
        setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool)
        layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    }

    init {
        addView(composeView)
    }

    var bootPhase: String
        get() = bootPhaseState.value
        set(value) { bootPhaseState.value = value }

    var isTurbulent: Boolean
        get() = isTurbulentState.value
        set(value) { isTurbulentState.value = value }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isAttached = true
        composeView.setViewTreeLifecycleOwner(lifecycleOwner)
        composeView.setViewTreeSavedStateRegistryOwner(lifecycleOwner)
        lifecycleOwner.registry.currentState = Lifecycle.State.RESUMED
        
        composeView.setContent {
            BootTransitionCompose(
                bootPhase = bootPhaseState.value, 
                isTurbulent = isTurbulentState.value
            )
        }
    }

    override fun onDetachedFromWindow() {
        isAttached = false
        lifecycleOwner.registry.currentState = Lifecycle.State.DESTROYED
        super.onDetachedFromWindow()
    }
}

