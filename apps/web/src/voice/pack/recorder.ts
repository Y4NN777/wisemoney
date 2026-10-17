/** Longest recording the pack accepts: a spoken movement is a few seconds; Whisper reads 30 s at most. */
export const MAX_RECORDING_MS = 15_000;

export type Recording = { stop: () => void; done: Promise<Blob> };

export class MicrophoneDenied extends Error {}

/** Records from the microphone until stop() or the time limit; the microphone is released at the end. */
export async function startRecording(): Promise<Recording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) throw new MicrophoneDenied();
    throw error;
  }
  const media = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  const done = new Promise<Blob>((resolve, reject) => {
    media.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
    media.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      resolve(new Blob(chunks, { type: media.mimeType }));
    };
    media.onerror = () => {
      stream.getTracks().forEach((track) => track.stop());
      reject(new Error("recording failed"));
    };
  });
  const limit = window.setTimeout(() => { if (media.state === "recording") media.stop(); }, MAX_RECORDING_MS);
  media.start();
  return {
    stop: () => {
      window.clearTimeout(limit);
      if (media.state === "recording") media.stop();
    },
    done,
  };
}
