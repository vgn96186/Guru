package expo.modules.localllm

import android.util.Log
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.GenerateContentResponse
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.TextPart
import kotlinx.coroutines.flow.first

/**
 * Runtime for Gemini Nano via ML Kit GenAI Prompt API (AICore).
 *
 * Unlike the LiteRT-LM path which requires a model file, Gemini Nano
 * is provided by the Android system service AICore — no download or
 * file management needed (though the model may need to be downloaded
 * on first use if not already present on the device).
 *
 * Limitations:
 * - Max output ~256 tokens
 * - Max input ~4000 tokens
 * - Per-app inference quota enforced by AICore
 * - Best for quick local tasks: quiz grading, short summaries, confidence checks
 */
object GeminiNanoRuntime {

    private const val TAG = "GeminiNanoRuntime"

    @Volatile
    private var model: GenerativeModel? = null

    @Volatile
    private var isWarmedUp = false

    /** Status of Gemini Nano on this device. */
    enum class NanoStatus {
        AVAILABLE,
        DOWNLOADABLE,
        DOWNLOADING,
        UNAVAILABLE,
        ERROR
    }

    data class NanoStatusResult(
        val status: NanoStatus,
        val errorMessage: String? = null,
    )

    data class NanoGenerateResult(
        val text: String,
        val backend: String = "nano",
    )

    /** Get or create the GenerativeModel singleton. */
    private fun getModel(): GenerativeModel {
        return model ?: synchronized(this) {
            model ?: Generation.getClient().also { model = it }
        }
    }

    /**
     * Check whether Gemini Nano is available on this device.
     * checkStatus() is a suspend function returning @FeatureStatus Int.
     */
    suspend fun checkStatus(): NanoStatusResult {
        return try {
            val status: Int = getModel().checkStatus()
            Log.d(TAG, "Gemini Nano status: $status")
            when (status) {
                FeatureStatus.AVAILABLE -> NanoStatusResult(NanoStatus.AVAILABLE)
                FeatureStatus.DOWNLOADABLE -> NanoStatusResult(NanoStatus.DOWNLOADABLE)
                FeatureStatus.DOWNLOADING -> NanoStatusResult(NanoStatus.DOWNLOADING)
                else -> NanoStatusResult(NanoStatus.UNAVAILABLE)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check Nano status: ${e.message}")
            NanoStatusResult(NanoStatus.ERROR, e.message)
        }
    }

    /**
     * Download Gemini Nano if it's downloadable.
     * Suspends until download completes or fails.
     */
    suspend fun downloadIfNeeded(): NanoStatusResult {
        val statusResult = checkStatus()
        return when (statusResult.status) {
            NanoStatus.AVAILABLE -> {
                Log.i(TAG, "Gemini Nano already available")
                statusResult
            }
            NanoStatus.DOWNLOADABLE -> {
                Log.i(TAG, "Starting Gemini Nano download...")
                try {
                    getModel().download().first { status ->
                        when (status) {
                            is DownloadStatus.DownloadCompleted -> {
                                Log.i(TAG, "Gemini Nano download complete")
                                true
                            }
                            is DownloadStatus.DownloadFailed -> {
                                Log.e(TAG, "Gemini Nano download failed: ${status.e.message}")
                                true
                            }
                            is DownloadStatus.DownloadStarted -> {
                                Log.d(TAG, "Gemini Nano download started")
                                false
                            }
                            is DownloadStatus.DownloadProgress -> {
                                Log.d(TAG, "Gemini Nano download: ${status.totalBytesDownloaded} bytes")
                                false
                            }
                            else -> false
                        }
                    }
                    checkStatus()
                } catch (e: Exception) {
                    Log.e(TAG, "Gemini Nano download error: ${e.message}")
                    NanoStatusResult(NanoStatus.ERROR, e.message)
                }
            }
            else -> statusResult
        }
    }

    /**
     * Warm up the Nano model — loads it into memory for lower first-inference latency.
     * warmup() is a suspend function.
     */
    suspend fun warmup() {
        try {
            getModel().warmup()
            isWarmedUp = true
            Log.i(TAG, "Gemini Nano warmed up")
        } catch (e: Exception) {
            Log.w(TAG, "Gemini Nano warmup failed: ${e.message}")
        }
    }

    /**
     * Generate text using Gemini Nano.
     *
     * Uses the convenience generateContent(prompt: String) for simple prompts,
     * or GenerateContentRequest.builder() for parameterized requests.
     */
    suspend fun generate(
        prompt: String,
        systemInstruction: String? = null,
        temperature: Float = 0.3f,
        topK: Int = 40,
        maxOutputTokens: Int = 256,
    ): NanoGenerateResult {
        val fullPrompt = if (!systemInstruction.isNullOrBlank()) {
            "$systemInstruction\n\n$prompt"
        } else {
            prompt
        }

        val request = GenerateContentRequest.builder(TextPart(fullPrompt)).apply {
            this.temperature = temperature
            this.topK = topK
            this.maxOutputTokens = maxOutputTokens
        }.build()

        val response: GenerateContentResponse = getModel().generateContent(request)
        val text = response.candidates.firstOrNull()?.text?.trim() ?: ""
        if (text.isBlank()) {
            throw RuntimeException("Gemini Nano returned empty response")
        }
        return NanoGenerateResult(text = text)
    }

    /**
     * Convenience: quick yes/no/multiple-choice grading via Nano.
     * Optimized for the <256 token output limit.
     */
    suspend fun gradeAnswer(
        question: String,
        userAnswer: String,
        correctAnswer: String? = null,
    ): NanoGenerateResult {
        val prompt = buildString {
            append("Grade this answer. Reply with ONLY: CORRECT, INCORRECT, or PARTIALLY_CORRECT, followed by a one-line explanation.\n\n")
            append("Question: $question\n")
            append("Student answer: $userAnswer\n")
            if (!correctAnswer.isNullOrBlank()) {
                append("Correct answer: $correctAnswer\n")
            }
        }
        return generate(prompt, systemInstruction = "You are a medical exam grader. Be concise.", temperature = 0.1f, maxOutputTokens = 64)
    }

    /** Reset the model reference. */
    fun reset() {
        model = null
        isWarmedUp = false
    }
}
