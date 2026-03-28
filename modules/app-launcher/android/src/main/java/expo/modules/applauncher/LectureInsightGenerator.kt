package expo.modules.applauncher

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class LectureInsightGenerator(
    private val groqKey: String,
    private val transcriptPath: String,
    private val insightPath: String,
) {
    private val transcriptFile = File(transcriptPath)
    private val insightFile = File(insightPath)
    private val executor = Executors.newSingleThreadExecutor()
    private val inFlight = AtomicBoolean(false)
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .readTimeout(40, TimeUnit.SECONDS)
        .build()

    @Volatile
    private var lastGeneratedChars = 0

    @Volatile
    private var lastRequestedAt = 0L

    companion object {
        private const val TAG = "LectureInsightGen"
        private const val MIN_TRANSCRIPT_CHARS = 220
        private const val MIN_CHAR_GROWTH = 140
        private const val MIN_REQUEST_GAP_MS = 45_000L
        private const val MODEL = "llama-3.1-8b-instant"
    }

    fun scheduleIfNeeded(force: Boolean = false) {
        if (groqKey.isBlank()) return
        if (!transcriptFile.exists()) return
        val transcript = try {
            transcriptFile.readText().trim()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read transcript sidecar", e)
            return
        }
        if (transcript.length < MIN_TRANSCRIPT_CHARS) return

        val now = System.currentTimeMillis()
        val charGrowth = transcript.length - lastGeneratedChars
        if (!force) {
            if (inFlight.get()) return
            if (charGrowth < MIN_CHAR_GROWTH) return
            if (now - lastRequestedAt < MIN_REQUEST_GAP_MS) return
        }
        if (!inFlight.compareAndSet(false, true)) return

        lastRequestedAt = now
        val transcriptSnapshot = transcript
        executor.execute {
            try {
                val payload = generateInsights(transcriptSnapshot)
                insightFile.parentFile?.mkdirs()
                insightFile.writeText(payload.toString())
                lastGeneratedChars = transcriptSnapshot.length
                Log.i(
                    TAG,
                    "Background lecture insights updated -> chars=${transcriptSnapshot.length}, path=$insightPath",
                )
            } catch (e: Exception) {
                Log.w(TAG, "Background lecture insight generation failed", e)
            } finally {
                inFlight.set(false)
            }
        }
    }

    fun close() {
        executor.shutdown()
        client.dispatcher.executorService.shutdown()
        client.connectionPool.evictAll()
    }

    private fun generateInsights(transcript: String): JSONObject {
        val transcriptExcerpt = if (transcript.length > 5000) {
            transcript.takeLast(5000)
        } else {
            transcript
        }

        val prompt = """
You are generating instant medical lecture revision aids from a live transcript.
Return only valid JSON with this shape:
{
  "subject": "string",
  "topics": ["string"],
  "summary": "2 short lines maximum",
  "keyConcepts": ["string"],
  "quiz": {
    "questions": [
      {
        "question": "string",
        "options": ["string", "string", "string", "string"],
        "correctIndex": 0,
        "explanation": "string"
      }
    ]
  }
}

Requirements:
- Subject and topics must match the lecture content.
- Keep keyConcepts to 3-5 concise high-yield bullets.
- Generate exactly 3 MCQs.
- Use only transcript-supported medical facts.

TRANSCRIPT:
$transcriptExcerpt
""".trimIndent()

        val messages = JSONArray()
            .put(JSONObject().put("role", "system").put("content", "You extract medical lecture insights quickly and accurately."))
            .put(JSONObject().put("role", "user").put("content", prompt))

        val body = JSONObject()
            .put("model", MODEL)
            .put("temperature", 0.2)
            .put("messages", messages)

        val request = Request.Builder()
            .url("https://api.groq.com/openai/v1/chat/completions")
            .addHeader("Authorization", "Bearer $groqKey")
            .addHeader("Content-Type", "application/json")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()

        client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IllegalStateException("Groq insight request failed (${response.code}): $raw")
            }

            val root = JSONObject(raw)
            val content = root.optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content")
                .orEmpty()
                .trim()
            if (content.isBlank()) {
                throw IllegalStateException("Groq insight response was empty")
            }

            val parsed = JSONObject(extractJsonObject(content))
            parsed.put("generatedAt", System.currentTimeMillis())
            parsed.put("transcriptChars", transcript.length)
            return parsed
        }
    }

    private fun extractJsonObject(content: String): String {
        val cleaned = content
            .removePrefix("```json")
            .removePrefix("```")
            .removeSuffix("```")
            .trim()
        val start = cleaned.indexOf('{')
        val end = cleaned.lastIndexOf('}')
        if (start < 0 || end <= start) {
            throw IllegalStateException("Groq insight response did not contain JSON")
        }
        return cleaned.substring(start, end + 1)
    }
}
