package expo.modules.localllm

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object NativeTokenStream {
    private val _tokens = MutableSharedFlow<String>(extraBufferCapacity = 100)
    val tokens = _tokens.asSharedFlow()

    fun pushToken(token: String) {
        _tokens.tryEmit(token)
    }
}
