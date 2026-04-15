/**
 * deepgramLive.ts — WebSocket-based live transcription via Deepgram Nova-2 Medical.
 *
 * Streams audio chunks to Deepgram and emits interim/final transcript fragments.
 * Optionally runs a lightweight topic-extraction pass every ~30s of accumulated text.
 */

type TranscriptCallback = (text: string, isFinal: boolean) => void;
type LiveTopicsCallback = (topics: string[], concepts: string[]) => void;

const TOPIC_EXTRACTION_INTERVAL_MS = 30_000;

export class DeepgramLiveTranscriber {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private accumulatedTranscript = '';
  private topicExtractionTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;

  onTranscript: TranscriptCallback = () => {};
  onLiveTopics: LiveTopicsCallback | null = null;
  onError: ((error: Error) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /** Open WebSocket connection to Deepgram. */
  connect(options?: { model?: string; language?: string }): void {
    if (this.ws) this.disconnect();

    const model = options?.model ?? 'nova-2-medical';
    const language = options?.language ?? 'en';
    const params = new URLSearchParams({
      model,
      language,
      smart_format: 'true',
      punctuate: 'true',
      interim_results: 'true',
      endpointing: '300',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
    });

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    // React Native WebSocket accepts (url, protocols, options) but TS types only allow 2 args.
    // Pass auth via the protocols parameter as a workaround; Deepgram also accepts query param.
    const authUrl = `${url}&token=${this.apiKey}`;
    this.ws = new WebSocket(authUrl);

    this.ws.onopen = () => {
      this.connected = true;
      this.startTopicExtraction();
    };

    this.ws.onmessage = (event: WebSocketMessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);
        const alt = data?.channel?.alternatives?.[0];
        if (!alt) return;

        const transcript = alt.transcript ?? '';
        const isFinal = data.is_final === true;

        if (transcript.trim()) {
          this.onTranscript(transcript, isFinal);
          if (isFinal) {
            this.accumulatedTranscript += ' ' + transcript;
          }
        }
      } catch (err) {
        if (__DEV__) console.warn('[DeepgramLive] Parse error:', err);
      }
    };

    this.ws.onerror = (event: Event) => {
      const msg = (event as any)?.message ?? 'WebSocket error';
      this.onError?.(new Error(msg));
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.stopTopicExtraction();
      this.onClose?.();
    };
  }

  /** Send a chunk of raw PCM audio (base64-encoded) to Deepgram. */
  sendAudioChunk(pcmBase64: string): void {
    if (!this.ws || !this.connected) return;
    try {
      // Decode base64 to binary and send
      const binaryString = atob(pcmBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      this.ws.send(bytes.buffer);
    } catch (err) {
      if (__DEV__) console.warn('[DeepgramLive] Send error:', err);
    }
  }

  /** Send raw ArrayBuffer audio data. */
  sendAudioBuffer(buffer: ArrayBuffer): void {
    if (!this.ws || !this.connected) return;
    try {
      this.ws.send(buffer);
    } catch (err) {
      if (__DEV__) console.warn('[DeepgramLive] Send buffer error:', err);
    }
  }

  /** Gracefully close the connection. */
  disconnect(): void {
    this.stopTopicExtraction();
    if (this.ws) {
      try {
        // Send close frame per Deepgram protocol
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      } catch {
        // Already closed
      }
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /** Get the full accumulated transcript so far. */
  getAccumulatedTranscript(): string {
    return this.accumulatedTranscript.trim();
  }

  /** Check if currently connected. */
  isConnected(): boolean {
    return this.connected;
  }

  // ── Topic extraction ────────────────────────────────────────────────────────

  private startTopicExtraction(): void {
    if (!this.onLiveTopics) return;
    this.topicExtractionTimer = setInterval(() => {
      this.extractTopics();
    }, TOPIC_EXTRACTION_INTERVAL_MS);
  }

  private stopTopicExtraction(): void {
    if (this.topicExtractionTimer) {
      clearInterval(this.topicExtractionTimer);
      this.topicExtractionTimer = null;
    }
  }

  private async extractTopics(): Promise<void> {
    if (!this.onLiveTopics) return;
    const text = this.accumulatedTranscript.trim();
    if (text.length < 100) return; // Not enough text yet

    try {
      // Lazy-import to avoid circular deps and keep this module lightweight
      const [{ generateText }, { createGuruFallbackModel }, { profileRepository }] =
        await Promise.all([
          import('../ai/v2/generateText'),
          import('../ai/v2/providers/guruFallback'),
          import('../../db/repositories/profileRepository'),
        ]);
      const prompt = `Extract the medical topics and key concepts from this lecture transcript segment. Return ONLY a JSON object like: {"topics": ["topic1", "topic2"], "concepts": ["concept1", "concept2"]}

Transcript:
${text.slice(-2000)}`;

      const profile = await profileRepository.getProfile();
      const model = createGuruFallbackModel({ profile });
      const { text: response } = await generateText({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a medical lecture topic extractor. Return only valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
      });

      const parsed = JSON.parse(response);
      if (parsed.topics || parsed.concepts) {
        this.onLiveTopics(parsed.topics ?? [], parsed.concepts ?? []);
      }
    } catch (err) {
      if (__DEV__) console.warn('[DeepgramLive] Topic extraction failed:', err);
    }
  }
}
