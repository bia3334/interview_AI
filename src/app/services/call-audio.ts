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
export type AudioSource = 'loopback' | 'default' | string;

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

/** True when the source is an input device rather than the loopback mix. */
export function isInputDeviceSource(source: AudioSource): boolean {
  return source !== 'loopback';
}

/**
 * Open the call audio as an audio-only MediaStream. The caller owns the
 * stream and must stop its tracks when done.
 */
export async function captureCallAudio(source: AudioSource): Promise<MediaStream> {
  if (!isInputDeviceSource(source)) {
    // Main process answers with the primary screen + audio: 'loopback'.
    // Only the audio track is kept.
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
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
