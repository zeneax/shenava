"use client";

import { timing } from "@mazarix/voice-kernel";

/**
 * Whatever the browser recorded, turned into what the model actually accepts.
 *
 * WHY THIS EXISTS AT ALL. `input_audio` takes a `format` from a fixed list —
 * wav, mp3, aiff, aac, ogg, flac, m4a, pcm16, pcm24 — and **webm is not on
 * it**. Chrome and Firefox record webm and offer nothing else, so every
 * recording from the two most common desktop browsers was rejected. Worse,
 * the rejection is a 400, which the kernel's retry policy retries on purpose:
 * one unusable clip was three paid attempts before it failed.
 *
 * So the browser does what the macOS app already does — resample to the
 * kernel's own wire format and send WAV. That is not a workaround, it is the
 * same decision made in the same place for the same reason, and it makes every
 * client identical: one container, one sample rate, one path through the
 * model. The alternative, mapping each browser's container to a format the
 * provider might accept, is a matrix that has to be re-tested every time a
 * browser changes its default.
 *
 * Size is not a problem: thirty seconds at 16 kHz mono PCM16 is 960 kB,
 * comfortably inside the endpoint's two-megabyte cap.
 */

/** Average every `factor` samples into one. */
export function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let n = 0;
    for (let j = start; j < end; j += 1) { sum += input[j] ?? 0; n += 1; }
    // Averaging rather than picking every nth sample. Decimating without a
    // low-pass folds everything above the new Nyquist back into the audible
    // band as noise, and speech recognition hears that as a worse microphone.
    out[i] = n > 0 ? sum / n : 0;
  }
  return out;
}

/** Every channel averaged into one, which is what 16 kHz mono means. */
export function toMono(channels: Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  const out = new Float32Array(first.length);
  for (let i = 0; i < out.length; i += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] ?? 0;
    out[i] = sum / channels.length;
  }
  return out;
}

/** A minimal RIFF/WAVE container around PCM16, exactly as the kernel describes it. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const header = timing.audio.wavHeaderBytes;
  const bytesPerSample = timing.audio.bitsPerSample / 8;
  const buffer = new ArrayBuffer(header + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);            // PCM chunk size
  view.setUint16(20, 1, true);             // format: PCM
  view.setUint16(22, timing.audio.channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * timing.audio.channels * bytesPerSample, true);
  view.setUint16(32, timing.audio.channels * bytesPerSample, true);
  view.setUint16(34, timing.audio.bitsPerSample, true);
  text(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = header;
  for (let i = 0; i < samples.length; i += 1) {
    // Clamped before scaling: a sample past ±1 wraps rather than clips once it
    // is an integer, and a wrap is a loud click where a clip is nothing.
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += bytesPerSample;
  }
  return buffer;
}

/** Decode, downmix, resample, re-encode. */
export async function toWav(blob: Blob): Promise<Blob> {
  const bytes = await blob.arrayBuffer();
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(bytes);
    const channels: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c += 1) channels.push(decoded.getChannelData(c));
    const mono = toMono(channels);
    const resampled = downsample(mono, decoded.sampleRate, timing.audio.sampleRate);
    return new Blob([encodeWav(resampled, timing.audio.sampleRate)], { type: "audio/wav" });
  } finally {
    // Closed on every path. An AudioContext left open holds the audio hardware
    // awake and the tab shows as playing.
    void context.close().catch(() => {});
  }
}
