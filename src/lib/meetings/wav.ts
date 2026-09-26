import { timing } from "@mazarix/voice-kernel";

/**
 * Cutting a WAV the browser already made, on the server.
 *
 * The pieces arrive as 16 kHz mono PCM16 with the kernel's 44-byte header,
 * which is the one container simple enough to split without decoding: the
 * samples are the bytes after the header, two per sample. So a piece the
 * provider refused can be halved here and each half asked for on its own,
 * without a round trip to the browser and without any audio library.
 *
 * Pure and client-safe; tested against a header the tests build themselves.
 */

const HEADER = timing.audio.wavHeaderBytes;
const BYTES_PER_SAMPLE = timing.audio.bitsPerSample / 8;

/** Whether the bytes are the header this file knows how to cut. */
export function isKernelWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < HEADER) return false;
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  return tag(0) === "RIFF" && tag(8) === "WAVE" && tag(36) === "data";
}

function withHeader(samples: Uint8Array, sampleRate: number, channels: number): Uint8Array {
  const out = new Uint8Array(HEADER + samples.byteLength);
  const view = new DataView(out.buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) out[at + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.byteLength, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * BYTES_PER_SAMPLE, true);
  view.setUint16(32, channels * BYTES_PER_SAMPLE, true);
  view.setUint16(34, timing.audio.bitsPerSample, true);
  text(36, "data");
  view.setUint32(40, samples.byteLength, true);
  out.set(samples, HEADER);
  return out;
}

/**
 * Two WAVs from one, cut at the middle sample. Returns null for anything that
 * is not the kernel's container, or too short to be worth halving.
 */
export function halveWav(bytes: Uint8Array): [Uint8Array, Uint8Array] | null {
  if (!isKernelWav(bytes)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const frame = channels * BYTES_PER_SAMPLE;
  const data = bytes.subarray(HEADER);
  const frames = Math.floor(data.byteLength / frame);
  // Under two seconds a side there is nothing to gain from asking twice.
  if (frames < 4 * sampleRate) return null;
  const midFrame = Math.floor(frames / 2);
  const cut = midFrame * frame;
  return [
    withHeader(data.subarray(0, cut), sampleRate, channels),
    withHeader(data.subarray(cut, frames * frame), sampleRate, channels),
  ];
}

/** How long a kernel WAV plays, in milliseconds. Zero for anything else. */
export function wavDurationMs(bytes: Uint8Array): number {
  if (!isKernelWav(bytes)) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const frames = Math.floor((bytes.byteLength - HEADER) / (channels * BYTES_PER_SAMPLE));
  return Math.round((frames / sampleRate) * 1000);
}
