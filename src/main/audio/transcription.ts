/**
 * Audio transcription using OpenAI Whisper or Google Gemini.
 *
 * Both providers reuse the API keys already configured for chat,
 * so no new credentials are required.
 */
import { getGeminiClient, getOpenAIClient, getCurrentGeminiModel } from '../ai/clients';
import type { AppStore } from '../store';

const { toFile } = require('openai');

export type TranscriptionProvider = 'openai' | 'gemini';

/** Spoken language hint. 'auto' lets the model detect English vs Vietnamese. */
export type TranscriptionLanguage = 'auto' | 'en' | 'vi';

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  error?: string;
}

function fileExtensionForMime(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  return 'webm';
}

export function normalizeTranscriptionLanguage(value: unknown): TranscriptionLanguage {
  return value === 'en' || value === 'vi' ? value : 'auto';
}

async function transcribeWithWhisper(
  audioBuffer: Buffer,
  mimeType: string,
  language: TranscriptionLanguage,
  store: AppStore,
  log: any
): Promise<TranscriptionResult> {
  const openai = getOpenAIClient(store);
  const ext = fileExtensionForMime(mimeType);
  const file = await toFile(audioBuffer, `voice-${Date.now()}.${ext}`, { type: mimeType });

  log.info(`Whisper: transcribing ${audioBuffer.length} bytes (${mimeType}, lang=${language})`);
  const request: any = { file, model: 'whisper-1' };
  // Omitting `language` makes Whisper auto-detect; pinning it avoids the
  // occasional wrong-language hallucination on short, accented utterances.
  if (language !== 'auto') request.language = language;
  const response = await openai.audio.transcriptions.create(request);
  return { success: true, text: response.text || '' };
}

function geminiTranscriptionInstruction(language: TranscriptionLanguage): string {
  switch (language) {
    case 'en':
      return 'Transcribe the spoken English content of the following audio verbatim, in English only. Return only the transcribed text with no commentary or formatting.';
    case 'vi':
      return 'Chép lại nguyên văn nội dung tiếng Việt trong đoạn âm thanh sau, giữ nguyên các thuật ngữ tiếng Anh nếu có. Chỉ trả về phần văn bản đã chép, không thêm bình luận hay định dạng.';
    default:
      return 'Transcribe the speech in the following audio verbatim. It is either English or Vietnamese (possibly mixed, with English technical terms). Keep the original language of each word — do not translate. Return only the transcribed text with no commentary or formatting. If there is no speech, return an empty string.';
  }
}

async function transcribeWithGemini(
  audioBuffer: Buffer,
  mimeType: string,
  language: TranscriptionLanguage,
  store: AppStore,
  log: any
): Promise<TranscriptionResult> {
  const ai = getGeminiClient(store);
  const base64Audio = audioBuffer.toString('base64');
  const geminiModel = getCurrentGeminiModel(store);
  const cleanMime = mimeType.split(';')[0].trim();

  log.info(`Gemini: transcribing ${audioBuffer.length} bytes (original: ${mimeType}, cleaned: ${cleanMime}, lang=${language}) with ${geminiModel}`);

  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: [{
      role: 'user',
      parts: [
        { text: geminiTranscriptionInstruction(language) },
        { inlineData: { mimeType: cleanMime, data: base64Audio } },
      ],
    }],
  });

  const text = response.text || '';
  return { success: true, text };
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  provider: TranscriptionProvider,
  store: AppStore,
  log: any,
  language: TranscriptionLanguage = 'auto'
): Promise<TranscriptionResult> {
  try {
    if (provider === 'openai') {
      return await transcribeWithWhisper(audioBuffer, mimeType, language, store, log);
    }
    if (provider === 'gemini') {
      return await transcribeWithGemini(audioBuffer, mimeType, language, store, log);
    }
    return { success: false, error: `Unknown transcription provider: ${provider}` };
  } catch (error: any) {
    log.error(`Transcription failed (${provider}):`, error);
    return { success: false, error: error.message || 'Transcription failed' };
  }
}
