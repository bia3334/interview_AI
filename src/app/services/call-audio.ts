/**
 * Where interview mode listens for the call.
 *
 *   'loopback'  — the OS mixes everything playing on the default output
 *                 device into a capture stream (Windows WASAPI loopback,
 *                 answered by setDisplayMediaRequestHandler in the main
 *                 process). Hears the far end only, never the microphone.
 *   <deviceId>  — a regular audio input device via getUserMedia. Two uses:
 *                 · macOS, where Electron has no loopback: route the system
 *                   output through a virtual device (BlackHole) and pick it here;
 *                 · a real microphone, when the call runs on another device
 *                   (a phone on speaker next to the laptop). Picks up your own
 *                   voice too, so answer on demand rather than automatically.
 *   'default'   — the OS default input device.
 */
// `string & {}` keeps the two literals from being absorbed into `string`, so
// editors still offer them while any deviceId remains assignable.
export type AudioSource = 'loopback' | 'default' | (string & {});

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

/** True when the source is an input device rather than the loopback mix. */
export function isInputDeviceSource(source: AudioSource): boolean {
  return source !== 'loopback';
}

export interface CaptureOptions {
  /**
   * Loopback only: also open the default microphone and mix it in, so both
   * sides of the conversation are transcribed (meeting notes need my side
   * too). Echo cancellation stays on for the microphone so speakers playing
   * the call are not transcribed twice.
   */
  includeMic?: boolean;
}

/** Extra teardown for streams that are a mix of several captures. */
const releasers = new WeakMap<MediaStream, () => void>();

/** Stop a stream returned by captureCallAudio, including what feeds a mix. */
export function releaseCallAudio(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
  releasers.get(stream)?.();
  releasers.delete(stream);
}

/**
 * Open the call audio as an audio-only MediaStream. The caller owns the
 * stream and must hand it to releaseCallAudio when done.
 */
export async function captureCallAudio(source: AudioSource, options: CaptureOptions = {}): Promise<MediaStream> {
  const call = await captureSource(source);
  if (!options.includeMic || isInputDeviceSource(source)) return call;

  let mic: MediaStream;
  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch (err: any) {
    call.getTracks().forEach((track) => track.stop());
    throw new Error(`Could not open your microphone (${err?.name || err?.message || 'unknown error'}). Turn off "Include my microphone" or allow microphone access.`);
  }

  const context = new AudioContext();
  await context.resume().catch(() => undefined);
  const mix = context.createMediaStreamDestination();
  context.createMediaStreamSource(call).connect(mix);
  context.createMediaStreamSource(mic).connect(mix);
  const mixedTrack = mix.stream.getAudioTracks()[0];
  // The mix never ends on its own; pass on the end of the call capture so
  // listeners still notice when the system audio goes away.
  call.getAudioTracks()[0].addEventListener('ended', () => mixedTrack.dispatchEvent(new Event('ended')));
  releasers.set(mix.stream, () => {
    call.getTracks().forEach((track) => track.stop());
    mic.getTracks().forEach((track) => track.stop());
    context.close().catch(() => undefined);
  });
  return mix.stream;
}

async function captureSource(source: AudioSource): Promise<MediaStream> {
  if (!isInputDeviceSource(source)) {
    // Main process answers with the primary screen + audio: 'loopback'.
    // Only the audio track is kept.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    } catch (err: any) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw new Error('System audio capture was refused. Allow screen recording for this app in the OS privacy settings and try again.');
      }
      if (name === 'NotSupportedError' || name === 'NotFoundError') {
        throw new Error('System audio capture is not available on this system. Pick an input device (e.g. BlackHole on macOS) as the audio source.');
      }
      throw new Error(err?.message || 'Could not start system audio capture.');
    }
    stream.getVideoTracks().forEach((track) => track.stop());
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        'No system audio track captured. Windows: make sure the call plays on the default output device. ' +
        'macOS: system loopback is not available — install BlackHole and pick it as the audio source.'
      );
    }
    return new MediaStream(audioTracks);
  }

  // Raw input, no voice processing: AEC/AGC would mangle a loopback feed
  // and add latency to a microphone.
  const constraints: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (source !== 'default') constraints.deviceId = { exact: source };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: constraints, video: false });
  } catch (err: any) {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      throw new Error('Microphone access was denied. Allow it for this app in the OS privacy settings and try again.');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new Error('The selected audio input device was not found. Pick another source.');
    }
    throw new Error(err?.message || 'Could not open the audio input device.');
  }
}

/** Audio input devices the user can pick from (labels need a prior permission grant). */
export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    let n = 0;
    return devices
      .filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Audio input ${++n}` }));
  } catch {
    return [];
  }
}
