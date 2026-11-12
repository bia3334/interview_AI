import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  AssistAction,
  AudioSource,
  ElectronService,
  MeetingSession,
  MeetingSessionSummary,
  SessionKind,
  HistoryItem,
  InterviewContext,
  InterviewContextSlot,
  ListenMode,
  RealtimeTranscriptEvent,
  StreamProvider,
  VoiceLanguage,
} from '../../services/electron.service';
import { AudioSegment, LiveListenerService } from '../../services/live-listener.service';
import { RealtimeListenerService } from '../../services/realtime-listener.service';
import { MarkdownService } from '../../services/markdown.service';
import { AudioInputDevice, isInputDeviceSource, listAudioInputDevices } from '../../services/call-audio';

interface TranscriptSegment {
  id: string;
  text: string;
  at: number;
  answered: boolean;
}

interface ContextSlotInfo {
  id: InterviewContextSlot;
  label: string;
  short: string;
  hint: string;
  file: boolean;
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
type View = 'assist' | 'transcript' | 'notes' | 'sessions' | 'settings';

interface QuickAction {
  id: AssistAction;
  label: string;
  icon: string;
  hint: string;
}

/**
 * Interview mode: a floating assistant for a live call. It listens to the
 * call, transcribes it, answers or helps on demand, and keeps rolling notes
 * that are saved as a session when the call ends.
 *
 * Two session kinds share the pipeline:
 *  - interview: I am the candidate; each transcribed question is answered
 *    automatically with something I can say out loud.
 *  - meeting: assistant + note-taker; nothing is answered on its own, the
 *    quick actions (Assist / What should I say / Follow-ups / Recap) work on
 *    the recent transcript.
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
  /** 'loopback' (Windows system audio), 'default' or an input deviceId. */
  audioSource: AudioSource = 'loopback';
  inputDevices: AudioInputDevice[] = [];
  readonly isMac = /Mac/i.test(navigator.platform);
  private voiceProvider: 'openai' | 'gemini' = 'openai';
  sessionKind: SessionKind = 'interview';
  /** Refresh the notes on their own while listening. */
  autoNotes = true;
  /** Loopback only: mix my microphone in so my side is transcribed too. */
  includeMic = false;

  /** Asked by the bar's switch button; the shell goes back to the mode picker. */
  @Output() switchMode = new EventEmitter<void>();

  // ---- Layout ----
  view: View = 'assist';
  /** Panel folded away: only the command bar (and a small window) remains. */
  collapsed = false;
  notesUnread = false;

  readonly kindOptions: Array<{ id: SessionKind; label: string; hint: string }> = [
    { id: 'interview', label: 'Interview', hint: 'I am the candidate: every question is answered with something I can say.' },
    { id: 'meeting', label: 'Meeting', hint: 'Assistant and note-taker: help on demand, notes written as the meeting goes.' },
  ];
  readonly quickActions: QuickAction[] = [
    { id: 'assist', label: 'Assist', icon: 'auto_awesome', hint: 'The most useful help for what was just said' },
    { id: 'say-next', label: 'What should I say?', icon: 'chat_bubble_outline', hint: 'Options for what to say next' },
    { id: 'follow-up', label: 'Follow-up questions', icon: 'help_outline', hint: 'Questions worth asking now' },
    { id: 'recap', label: 'Recap', icon: 'short_text', hint: 'Where the conversation stands' },
  ];

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

  // ---- Background context (CV / JD / notes), sent with every answer ----
  context: InterviewContext = InterviewComponent.emptyContext();
  /** Slot whose file is being read right now. */
  contextBusy: InterviewContextSlot | null = null;
  private static readonly INTERVIEW_SLOTS: ContextSlotInfo[] = [
    { id: 'cv', label: 'My CV', short: 'CV', file: true,
      hint: 'Import your CV (PDF, DOCX, TXT, MD) or paste it here. Answers will draw on this experience.' },
    { id: 'jd', label: 'Job description', short: 'JD', file: true,
      hint: 'Import or paste the job description so answers match what the role asks for.' },
    { id: 'notes', label: 'Notes', short: 'Notes', file: false,
      hint: 'Anything else: projects to highlight, stories to tell, topics to steer around, how to introduce yourself.' },
  ];
  /** Same three stored slots, read differently in a meeting. */
  private static readonly MEETING_SLOTS: ContextSlotInfo[] = [
    { id: 'cv', label: 'About me', short: 'Me', file: true,
      hint: 'Who you are in this meeting: role, team, what you are responsible for. Import a file or paste.' },
    { id: 'jd', label: 'Meeting brief', short: 'Brief', file: true,
      hint: 'Agenda, project background, the document under discussion, names and terms that will come up.' },
    { id: 'notes', label: 'Notes', short: 'Notes', file: false,
      hint: 'Anything else: what you want out of this meeting, points to raise, things to watch for.' },
  ];
  get contextSlots(): ContextSlotInfo[] {
    return this.sessionKind === 'meeting' ? InterviewComponent.MEETING_SLOTS : InterviewComponent.INTERVIEW_SLOTS;
  }

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

  // ---- Session + notes ----
  /** Id of the session being recorded; null until something is heard or asked. */
  private sessionId: string | null = null;
  private sessionStartedAt = 0;
  /** Listening time of this session (ms), not counting the running stretch. */
  private listenedMs = 0;
  private listenStartedAt = 0;
  elapsedLabel = '00:00';
  notesRaw = '';
  notesHtml = '';
  notesBusy = false;
  notesError = '';
  notesUpdatedAt = 0;
  /** Transcript lines already folded into `notesRaw`. */
  private notesCovered = 0;
  /** The notes already went through the final (titled, tidied) pass. */
  private notesFinal = false;
  private notesRequestId: string | null = null;
  private notesStreamRaw = '';
  private notesFlushScheduled = false;
  private lastNotesAttemptAt = 0;
  private tickTimer: any = null;
  /** New transcript needed before the notes refresh on their own. */
  private static readonly AUTO_NOTES_MIN_CHARS = 400;
  private static readonly AUTO_NOTES_MIN_INTERVAL_MS = 60_000;

  // ---- Saved sessions ----
  sessions: MeetingSessionSummary[] = [];
  sessionsLoading = false;
  /** Saved session opened for reading. */
  viewing: MeetingSession | null = null;
  viewingHtml = '';
  confirmDeleteId: string | null = null;

  @ViewChild('askInput') askInput?: ElementRef<HTMLInputElement>;
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
      this.electronService.onAIStream().subscribe((evt) => { this.onStreamDelta(evt); this.onNotesDelta(evt); }),
      // Ctrl+Shift+V — same hotkey as exam voice capture, here it toggles the live listener.
      this.electronService.onToggleVoiceRecording().subscribe(() => this.toggleListening()),
      // Ctrl+Shift+P — "analyze" in exam mode; here it answers whatever is pending.
      this.electronService.onProcessScreenshots().subscribe(() => this.ngZone.run(() => this.hotkeyAnswer())),
      this.electronService.onTokenUsageUpdated().subscribe((data) => {
        this.ngZone.run(() => {
          if (data.provider !== 'all') {
            // Notes refreshes report usage too; the answer's meta line shows only its own.
            if (!this.isAnswering) return;
            this.lastUsage = { promptTokens: data.promptTokens, completionTokens: data.completionTokens, cost: data.cost };
            this.cdr.detectChanges();
          }
        });
      }),
    );
  }

  ngOnDestroy() {
    this.clearAutoAnswerTimer();
    this.stopTick();
    this.subs.forEach((s) => s.unsubscribe());
    this.subs = [];
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.onDeviceChange);
    // Leaving the mode: keep what was captured, but don't start a notes
    // request nobody will be there to receive.
    if (this.listening || this.connecting) this.stopListening({ finalize: false });
    else void this.saveSession();
  }

  private async loadSettings() {
    try {
      const [settings, speechLanguage, voiceProvider, context] = await Promise.all([
        this.electronService.getInterviewSettings(),
        this.electronService.getVoiceLanguage(),
        this.electronService.getVoiceProvider(),
        this.electronService.getInterviewContext(),
      ]);
      if (context.success && context.data) this.context = context.data;
      this.provider = settings.provider || 'auto';
      this.answerLanguage = settings.answerLanguage || 'auto';
      this.autoAnswer = settings.autoAnswer !== false;
      this.listenMode = settings.listenMode || 'standard';
      this.realtimeModel = settings.realtimeModel || 'gpt-live-transcribe';
      this.audioSource = settings.audioSource || (this.isMac ? 'default' : 'loopback');
      this.sessionKind = settings.sessionKind === 'meeting' ? 'meeting' : 'interview';
      this.autoNotes = settings.autoNotes !== false;
      this.includeMic = settings.includeMic === true;
      this.speechLanguage = speechLanguage || 'auto';
      this.voiceProvider = voiceProvider || 'openai';
    } catch {
      // keep defaults
    }
    await this.refreshInputDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', this.onDeviceChange);
    this.cdr.detectChanges();
  }

  /** Kept as a property so ngOnDestroy can remove exactly this listener. */
  private readonly onDeviceChange = () => { void this.refreshInputDevices(); };

  // ---------------------------------------------------------------------
  // Audio source
  // ---------------------------------------------------------------------

  /** Input devices for the Source picker (labels appear once mic access was granted). */
  async refreshInputDevices() {
    this.inputDevices = await listAudioInputDevices();
    this.cdr.detectChanges();
  }

  get usesInputDevice(): boolean {
    return isInputDeviceSource(this.audioSource);
  }

  get audioSourceHint(): string {
    if (!this.usesInputDevice) {
      return 'Everything playing on the default output device (Windows only). Hears the call, never your microphone.';
    }
    if (this.isMac) {
      return 'macOS has no system loopback: install BlackHole, set a Multi-Output Device (speakers + BlackHole) as the system output, then pick BlackHole here. A real microphone also works when the call runs on another device.';
    }
    return 'An input device. Pick a microphone when the call runs on another device (phone on speaker next to the laptop). It hears you too, so prefer Answer now over auto-answer.';
  }

  async onAudioSourceChange() {
    await this.electronService.saveInterviewSettings({ audioSource: this.audioSource });
    await this.restartListening();
  }

  async onIncludeMicChange() {
    await this.electronService.saveInterviewSettings({ includeMic: this.includeMic });
    await this.restartListening();
  }

  /** Apply a capture setting to a running session without ending the session. */
  private async restartListening() {
    if (!this.listening) return;
    this.stopListening({ finalize: false });
    await this.startListening();
  }

  // ---------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------

  setView(view: View) {
    if (this.collapsed) void this.setCollapsed(false);
    this.view = view;
    if (view === 'notes') this.notesUnread = false;
    if (view === 'sessions') void this.loadSessions();
    this.cdr.detectChanges();
    if (view === 'transcript') this.scrollTranscriptToEnd();
  }

  toggleSettings() {
    this.setView(this.view === 'settings' ? 'assist' : 'settings');
  }

  async setCollapsed(collapsed: boolean) {
    this.collapsed = collapsed;
    this.cdr.detectChanges();
    await this.electronService.setInterviewPanelCollapsed(collapsed);
  }

  focusAsk() {
    this.setView('assist');
    setTimeout(() => this.askInput?.nativeElement.focus());
  }

  hideWindow() { this.electronService.hideWindow(); }
  closeWindow() { this.electronService.closeWindow(); }

  async onKindChange(kind: SessionKind) {
    if (kind === this.sessionKind) return;
    this.sessionKind = kind;
    // A meeting never answers on its own: drop whatever was queued.
    if (kind === 'meeting') this.discardPending();
    this.cdr.detectChanges();
    await this.electronService.saveInterviewSettings({ sessionKind: kind });
  }

  get isMeeting(): boolean {
    return this.sessionKind === 'meeting';
  }

  async onAutoNotesChange() {
    await this.electronService.saveInterviewSettings({ autoNotes: this.autoNotes });
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
    if (this.autoAnswers && this.pendingQuestion.trim()) this.scheduleAutoAnswer();
  }

  async onSpeechLanguageChange() {
    await this.electronService.saveVoiceLanguage(this.speechLanguage);
    // The realtime session pins its language at connect time.
    if (this.listenMode === 'realtime') await this.restartListening();
  }

  async onListenModeChange() {
    await this.electronService.saveInterviewSettings({ listenMode: this.listenMode });
    await this.restartListening();
  }

  get listenModeHint(): string {
    return this.listenModeOptions.find((o) => o.id === this.listenMode)?.hint || '';
  }

  // ---------------------------------------------------------------------
  // Background context (CV / JD / notes)
  // ---------------------------------------------------------------------

  private static emptyContext(): InterviewContext {
    const entry = () => ({ text: '', fileName: null, updatedAt: 0 });
    return { cv: entry(), jd: entry(), notes: entry() };
  }

  /** Slots that currently hold text, e.g. "CV · JD". */
  get contextSummary(): string {
    return this.contextSlots
      .filter((s) => this.context[s.id].text.trim())
      .map((s) => s.short)
      .join(' · ');
  }

  get contextCount(): number {
    return this.contextSlots.filter((s) => this.context[s.id].text.trim()).length;
  }

  /** Textarea `change` (fires on blur): persist what was typed or pasted. */
  async saveContextSlot(slot: InterviewContextSlot) {
    const entry = this.context[slot];
    const res = await this.electronService.saveInterviewContext({
      [slot]: { text: entry.text, fileName: entry.fileName },
    });
    if (res.success && res.data) {
      this.context = res.data;
    } else if (!res.success) {
      this.electronService.showToast(`Context: ${res.error || 'save failed'}`);
    }
    this.cdr.detectChanges();
  }

  async importContextFile(slot: InterviewContextSlot) {
    if (this.contextBusy) return;
    this.contextBusy = slot;
    this.cdr.detectChanges();
    try {
      const res = await this.electronService.importInterviewContextFile(slot);
      if (!res.success) {
        this.electronService.showToast(`Import: ${res.error || 'failed'}`);
      } else if (res.data && !res.data.canceled && res.data.entry) {
        this.context = { ...this.context, [slot]: res.data.entry };
        this.electronService.showToast(`${res.data.entry.fileName} loaded (${res.data.entry.text.length.toLocaleString()} chars)`);
      }
    } catch (err: any) {
      this.electronService.showToast(`Import: ${err?.message || 'failed'}`);
    } finally {
      this.contextBusy = null;
      this.cdr.detectChanges();
    }
  }

  async clearContextSlot(slot: InterviewContextSlot) {
    this.context = { ...this.context, [slot]: { text: '', fileName: null, updatedAt: Date.now() } };
    await this.saveContextSlot(slot);
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
      if (this.usesInputDevice) {
        const access = await this.electronService.requestMicrophoneAccess();
        if (access.success && access.data && !access.data.granted) {
          throw new Error('Microphone access was denied. Allow it in System Settings → Privacy & Security → Microphone.');
        }
      }
      if (this.listenMode === 'realtime') {
        const started = await this.electronService.startRealtimeTranscription({
          language: this.speechLanguage,
          model: this.realtimeModel,
        });
        if (!started.success) throw new Error(started.error || 'Failed to start realtime transcription');
        await this.realtimeListener.start(this.audioSource, { includeMic: this.includeMic });
      } else {
        await this.listener.start(this.audioSource, { includeMic: this.includeMic });
      }
      // A granted permission unlocks device labels.
      if (this.usesInputDevice) void this.refreshInputDevices();
      this.ngZone.run(() => {
        this.listening = true;
        this.connecting = false;
        this.ensureSession();
        this.listenStartedAt = Date.now();
        this.startTick();
        this.cdr.detectChanges();
      });
    } catch (err: any) {
      await this.electronService.stopRealtimeTranscription().catch(() => undefined);
      this.realtimeListener.stop();
      this.ngZone.run(() => {
        this.listening = false;
        this.connecting = false;
        this.electronService.showToast(`Listen: ${err?.message || 'Failed to capture the call audio'}`);
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Stop capturing. By default this also closes out the notes (final pass,
   * when auto-notes is on) and saves the session; `finalize: false` is for
   * restarts and teardown, where the session simply carries on or is saved as is.
   */
  stopListening(options: { finalize?: boolean } = {}) {
    const wasListening = this.listening;
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
      if (wasListening) this.pauseClock();
      this.cdr.detectChanges();
      if (wasListening && options.finalize !== false) void this.finishSession();
      else void this.saveSession();
    });
  }

  private onCaptureEnded(reason: string) {
    this.ngZone.run(() => {
      if (this.listening) this.pauseClock();
      void this.saveSession();
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
    if (this.notesBusy) return 'Writing notes…';
    if (this.listening) return this.listenMode === 'realtime' ? 'Listening · live' : 'Listening';
    return this.segments.length > 0 ? 'Paused' : 'Ready';
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
        if (this.autoAnswers && this.pendingQuestion.trim()) this.scheduleAutoAnswer();
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
            if (this.autoAnswers) this.scheduleAutoAnswer();
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
    if (this.autoAnswers) this.scheduleAutoAnswer();
  }

  /** Auto-answer applies to interviews only; a meeting is helped on demand. */
  get autoAnswers(): boolean {
    return this.autoAnswer && !this.isMeeting;
  }

  private appendTranscript(text: string, at: number) {
    this.ensureSession();
    this.segments.push({
      id: `${at}-${Math.random().toString(36).slice(2, 6)}`,
      text,
      at,
      // Meeting lines are never "waiting for an answer".
      answered: this.isMeeting,
    });
    if (!this.isMeeting) this.pendingQuestion = `${this.pendingQuestion} ${text}`.trim();
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

  /** Ctrl+Shift+P: answer the pending question, or assist when there is none to answer. */
  hotkeyAnswer() {
    if (this.isMeeting) this.runAction('assist');
    else this.answerNow();
  }

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
    this.setView('assist');
    void this.ask('answer', question, question);
  }

  askTyped() {
    const typed = this.typedQuestion.trim();
    if (!typed) return;
    if (this.isAnswering) {
      this.electronService.showToast('Still answering, one moment');
      return;
    }
    this.typedQuestion = '';
    if (this.isMeeting) {
      // A typed question is about the conversation: the transcript goes with it.
      void this.ask('answer', typed, typed);
      return;
    }
    // Typed text takes precedence but keeps any spoken context that's pending.
    this.pendingQuestion = `${typed} ${this.pendingQuestion}`.trim();
    this.answerNow();
  }

  /** Quick action over the recent transcript (Assist, What should I say?, ...). */
  runAction(action: AssistAction) {
    if (this.isAnswering) {
      this.electronService.showToast('Still answering, one moment');
      return;
    }
    // Take the words being spoken right now into account too.
    if (this.liveText.trim()) this.commitLiveText(this.liveText);
    if (this.segments.length === 0) {
      this.electronService.showToast('Nothing heard yet. Press Listen first.');
      return;
    }
    this.clearAutoAnswerTimer();
    // The action reads the whole recent transcript, pending lines included.
    this.pendingQuestion = '';
    this.segments.forEach((s) => (s.answered = true));
    const label = this.quickActions.find((a) => a.id === action)?.label || 'Assist';
    this.setView('assist');
    void this.ask(action, '', label);
  }

  discardPending() {
    this.clearAutoAnswerTimer();
    this.pendingQuestion = '';
    this.segments.forEach((s) => (s.answered = true));
  }

  private genRequestId(prefix = 'interview'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private thinkingHtml(label = 'Thinking…'): string {
    return `<div class="thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="label">${label}</span></div>`;
  }

  private static clock(at: number): string {
    const d = new Date(at);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  /** Transcript lines in the form the model reads: "[HH:MM:SS] text". */
  private transcriptText(from = 0, to = this.segments.length): string {
    return this.segments.slice(from, to).map((s) => `[${InterviewComponent.clock(s.at)}] ${s.text}`).join('\n');
  }

  /** The tail of the transcript sent with a quick action (the main process clips again). */
  private recentTranscript(): string {
    const text = this.transcriptText();
    return text.length > 8000 ? text.slice(text.length - 8000) : text;
  }

  /**
   * @param question what the model is asked (empty for transcript-only actions)
   * @param label    what the answer card and the history show
   */
  private async ask(action: AssistAction, question: string, label: string) {
    this.ensureSession();
    const requestId = this.genRequestId();
    this.activeRequestId = requestId;
    this.streamRaw = '';
    this.isAnswering = true;
    this.currentQuestion = label;
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
        sessionKind: this.sessionKind,
        action,
        transcript: this.recentTranscript(),
      });

      this.ngZone.run(() => {
        if (res.success && res.data) {
          const reply = res.data.reply || '';
          this.answerRaw = reply;
          this.answerHtml = this.markdownService.renderMarkdown(reply);
          this.answeredBy = this.providerLabel(res.data.provider);

          this.conversation.push({ role: 'user', content: question || label }, { role: 'assistant', content: reply });
          if (this.conversation.length > InterviewComponent.MAX_CONTEXT_MESSAGES) {
            this.conversation = this.conversation.slice(-InterviewComponent.MAX_CONTEXT_MESSAGES);
          }

          const entry: QAEntry = {
            id: requestId,
            question: label,
            answerRaw: reply,
            answerHtml: this.answerHtml,
            provider: res.data.provider,
            at: Date.now(),
          };
          this.history.unshift(entry);
          this.persistHistory(entry);
          void this.saveSession();
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
        if (this.followUpQueued || (this.autoAnswers && this.pendingQuestion.trim())) {
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
      prompt: `[${this.isMeeting ? 'Meeting' : 'Interview'}] ${entry.question}`,
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

  /** The last thing heard, shown above the answer so the tab need not be switched. */
  get lastHeard(): string {
    return this.liveText.trim() || this.segments[this.segments.length - 1]?.text || '';
  }

  private async copyText(text: string, done: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.electronService.showToast(done);
    } catch {
      this.electronService.showToast('Copy failed');
    }
  }

  copyAnswer() { void this.copyText(this.answerRaw, 'Answer copied'); }
  copyTranscript() { void this.copyText(this.transcriptText(), 'Transcript copied'); }
  copyNotes() { void this.copyText(this.notesRaw, 'Notes copied'); }

  // ---------------------------------------------------------------------
  // Session clock
  // ---------------------------------------------------------------------

  private ensureSession() {
    if (this.sessionId) return;
    this.sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sessionStartedAt = Date.now();
    this.lastNotesAttemptAt = Date.now();
  }

  private startTick() {
    this.stopTick();
    this.tickTimer = setInterval(() => this.ngZone.run(() => this.onTick()), 1000);
    this.onTick();
  }

  private stopTick() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private pauseClock() {
    if (this.listenStartedAt) this.listenedMs += Date.now() - this.listenStartedAt;
    this.listenStartedAt = 0;
    this.stopTick();
    this.refreshElapsed();
  }

  private refreshElapsed() {
    const ms = this.listenedMs + (this.listenStartedAt ? Date.now() - this.listenStartedAt : 0);
    const total = Math.floor(ms / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const h = Math.floor(total / 3600);
    const label = `${h > 0 ? `${h}:` : ''}${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
    if (label !== this.elapsedLabel) {
      this.elapsedLabel = label;
      this.cdr.detectChanges();
    }
  }

  private onTick() {
    this.refreshElapsed();
    if (!this.autoNotes || this.notesBusy || !this.listening) return;
    if (Date.now() - this.lastNotesAttemptAt < InterviewComponent.AUTO_NOTES_MIN_INTERVAL_MS) return;
    if (this.uncoveredChars() < InterviewComponent.AUTO_NOTES_MIN_CHARS) return;
    void this.updateNotes({ silent: true });
  }

  // ---------------------------------------------------------------------
  // Notes
  // ---------------------------------------------------------------------

  private uncoveredChars(): number {
    let n = 0;
    for (let i = this.notesCovered; i < this.segments.length; i++) n += this.segments[i].text.length;
    return n;
  }

  /** Transcript lines the notes have not seen yet. */
  get notesPendingLines(): number {
    return Math.max(0, this.segments.length - this.notesCovered);
  }

  /**
   * Fold the transcript added since the last update into the notes. The model
   * gets the notes so far plus only the new lines, and returns the full
   * updated notes, so an update costs the same early and late in a meeting.
   */
  async updateNotes(options: { final?: boolean; silent?: boolean } = {}): Promise<boolean> {
    if (this.notesBusy) return false;
    if (this.liveText.trim()) this.commitLiveText(this.liveText);
    const upto = this.segments.length;
    const hasNew = upto > this.notesCovered;
    // Nothing new: only worth a call when existing notes still need the final pass.
    if (!hasNew && !(options.final && this.notesRaw && !this.notesFinal)) {
      if (!options.silent) {
        this.electronService.showToast(this.segments.length ? 'Notes are up to date' : 'Nothing heard yet. Press Listen first.');
      }
      return false;
    }

    const requestId = this.genRequestId('notes');
    this.notesRequestId = requestId;
    this.notesStreamRaw = '';
    this.notesBusy = true;
    this.notesError = '';
    if (!this.notesRaw) this.notesHtml = this.thinkingHtml('Writing notes…');
    this.cdr.detectChanges();

    let ok = false;
    try {
      const res = await this.electronService.generateMeetingNotes({
        provider: this.provider,
        sessionKind: this.sessionKind,
        newTranscript: this.transcriptText(this.notesCovered, upto),
        previousNotes: this.notesRaw,
        language: this.answerLanguage,
        final: !!options.final,
        requestId,
      });
      if (res.success && res.data) {
        this.notesRaw = res.data.notes;
        this.notesCovered = upto;
        this.notesFinal = !!options.final;
        this.notesUpdatedAt = Date.now();
        if (this.view !== 'notes' || this.collapsed) this.notesUnread = true;
        ok = true;
      } else {
        this.notesError = res.error || 'Notes request failed';
      }
    } catch (err: any) {
      this.notesError = err?.message || 'Notes request failed';
    } finally {
      this.notesRequestId = null;
      this.notesBusy = false;
      this.lastNotesAttemptAt = Date.now();
      // Success or not, show the last good notes rather than a half stream.
      this.notesHtml = this.notesRaw ? this.markdownService.renderMarkdown(this.notesRaw) : '';
      this.ngZone.run(() => this.cdr.detectChanges());
    }
    await this.saveSession();
    return ok;
  }

  private onNotesDelta(evt: { requestId: string; delta: string }) {
    if (!this.notesRequestId || evt.requestId !== this.notesRequestId) return;
    this.notesStreamRaw += evt.delta;
    if (this.notesFlushScheduled) return;
    this.notesFlushScheduled = true;
    setTimeout(() => {
      this.notesFlushScheduled = false;
      if (!this.notesRequestId) return;
      const html = this.markdownService.renderMarkdown(this.notesStreamRaw);
      this.ngZone.run(() => {
        this.notesHtml = html;
        this.cdr.detectChanges();
      });
    }, 120);
  }

  /** Listening stopped: final notes pass (when notes are on), then save. */
  private async finishSession() {
    const worthNotes = this.segments.length > 0 && (this.autoNotes || !!this.notesRaw);
    if (worthNotes) {
      const ok = await this.updateNotes({ final: true, silent: true });
      if (ok) this.electronService.showToast('Notes saved to Sessions');
    } else {
      await this.saveSession();
    }
  }

  // ---------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------

  get hasSessionContent(): boolean {
    return this.segments.length > 0 || this.history.length > 0 || !!this.notesRaw;
  }

  /** The live session as it would be saved. Empty title: main derives one. */
  private buildSession(): MeetingSession | null {
    if (!this.sessionId || !this.hasSessionContent) return null;
    const lastAt = this.segments[this.segments.length - 1]?.at || 0;
    return {
      id: this.sessionId,
      kind: this.sessionKind,
      title: '',
      startedAt: this.sessionStartedAt,
      endedAt: Math.max(lastAt, this.listening ? Date.now() : 0, this.sessionStartedAt + this.listenedMs),
      notes: this.notesRaw,
      transcript: this.segments.map((s) => ({ at: s.at, text: s.text })),
      // `history` is newest first; a saved session reads oldest first.
      qa: [...this.history].reverse().map((h) => ({ at: h.at, question: h.question, answer: h.answerRaw })),
      updatedAt: Date.now(),
    };
  }

  private async saveSession() {
    const session = this.buildSession();
    if (!session) return;
    try {
      const res = await this.electronService.saveMeetingSession(session);
      if (!res.success) console.warn('Session save failed:', res.error);
      else if (this.view === 'sessions') void this.loadSessions();
    } catch (err) {
      console.warn('Session save failed:', err);
    }
  }

  async exportCurrent() {
    const session = this.buildSession();
    if (!session) {
      this.electronService.showToast('Nothing to export yet');
      return;
    }
    await this.exportSession(session);
  }

  async exportSession(session: MeetingSession) {
    const res = await this.electronService.exportMeetingSession(session);
    if (!res.success) this.electronService.showToast(`Export: ${res.error || 'failed'}`);
    else if (res.data && !res.data.canceled) this.electronService.showToast('Notes exported');
  }

  /** Save what there is and start from a clean slate. */
  async newSession() {
    if (this.listening || this.connecting) this.stopListening({ finalize: false });
    await this.saveSession();
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
    this.sessionId = null;
    this.sessionStartedAt = 0;
    this.listenedMs = 0;
    this.listenStartedAt = 0;
    this.elapsedLabel = '00:00';
    this.notesRaw = '';
    this.notesHtml = '';
    this.notesError = '';
    this.notesUpdatedAt = 0;
    this.notesCovered = 0;
    this.notesFinal = false;
    this.notesUnread = false;
    this.cdr.detectChanges();
  }

  async loadSessions() {
    this.sessionsLoading = this.sessions.length === 0;
    this.cdr.detectChanges();
    try {
      const res = await this.electronService.listMeetingSessions();
      if (res.success && res.data) this.sessions = res.data;
      else if (!res.success) this.electronService.showToast(`Sessions: ${res.error || 'failed to load'}`);
    } finally {
      this.sessionsLoading = false;
      this.cdr.detectChanges();
    }
  }

  async openSession(summary: MeetingSessionSummary) {
    const res = await this.electronService.getMeetingSession(summary.id);
    if (!res.success || !res.data) {
      this.electronService.showToast(`Sessions: ${res.error || 'could not open'}`);
      return;
    }
    this.viewing = res.data;
    this.viewingHtml = res.data.notes ? this.markdownService.renderMarkdown(res.data.notes) : '';
    this.confirmDeleteId = null;
    this.cdr.detectChanges();
  }

  closeSession() {
    this.viewing = null;
    this.viewingHtml = '';
    this.confirmDeleteId = null;
    this.cdr.detectChanges();
  }

  copyViewingNotes() {
    if (this.viewing) void this.copyText(this.viewing.notes, 'Notes copied');
  }

  /** First click arms the button, second click deletes. */
  async deleteSession(id: string) {
    if (this.confirmDeleteId !== id) {
      this.confirmDeleteId = id;
      this.cdr.detectChanges();
      return;
    }
    this.confirmDeleteId = null;
    const res = await this.electronService.deleteMeetingSession(id);
    if (!res.success) {
      this.electronService.showToast(`Delete: ${res.error || 'failed'}`);
      return;
    }
    // Deleting the session being recorded: detach, so the next save makes a new file.
    if (id === this.sessionId) this.sessionId = null;
    if (this.viewing?.id === id) this.closeSession();
    this.sessions = this.sessions.filter((s) => s.id !== id);
    this.cdr.detectChanges();
  }

  sessionMinutes(s: { startedAt: number; endedAt: number }): number {
    return Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000));
  }

  isLiveSession(id: string): boolean {
    return id === this.sessionId;
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
