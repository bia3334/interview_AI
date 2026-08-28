import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  ElectronService,
  HistoryItem,
  ListenMode,
  RealtimeTranscriptEvent,
  StreamProvider,
  VoiceLanguage,
} from '../../services/electron.service';
import { AudioSegment, LiveListenerService } from '../../services/live-listener.service';
import { RealtimeListenerService } from '../../services/realtime-listener.service';
import { MarkdownService } from '../../services/markdown.service';

interface TranscriptSegment {
  id: string;
  text: string;
  at: number;
  answered: boolean;
}

interface QAEntry {
  id: string;
  question: string;
  answerRaw: string;
  answerHtml: string;
  provider: string;
  at: number;
}

type InterviewProvider = 'auto' | StreamProvider;

/**
 * Interview mode: listen to the call, transcribe each utterance, and stream
 * a spoken-style answer the candidate can read out loud.
 *
 * Two listening modes feed the same answer pipeline:
 *  - standard: LiveListenerService cuts utterances locally (energy VAD) and
 *    each one is transcribed as a file via the voice provider.
 *  - realtime: RealtimeListenerService streams PCM to the OpenAI Realtime
 *    API; partial words arrive live (`delta`) and the server's VAD decides
 *    when an utterance is `completed`.
 * Completed text lands in the transcript and in `pendingQuestion`; after a
 * short debounce (so multi-sentence questions land as one) it is sent through
 * `sendInterviewPrompt` and streamed into the answer panel.
 */
@Component({
  selector: 'app-interview',
  templateUrl: './interview.component.html',
  styleUrls: ['./interview.component.css'],
  standalone: false
})
export class InterviewComponent implements OnInit, OnDestroy {
  // ---- Settings (persisted in the main-process store) ----
  provider: InterviewProvider = 'auto';
  answerLanguage: VoiceLanguage = 'auto';
  speechLanguage: VoiceLanguage = 'auto';
  autoAnswer = true;
  listenMode: ListenMode = 'standard';
  realtimeModel = 'gpt-live-transcribe';
  private voiceProvider: 'openai' | 'gemini' = 'openai';

  readonly providerOptions: Array<{ id: InterviewProvider; label: string }> = [
    { id: 'auto', label: 'Auto' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'gemini', label: 'Gemini' },
    { id: 'claude', label: 'Claude' },
    { id: 'zai', label: 'Z.AI' },
    { id: 'lmstudio', label: 'LM Studio' },
  ];
  readonly languageOptions: Array<{ id: VoiceLanguage; label: string }> = [
    { id: 'auto', label: 'Auto' },
    { id: 'en', label: 'English' },
    { id: 'vi', label: 'Tiếng Việt' },
  ];
  readonly listenModeOptions: Array<{ id: ListenMode; label: string; hint: string }> = [
    { id: 'standard', label: 'Standard', hint: 'One transcript per sentence (Whisper / Gemini). Works with any provider key.' },
    { id: 'realtime', label: 'Realtime', hint: 'Words appear as they are spoken (OpenAI Realtime API). Needs an OpenAI key.' },
  ];

  // ---- Listening state ----
  listening = false;
  /** Realtime session is connecting / configuring. */
  connecting = false;
  level = 0;
  transcribingCount = 0;
  segments: TranscriptSegment[] = [];
  /** Realtime only: words of the utterance currently being spoken. */
  liveText = '';
  speechActive = false;
  pendingQuestion = '';
  typedQuestion = '';

  // ---- Answer state ----
  isAnswering = false;
  currentQuestion = '';
  answerRaw = '';
  answerHtml = '';
  answeredBy = '';
  answerError = '';
  lastUsage: { promptTokens: number; completionTokens: number; cost: number } | null = null;
  history: QAEntry[] = [];

  /** Prior turns sent as context for follow-up questions (raw text). */
  private conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private static readonly MAX_CONTEXT_MESSAGES = 8;
  /** Standard mode: local VAD already waited ~1.1 s, so a short extra beat. */
  private static readonly AUTO_ANSWER_DEBOUNCE_STANDARD_MS = 700;
  /** Realtime mode: the server VAD has decided the turn ended; answer fast. */
  private static readonly AUTO_ANSWER_DEBOUNCE_REALTIME_MS = 350;

  private activeRequestId: string | null = null;
  private streamRaw = '';
  private flushScheduled = false;
  private autoAnswerTimer: any = null;
  private followUpQueued = false;
  private subs: Subscription[] = [];
  /** Realtime: item ids whose text has already been appended as deltas. */
  private liveItemId: string | null = null;

  @ViewChild('answerContainer') answerContainer?: ElementRef<HTMLElement>;
  @ViewChild('transcriptList') transcriptList?: ElementRef<HTMLElement>;

  constructor(
    private electronService: ElectronService,
    private markdownService: MarkdownService,
    private listener: LiveListenerService,
    private realtimeListener: RealtimeListenerService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit() {
    await this.loadSettings();

    this.subs.push(
      // Standard mode
      this.listener.level$.subscribe((rms) => this.onLevel(rms)),
      this.listener.segment$.subscribe((segment) => this.onSegment(segment)),
      this.listener.ended$.subscribe((reason) => this.onCaptureEnded(reason)),
      // Realtime mode
      this.realtimeListener.level$.subscribe((rms) => this.onLevel(rms)),
      this.realtimeListener.ended$.subscribe((reason) => this.onCaptureEnded(reason)),
      this.electronService.onRealtimeTranscript().subscribe((evt) => this.onRealtimeEvent(evt)),
      // Shared
      this.electronService.onAIStream().subscribe((evt) => this.onStreamDelta(evt)),
      // Ctrl+Shift+V — same hotkey as exam voice capture, here it toggles the live listener.
      this.electronService.onToggleVoiceRecording().subscribe(() => this.toggleListening()),
      // Ctrl+Shift+P — "analyze" in exam mode; here it answers whatever is pending.
      this.electronService.onProcessScreenshots().subscribe(() => this.answerNow()),
      this.electronService.onTokenUsageUpdated().subscribe((data) => {
        this.ngZone.run(() => {
          if (data.provider !== 'all') {
            this.lastUsage = { promptTokens: data.promptTokens, completionTokens: data.completionTokens, cost: data.cost };
            this.cdr.detectChanges();
          }
        });
      }),
    );
  }

  ngOnDestroy() {
    this.clearAutoAnswerTimer();
    this.subs.forEach((s) => s.unsubscribe());
    this.subs = [];
    if (this.listening) this.stopListening();
  }

  private async loadSettings() {
    try {
      const [settings, speechLanguage, voiceProvider] = await Promise.all([
        this.electronService.getInterviewSettings(),
        this.electronService.getVoiceLanguage(),
        this.electronService.getVoiceProvider(),
      ]);
      this.provider = settings.provider || 'auto';
      this.answerLanguage = settings.answerLanguage || 'auto';
      this.autoAnswer = settings.autoAnswer !== false;
      this.listenMode = settings.listenMode || 'standard';
      this.realtimeModel = settings.realtimeModel || 'gpt-live-transcribe';
      this.speechLanguage = speechLanguage || 'auto';
      this.voiceProvider = voiceProvider || 'openai';
    } catch {
      // keep defaults
    }
    this.cdr.detectChanges();
  }

  // ---------------------------------------------------------------------
  // Settings changes
  // ---------------------------------------------------------------------

  async onProviderChange() {
    await this.electronService.saveInterviewSettings({ provider: this.provider });
  }

  async onAnswerLanguageChange() {
    await this.electronService.saveInterviewSettings({ answerLanguage: this.answerLanguage });
  }

  async onAutoAnswerChange() {
    await this.electronService.saveInterviewSettings({ autoAnswer: this.autoAnswer });
    if (this.autoAnswer && this.pendingQuestion.trim()) this.scheduleAutoAnswer();
  }

  async onSpeechLanguageChange() {
    await this.electronService.saveVoiceLanguage(this.speechLanguage);
    // The realtime session pins its language at connect time.
    if (this.listening && this.listenMode === 'realtime') {
      this.stopListening();
      await this.startListening();
    }
  }

  async onListenModeChange() {
    await this.electronService.saveInterviewSettings({ listenMode: this.listenMode });
    if (this.listening) {
      this.stopListening();
      await this.startListening();
    }
  }

  get listenModeHint(): string {
    return this.listenModeOptions.find((o) => o.id === this.listenMode)?.hint || '';
  }

  // ---------------------------------------------------------------------
  // Listening
  // ---------------------------------------------------------------------

  async toggleListening() {
    if (this.listening || this.connecting) {
      this.stopListening();
    } else {
      await this.startListening();
    }
  }

  async startListening() {
    if (this.listening || this.connecting) return;
    this.ngZone.run(() => {
      this.connecting = true;
      this.cdr.detectChanges();
    });
    try {
      if (this.listenMode === 'realtime') {
        const started = await this.electronService.startRealtimeTranscription({
          language: this.speechLanguage,
          model: this.realtimeModel,
        });
        if (!started.success) throw new Error(started.error || 'Failed to start realtime transcription');
        await this.realtimeListener.start();
      } else {
        await this.listener.start();
      }
      this.ngZone.run(() => {
        this.listening = true;
        this.connecting = false;
        this.cdr.detectChanges();
      });
    } catch (err: any) {
      await this.electronService.stopRealtimeTranscription().catch(() => undefined);
      this.realtimeListener.stop();
      this.ngZone.run(() => {
        this.listening = false;
        this.connecting = false;
        this.electronService.showToast(`Listen: ${err?.message || 'Failed to capture system audio'}`);
        this.cdr.detectChanges();
      });
    }
  }

  stopListening() {
    if (this.listener.isListening) this.listener.stop();
    if (this.realtimeListener.isCapturing) this.realtimeListener.stop();
    void this.electronService.stopRealtimeTranscription().catch(() => undefined);
    this.ngZone.run(() => {
      // Keep whatever was mid-sentence so it can still be answered.
      if (this.liveText.trim()) this.commitLiveText(this.liveText);
      this.listening = false;
      this.connecting = false;
      this.speechActive = false;
      this.level = 0;
      this.cdr.detectChanges();
    });
  }

  private onCaptureEnded(reason: string) {
    this.ngZone.run(() => {
      this.listening = false;
      this.connecting = false;
      this.speechActive = false;
      void this.electronService.stopRealtimeTranscription().catch(() => undefined);
      this.electronService.showToast(reason);
      this.cdr.detectChanges();
    });
  }

  private onLevel(rms: number) {
    // Smooth and quantise so the meter doesn't force a change-detection pass
    // 20 times a second for invisible differences.
    const next = Math.round(Math.min(1, rms * 4) * 40) / 40;
    if (next === this.level) return;
    this.ngZone.run(() => {
      this.level = next;
      this.cdr.detectChanges();
    });
  }

  get levelPercent(): number {
    return Math.round(this.level * 100);
  }

  get statusLabel(): string {
    if (this.connecting) return 'Connecting…';
    if (this.transcribingCount > 0) return 'Transcribing…';
    if (this.isAnswering) return 'Answering…';
    if (this.listening && this.speechActive) return 'Hearing speech';
    if (this.listening) return this.listenMode === 'realtime' ? 'Listening · live' : 'Listening';
    return 'Paused';
  }

  // ---- Standard mode: file per utterance ----

  private async onSegment(segment: AudioSegment) {
    this.ngZone.run(() => {
      this.transcribingCount += 1;
      this.cdr.detectChanges();
    });

    try {
      const buffer = await segment.blob.arrayBuffer();
      const result = await this.electronService.transcribeAudio(
        buffer, segment.mimeType, this.voiceProvider, this.speechLanguage,
      );
      const text = (result.success && result.text ? result.text : '').trim();
      if (!result.success && result.error) {
        this.ngZone.run(() => this.electronService.showToast(`Transcribe: ${result.error}`));
      }
      if (text) {
        this.ngZone.run(() => this.appendTranscript(text, segment.startedAt));
      }
    } catch (err: any) {
      this.ngZone.run(() => this.electronService.showToast(`Transcribe: ${err?.message || 'failed'}`));
    } finally {
      this.ngZone.run(() => {
        this.transcribingCount = Math.max(0, this.transcribingCount - 1);
        this.cdr.detectChanges();
        if (this.autoAnswer && this.pendingQuestion.trim()) this.scheduleAutoAnswer();
      });
    }
  }

  // ---- Realtime mode: streaming events from the main process ----

  private onRealtimeEvent(evt: RealtimeTranscriptEvent) {
    this.ngZone.run(() => {
      switch (evt.type) {
        case 'ready':
          this.connecting = false;
          break;
        case 'speech_started':
          this.speechActive = true;
          // They're still talking — don't answer a half-asked question.
          this.clearAutoAnswerTimer();
          break;
        case 'speech_stopped':
          this.speechActive = false;
          break;
        case 'delta':
          if (this.liveItemId !== evt.itemId) {
            // A new utterance began before the previous one's `completed`
            // arrived; commit what we have so nothing is lost.
            if (this.liveText.trim()) this.commitLiveText(this.liveText);
            this.liveItemId = evt.itemId;
            this.liveText = '';
          }
          this.liveText += evt.delta;
          this.scrollTranscriptToEnd();
          break;
        case 'completed': {
          const text = (evt.transcript || this.liveText).trim();
          this.liveItemId = null;
          this.liveText = '';
          if (text) {
            this.appendTranscript(text, Date.now());
            if (this.autoAnswer) this.scheduleAutoAnswer();
          }
          break;
        }
        case 'error':
          this.electronService.showToast(`Realtime: ${evt.message}`);
          break;
        case 'closed':
          if (this.listening) {
            this.electronService.showToast(`Realtime session closed (${evt.reason})`);
            this.stopListening();
          }
          break;
      }
      this.cdr.detectChanges();
    });
  }

  /** Move in-flight live words into the transcript (stop / interrupted utterance). */
  private commitLiveText(text: string) {
    this.liveItemId = null;
    this.liveText = '';
    this.appendTranscript(text.trim(), Date.now());
    if (this.autoAnswer) this.scheduleAutoAnswer();
  }

  private appendTranscript(text: string, at: number) {
    this.segments.push({
      id: `${at}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      at,
      answered: false,
    });
    this.pendingQuestion = `${this.pendingQuestion} ${text}`.trim();
    this.cdr.detectChanges();
    this.scrollTranscriptToEnd();
  }

  /**
   * Wait a beat after the latest transcript before answering, so a question
   * spoken as two utterances ("So tell me about… [pause] …your last project?")
   * is answered once, as a whole. Re-arms while other segments are still
   * being transcribed or (realtime) while speech is still being heard.
   */
  private scheduleAutoAnswer() {
    this.clearAutoAnswerTimer();
    const delay = this.listenMode === 'realtime'
      ? InterviewComponent.AUTO_ANSWER_DEBOUNCE_REALTIME_MS
      : InterviewComponent.AUTO_ANSWER_DEBOUNCE_STANDARD_MS;
    this.autoAnswerTimer = setTimeout(() => {
      this.autoAnswerTimer = null;
      if (this.transcribingCount > 0 || this.speechActive || this.liveText.trim()) {
        this.scheduleAutoAnswer();
        return;
      }
      this.ngZone.run(() => this.answerNow());
    }, delay);
  }

  private clearAutoAnswerTimer() {
    if (this.autoAnswerTimer) {
      clearTimeout(this.autoAnswerTimer);
      this.autoAnswerTimer = null;
    }
  }

  private scrollTranscriptToEnd() {
    setTimeout(() => {
      const el = this.transcriptList?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // ---------------------------------------------------------------------
  // Asking
  // ---------------------------------------------------------------------

  /** Answer everything transcribed since the last answer (or the last utterance). */
  answerNow() {
    this.clearAutoAnswerTimer();
    // Manual trigger mid-sentence: take the live words too.
    if (this.liveText.trim()) {
      const live = this.liveText.trim();
      this.liveItemId = null;
      this.liveText = '';
      this.appendTranscript(live, Date.now());
    }
    let question = this.pendingQuestion.trim();
    if (!question) {
      const last = this.segments[this.segments.length - 1];
      if (!last) {
        this.electronService.showToast('Nothing to answer yet');
        return;
      }
      question = last.text;
    }
    if (this.isAnswering) {
      // Let the current answer finish; we'll pick this up right after.
      this.followUpQueued = true;
      return;
    }
    this.pendingQuestion = '';
    this.segments.forEach((s) => (s.answered = true));
    void this.ask(question);
  }

  askTyped() {
    const typed = this.typedQuestion.trim();
    if (!typed) return;
    this.typedQuestion = '';
    // Typed text takes precedence but keeps any spoken context that's pending.
    this.pendingQuestion = `${typed} ${this.pendingQuestion}`.trim();
    this.answerNow();
  }

  discardPending() {
    this.clearAutoAnswerTimer();
    this.pendingQuestion = '';
    this.segments.forEach((s) => (s.answered = true));
  }

  private genRequestId(): string {
    return `interview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private thinkingHtml(): string {
    return '<div class="thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="label">Thinking…</span></div>';
  }

  private async ask(question: string) {
    const requestId = this.genRequestId();
    this.activeRequestId = requestId;
    this.streamRaw = '';
    this.isAnswering = true;
    this.currentQuestion = question;
    this.answerRaw = '';
    this.answerError = '';
    this.answeredBy = '';
    this.lastUsage = null;
    this.answerHtml = this.thinkingHtml();
    this.cdr.detectChanges();

    try {
      const res = await this.electronService.sendInterviewPrompt({
        provider: this.provider,
        question,
        history: this.conversation.slice(-InterviewComponent.MAX_CONTEXT_MESSAGES),
        answerLanguage: this.answerLanguage,
        requestId,
      });

      this.ngZone.run(() => {
        if (res.success && res.data) {
          const reply = res.data.reply || '';
          this.answerRaw = reply;
          this.answerHtml = this.markdownService.renderMarkdown(reply);
          this.answeredBy = this.providerLabel(res.data.provider);

          this.conversation.push({ role: 'user', content: question }, { role: 'assistant', content: reply });
          if (this.conversation.length > InterviewComponent.MAX_CONTEXT_MESSAGES) {
            this.conversation = this.conversation.slice(-InterviewComponent.MAX_CONTEXT_MESSAGES);
          }

          const entry: QAEntry = {
            id: requestId,
            question,
            answerRaw: reply,
            answerHtml: this.answerHtml,
            provider: res.data.provider,
            at: Date.now(),
          };
          this.history.unshift(entry);
          this.persistHistory(entry);
        } else {
          this.answerError = res.error || 'Request failed';
          this.answerHtml = '';
        }
        this.cdr.detectChanges();
        this.scheduleMathRender();
      });
    } catch (err: any) {
      this.ngZone.run(() => {
        this.answerError = err?.message || 'Request failed';
        this.answerHtml = '';
        this.cdr.detectChanges();
      });
    } finally {
      this.ngZone.run(() => {
        this.isAnswering = false;
        this.activeRequestId = null;
        this.cdr.detectChanges();
        // Something arrived while we were answering — handle it now.
        if (this.followUpQueued || (this.autoAnswer && this.pendingQuestion.trim())) {
          this.followUpQueued = false;
          this.scheduleAutoAnswer();
        }
      });
    }
  }

  private providerLabel(provider: string): string {
    return this.providerOptions.find((p) => p.id === provider)?.label || provider;
  }

  private persistHistory(entry: QAEntry) {
    const item: HistoryItem = {
      id: entry.id,
      timestamp: new Date(entry.at),
      prompt: `[Interview] ${entry.question}`,
      screenshotCount: 0,
    };
    (item as any)[`${entry.provider}Response`] = entry.answerHtml;
    void this.electronService.saveHistoryItem(item);
  }

  /** Bring an earlier answer back into the main panel. */
  showHistoryItem(entry: QAEntry) {
    if (this.isAnswering) return;
    this.currentQuestion = entry.question;
    this.answerRaw = entry.answerRaw;
    this.answerHtml = entry.answerHtml;
    this.answeredBy = this.providerLabel(entry.provider);
    this.answerError = '';
    this.cdr.detectChanges();
    this.scheduleMathRender();
  }

  get earlierAnswers(): QAEntry[] {
    return this.history.filter((h) => h.question !== this.currentQuestion || h.answerRaw !== this.answerRaw);
  }

  async copyAnswer() {
    if (!this.answerRaw) return;
    try {
      await navigator.clipboard.writeText(this.answerRaw);
      this.electronService.showToast('Answer copied');
    } catch {
      this.electronService.showToast('Copy failed');
    }
  }

  clearSession() {
    this.clearAutoAnswerTimer();
    this.segments = [];
    this.liveText = '';
    this.liveItemId = null;
    this.pendingQuestion = '';
    this.history = [];
    this.conversation = [];
    this.currentQuestion = '';
    this.answerRaw = '';
    this.answerHtml = '';
    this.answeredBy = '';
    this.answerError = '';
    this.lastUsage = null;
    this.cdr.detectChanges();
  }

  // ---------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------

  private onStreamDelta(evt: { requestId: string; delta: string }) {
    if (!this.activeRequestId || evt.requestId !== this.activeRequestId) return;
    this.streamRaw += evt.delta;
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setTimeout(() => {
      this.flushScheduled = false;
      if (!this.activeRequestId) return;
      const html = this.markdownService.renderMarkdown(this.streamRaw);
      this.ngZone.run(() => {
        this.answerHtml = html;
        this.cdr.detectChanges();
      });
    }, 50);
  }

  /** One KaTeX pass once the DOM has settled (mirrors PromptTab). */
  private scheduleMathRender() {
    setTimeout(() => {
      this.markdownService.highlightCodeBlocks();
      const el = this.answerContainer?.nativeElement;
      if (el) this.markdownService.renderMathInElement(el);
    });
  }
}
