package expo.modules.omnicanvas

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

data class NodeData(
    @Field val id: Int,
    @Field val label: String,
    @Field val x: Float,
    @Field val y: Float,
    @Field val isCenter: Boolean = false,
    @Field val color: String? = null
) : Record

data class EdgeData(
    @Field val sourceId: Int,
    @Field val targetId: Int,
    @Field val label: String? = null
) : Record

data class ChatMessageData(
    @Field val id: String,
    @Field val role: String, // "user" or "assistant"
    @Field val text: String,
    @Field val timestamp: Double,
    @Field val isTyping: Boolean = false
) : Record

data class FlashcardData(
    @Field val id: String,
    @Field val front: String,
    @Field val back: String,
    @Field val isCloze: Boolean = false
) : Record

data class SubjectProgressData(
    @Field val name: String,
    @Field val percent: Float,
    @Field val color: String
) : Record

data class ProgressData(
    @Field val coveragePercent: Float,
    @Field val projectedScore: Int,
    @Field val masteredCount: Int,
    @Field val currentStreak: Int,
    @Field val totalMinutes: Int,
    @Field val weeklyMinutes: List<Int>,
    @Field val subjectBreakdown: List<SubjectProgressData>,
    @Field val nodesCreated: Int,
    @Field val cardsCreated: Int
) : Record

data class OrbState(
    @Field val phase: String, // "booting", "calming", "settling", "button"
    @Field val label: String? = null,
    @Field val sublabel: String? = null,
    @Field val targetX: Float = 0f,
    @Field val targetY: Float = 0f,
    @Field val targetSize: Float = 156f,
    @Field val orbEffect: String = "ripple"
) : Record

data class QuickStatsData(
    @Field val progressPercent: Float,
    @Field val todayMinutes: Int,
    @Field val dailyGoal: Int,
    @Field val streak: Int,
    @Field val level: Int,
    @Field val completedSessions: Int
) : Record
data class QuizQuestionData(
    @Field val question: String,
    @Field val options: List<String>,
    @Field val correctIndex: Int,
    @Field val explanation: String
) : Record

data class LectureAnalysisData(
    @Field val subject: String?,
    @Field val topics: List<String>,
    @Field val keyConcepts: List<String>,
    @Field val lectureSummary: String,
    @Field val estimatedConfidence: Int
) : Record

data class LectureReturnData(
    @Field val phase: String, // "intro", "transcribing", "results", "quiz", "quiz_done", "error"
    @Field val appName: String,
    @Field val durationMinutes: Int,
    @Field val activeStage: String?,
    @Field val stageMessage: String?,
    @Field val stageDetail: String?,
    @Field val progressPercent: Float,
    @Field val progressLabel: String?,
    @Field val analysis: LectureAnalysisData?,
    @Field val quizQuestions: List<QuizQuestionData>,
    @Field val currentQ: Int,
    @Field val selectedAnswer: Int?,
    @Field val score: Int,
    @Field val errorMsg: String?
) : Record

data class NextLectureData(
    @Field val batchId: String,
    @Field val batchShortName: String,
    @Field val title: String,
    @Field val index: Int,
    @Field val completedCount: Int,
    @Field val totalCount: Int,
    @Field val pct: Int,
    @Field val subColor: String,
    @Field val batchColor: String,
    @Field val isBusy: Boolean
) : Record
