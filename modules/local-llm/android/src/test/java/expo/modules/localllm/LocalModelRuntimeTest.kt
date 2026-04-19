package expo.modules.localllm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LocalModelRuntimeTest {
    @Test
    fun latestPendingUserPrompt_skipsAssistantHistoryAndUsesNewestUserTurn() {
        val messages = listOf(
            mapOf("role" to "user", "content" to "first question"),
            mapOf("role" to "assistant", "content" to "first answer"),
            mapOf("role" to "user", "content" to "follow up"),
        )

        val prompt = LocalModelRuntime.latestPendingUserPrompt(messages, processedMessageCount = 1)

        assertEquals("follow up", prompt)
    }

    @Test
    fun latestPendingUserPrompt_returnsNullWhenOnlyAssistantMessagesArePending() {
        val messages = listOf(
            mapOf("role" to "user", "content" to "first question"),
            mapOf("role" to "assistant", "content" to "first answer"),
        )

        val prompt = LocalModelRuntime.latestPendingUserPrompt(messages, processedMessageCount = 1)

        assertNull(prompt)
    }
}
