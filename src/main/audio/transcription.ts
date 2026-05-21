/**
 * Audio transcription using OpenAI Whisper or Google Gemini.
 *
 * Both providers reuse the API keys already configured for chat,
 * so no new credentials are required.
 */
import { getGeminiClient, getOpenAIClient } from '../ai/clients';
import type { AppStore } from '../store';

const { toFile } = require('openai');

export type TranscriptionProvider = 'openai' | 'gemini';

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

async function transcribeWithWhisper(
  audioBuffer: Buffer,
  mimeType: string,
  store: AppStore,
  log: any
): Promise<TranscriptionResult> {
  const openai = getOpenAIClient(store);
  const ext = fileExtensionForMime(mimeType);
  const file = await toFile(audioBuffer, `voice-${Date.now()}.${ext}`, { type: mimeType });

  log.info(`Whisper: transcribing ${audioBuffer.length} bytes (${mimeType})`);
  const response = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
  });
  return { success: true, text: response.text || '' };
}

async function transcribeWithGemini(
  audioBuffer: Buffer,
  mimeType: string,
  store: AppStore,
  log: any
): Promise<TranscriptionResult> {
  const ai = getGeminiClient(store);
  const base64Audio = audioBuffer.toString('base64');
  const geminiModel = store.get('geminiModel') || 'gemini-2.0-flash';

  log.info(`Gemini: transcribing ${audioBuffer.length} bytes (${mimeType}) with ${geminiModel}`);

  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: [{
      role: 'user',
      parts: [
        { text: 'Transcribe the spoken content of the following audio. Return only the transcribed text with no commentary or formatting.' },
        { inlineData: { mimeType, data: base64Audio } },
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
  log: any
): Promise<TranscriptionResult> {
  try {
    if (provider === 'openai') {
      return await transcribeWithWhisper(audioBuffer, mimeType, store, log);
    }
    if (provider === 'gemini') {
      return await transcribeWithGemini(audioBuffer, mimeType, store, log);
    }
    return { success: false, error: `Unknown transcription provider: ${provider}` };
  } catch (error: any) {
    log.error(`Transcription failed (${provider}):`, error);
    return { success: false, error: error.message || 'Transcription failed' };
  }
}
