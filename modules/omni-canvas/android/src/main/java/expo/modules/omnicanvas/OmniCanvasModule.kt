package expo.modules.omnicanvas

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OmniCanvasModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("OmniCanvas")

        OnCreate {
            // Background pre-warm if a model path is available
            Log.i("OmniCanvas", "Module created")
        }

        View(MindMapCanvasView::class) {
            Name("MindMapCanvas")
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

        View(GuruChatListView::class) {
            Name("GuruChatList")
            Prop("messages") { view: GuruChatListView, messages: List<ChatMessageData> ->
                view.setMessages(messages)
            }
            Prop("isStreaming") { view: GuruChatListView, isStreaming: Boolean ->
                view.setIsStreaming(isStreaming)
            }
        }

        View(FlashcardView::class) {
            Name("Flashcard")
            Prop("card") { view: FlashcardView, card: FlashcardData ->
                view.setCard(card)
            }
            Prop("isFlipped") { view: FlashcardView, isFlipped: Boolean ->
                view.setIsFlipped(isFlipped)
            }
            Events("onFlip")
        }

        View(LoadingOrbView::class) {
            Name("LoadingOrb")
            Prop("size") { view: LoadingOrbView, size: Float ->
                view.setSize(size)
            }
            Prop("orbEffect") { view: LoadingOrbView, effect: String ->
                view.setEffect(effect)
            }
        }

        View(ProgressDashboardView::class) {
            Name("ProgressDashboard")
            Prop("data") { view: ProgressDashboardView, data: ProgressData ->
                view.setData(data)
            }
        }

        View(StartButtonView::class) {
            Name("StartButton")
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

        View(OmniOrbView::class) {
            Name("OmniOrb")
            Prop("state") { view: OmniOrbView, state: OrbState ->
                view.setState(state)
            }
            Events("onPress")
        }

        View(QuickStatsBarView::class) {
            Name("QuickStatsBar")
            Prop("data") { view: QuickStatsBarView, data: QuickStatsData ->
                view.setData(data)
            }
            Events("onGoalPress")
        }

        View(LectureReturnSheetView::class) {
            Name("LectureReturnSheet")
            Prop("data") { view: LectureReturnSheetView, data: LectureReturnData ->
                view.data = data
            }
            Events("onAction")
        }

        View(ActionHubView::class) {
            Name("ActionHub")
            Events("onAction")
        }

        View(NextLectureView::class) {
            Name("NextLecture")
            Prop("data") { view: NextLectureView, data: NextLectureData ->
                view.data = data
            }
            Events("onAction", "onMarkDone")
        }
    }
}
