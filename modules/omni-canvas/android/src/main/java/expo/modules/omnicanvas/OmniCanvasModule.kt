package expo.modules.omnicanvas

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OmniCanvasModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("OmniCanvas")

        OnCreate {
            // Background pre-warm if a model path is available
            // In a real app, we'd fetch the saved path from SharedPreferences
            // but for now we expose the hook for future use.
            Log.i("OmniCanvas", "Module created, pre-warming local AI...")
            LocalLlmModule.prewarm()
        }

        View("MindMapCanvas", MindMapCanvasView::class) {
            Prop("nodes") { view: MindMapCanvasView, nodes: List<NodeData> ->
                view.setNodes(nodes)
            }
            Prop("edges") { view: MindMapCanvasView, edges: List<EdgeData> ->
                view.setEdges(edges)
            }
            Prop("zoom") { view: MindMapCanvasView, zoom: Float ->
                view.setZoom(zoom)
            }
            Prop("offsetX") { view: MindMapCanvasView, x: Float ->
                view.setOffsetX(x)
            }
            Prop("offsetY") { view: MindMapCanvasView, y: Float ->
                view.setOffsetY(y)
            }
            
            Events("onNodePress", "onCanvasPan", "onZoomChange")
        }

        View("GuruChatList", GuruChatListView::class) {
            Prop("messages") { view: GuruChatListView, messages: List<ChatMessageData> ->
                view.setMessages(messages)
            }
            Prop("isStreaming") { view: GuruChatListView, isStreaming: Boolean ->
                view.setIsStreaming(isStreaming)
            }
        }

        View("Flashcard", FlashcardView::class) {
            Prop("card") { view: FlashcardView, card: FlashcardData ->
                view.setCard(card)
            }
            Prop("isFlipped") { view: FlashcardView, isFlipped: Boolean ->
                view.setIsFlipped(isFlipped)
            }
            Events("onFlip")
        }

        View("LoadingOrb", LoadingOrbView::class) {
            Prop("size") { view: LoadingOrbView, size: Float ->
                view.setSize(size)
            }
            Prop("orbEffect") { view: LoadingOrbView, effect: String ->
                view.setEffect(effect)
            }
        }

        View("ProgressDashboard", ProgressDashboardView::class) {
            Prop("data") { view: ProgressDashboardView, data: ProgressData ->
                view.setData(data)
            }
        }

        View("StartButton", StartButtonView::class) {
            Prop("label") { view: StartButtonView, label: String ->
                view.setLabel(label)
            }
            Prop("sublabel") { view: StartButtonView, sublabel: String ->
                view.setSublabel(sublabel)
            }
            Prop("color") { view: StartButtonView, color: String ->
                view.setColor(color)
            }
            Prop("disabled") { view: StartButtonView, disabled: Boolean ->
                view.setDisabled(disabled)
            }
            Events("onPress")
        }

        View("OmniOrb", OmniOrbView::class) {
            Prop("state") { view: OmniOrbView, state: OrbState ->
                view.setState(state)
            }
            Events("onPress")
        }

        View("QuickStatsBar", QuickStatsBarView::class) {
            Prop("data") { view: QuickStatsBarView, data: QuickStatsData ->
                view.setData(data)
            }
            Events("onGoalPress")
        }

        View("LectureReturnSheet", LectureReturnSheetView::class) {
            Prop("data") { view: LectureReturnSheetView, data: LectureReturnData ->
                view.data = data
            }
            Events("onAction")
        }

        View("ActionHub", ActionHubView::class) {
            Events("onAction")
        }

        View("NextLecture", NextLectureView::class) {
            Prop("data") { view: NextLectureView, data: NextLectureData ->
                view.data = data
            }
            Events("onAction", "onMarkDone")
        }
    }
}
