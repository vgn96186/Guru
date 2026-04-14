package expo.modules.applauncher

import android.util.Log
import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.TimeUnit

class DeepgramLiveSession(
    private val apiKey: String,
    transcriptPath: String,
) {
    private val transcriptFile = File(transcriptPath)
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // No timeout for streaming
        .pingInterval(8, TimeUnit.SECONDS)
        .build()
    private val reconnectHandler = Handler(Looper.getMainLooper())
    private val closed = AtomicBoolean(false)
    @Volatile
    private var webSocket: WebSocket? = null
    @Volatile
    private var connected = false
    @Volatile
    private var reconnectAttempts = 0
    @Volatile
    private var sentChunkCount = 0
    @Volatile
    private var sentByteCount = 0L

    companion object {
        private const val TAG = "DeepgramLiveSession"
        private const val MAX_RECONNECT_ATTEMPTS = 5
        private const val LOG_CHUNK_INTERVAL = 100
    }

    init {
        transcriptFile.parentFile?.mkdirs()
        transcriptFile.writeText("")
    }

    fun connect() {
        if (apiKey.isBlank()) return
        if (webSocket != null) return
        if (closed.get()) return

        val url =
            "wss://api.deepgram.com/v1/listen" +
                "?model=nova-2-medical" +
                "&language=en" +
                "&smart_format=true" +
                "&punctuate=true" +
                "&interim_results=true" +
                "&endpointing=300" +
                "&encoding=linear16" +
                "&sample_rate=16000" +
                "&channels=1" +
                "&keepalive=true"

        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Token $apiKey")
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                connected = true
                reconnectAttempts = 0
                Log.i(TAG, "Connected to Deepgram live transcription")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val data = JSONObject(text)
                    val alt = data.optJSONObject("channel")
                        ?.optJSONArray("alternatives")
                        ?.optJSONObject(0)
                    val transcript = alt?.optString("transcript").orEmpty().trim()
                    val isFinal = data.optBoolean("is_final", false)

                    if (isFinal && transcript.isNotBlank()) {
                        synchronized(transcriptFile) {
                            transcriptFile.appendText(transcript + "\n")
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to parse Deepgram message", e)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                connected = false
                this@DeepgramLiveSession.webSocket = null
                Log.w(
                    TAG,
                    "Deepgram live transcription failed (${t.javaClass.simpleName}) code=${response?.code} message=${response?.message}",
                    t,
                )
                scheduleReconnect()
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                connected = false
                this@DeepgramLiveSession.webSocket = null
                Log.i(TAG, "Deepgram live transcription closing: $code $reason")
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                connected = false
                this@DeepgramLiveSession.webSocket = null
                Log.i(TAG, "Deepgram live transcription closed: $code $reason")
            }
        })
    }

    fun sendPcmChunk(buffer: ByteArray, size: Int) {
        if (!connected) return
        if (size <= 0) return
        val socket = webSocket ?: return
        val payload: ByteString = buffer.copyOf(size).toByteString()
        if (!socket.send(payload)) {
            Log.w(TAG, "Deepgram WS send returned false; socket is closing or back-pressured")
            return
        }
        sentChunkCount += 1
        sentByteCount += size.toLong()
        if (sentChunkCount % LOG_CHUNK_INTERVAL == 0) {
            Log.d(
                TAG,
                "Deepgram WS audio flowing chunks=$sentChunkCount bytes=$sentByteCount",
            )
        }
    }

    fun close() {
        closed.set(true)
        reconnectHandler.removeCallbacksAndMessages(null)
        try {
            webSocket?.send("""{"type":"CloseStream"}""")
        } catch (_: Exception) {
        }
        try {
            webSocket?.close(1000, "lecture ended")
        } catch (_: Exception) {
        }
        webSocket = null
        connected = false
    }

    private fun scheduleReconnect() {
        if (closed.get()) return
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            Log.w(TAG, "Deepgram live transcription reconnect attempts exhausted")
            return
        }
        reconnectAttempts += 1
        val delayMs = minOf(1_000L * (1L shl (reconnectAttempts - 1)), 15_000L)
        Log.i(
            TAG,
            "Scheduling Deepgram reconnect attempt=$reconnectAttempts delayMs=$delayMs",
        )
        reconnectHandler.postDelayed(
            {
                if (!closed.get() && webSocket == null) {
                    connect()
                }
            },
            delayMs,
        )
    }
}
