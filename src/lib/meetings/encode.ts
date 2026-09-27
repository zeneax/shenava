import { describeError } from "../describe-error.ts";
import { muxOpusOgg, OPUS_GRANULE_RATE, type OpusPacket } from "./ogg.ts";
import { LONG_PIECE_BITRATE } from "./segments.ts";

/**
 * A piece of decoded speech, as Opus in Ogg, from the browser's own encoder.
 *
 * `AudioEncoder` (WebCodecs) hands back Opus packets, twenty milliseconds
 * each, and nothing else — no container. `lib/meetings/ogg` writes the
 * container; this file is the join. Client-only at call time: it touches
 * `AudioEncoder` and `AudioData`, which exist in a browser and nowhere else,
 * so the page asks `canEncodeOpus()` before offering the long mode at all.
 *
 * The samples arrive at the kernel's rate (16 kHz mono), which Opus takes
 * natively. Timestamps go in as microseconds; the granule of a packet is
 * where it ends, in 48 kHz samples, whatever the input rate.
 */

type EncoderWindow = typeof globalThis & {
  AudioEncoder?: {
    new (init: { output: (chunk: EncodedChunk) => void; error: (e: unknown) => void }): AudioEncoderLike;
    isConfigSupported(config: OpusConfig): Promise<{ supported?: boolean }>;
  };
  AudioData?: new (init: {
    format: "f32";
    sampleRate: number;
    numberOfFrames: number;
    numberOfChannels: number;
    timestamp: number;
    data: BufferSource;
  }) => AudioDataLike;
};

type OpusConfig = { codec: "opus"; sampleRate: number; numberOfChannels: number; bitrate: number };
type EncodedChunk = { byteLength: number; timestamp: number; duration?: number | null; copyTo(dest: ArrayBufferView): void };
type AudioDataLike = { close(): void };
type AudioEncoderLike = {
  configure(config: OpusConfig): void;
  encode(data: AudioDataLike): void;
  flush(): Promise<void>;
  close(): void;
};

function configFor(sampleRate: number): OpusConfig {
  return { codec: "opus", sampleRate, numberOfChannels: 1, bitrate: LONG_PIECE_BITRATE };
}

/** Whether this browser can encode Opus at the kernel's rate. False on the server. */
export async function canEncodeOpus(sampleRate: number): Promise<boolean> {
  const w = globalThis as EncoderWindow;
  if (!w.AudioEncoder || !w.AudioData) return false;
  try {
    const { supported } = await w.AudioEncoder.isConfigSupported(configFor(sampleRate));
    return Boolean(supported);
  } catch {
    return false;
  }
}

/** The samples as an Ogg Opus stream. Throws when the browser cannot encode. */
export async function encodeOpusOgg(samples: Float32Array, sampleRate: number): Promise<Uint8Array> {
  const w = globalThis as EncoderWindow;
  if (!w.AudioEncoder || !w.AudioData) throw new Error("no_encoder");
  const AudioEncoderCtor = w.AudioEncoder;
  const AudioDataCtor = w.AudioData;

  const packets: OpusPacket[] = [];
  let failure: unknown = null;
  const encoder = new AudioEncoderCtor({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      // Twenty milliseconds unless the encoder says otherwise.
      const duration = chunk.duration ?? 20_000;
      const endUs = chunk.timestamp + duration;
      packets.push({ data, granule: Math.round((endUs / 1_000_000) * OPUS_GRANULE_RATE) });
    },
    error: (e) => { failure = e; },
  });
  encoder.configure(configFor(sampleRate));

  // A second at a time: the encoder cuts its own frames, and a second keeps
  // the number of AudioData objects — each a copy — in the hundreds.
  const step = sampleRate;
  for (let offset = 0; offset < samples.length; offset += step) {
    // A copy, not a view: AudioData wants a buffer of its own, and a view over
    // the whole recording would hand it 230 MB to hold on to.
    const slice = new Float32Array(samples.subarray(offset, Math.min(samples.length, offset + step)));
    const data = new AudioDataCtor({
      format: "f32",
      sampleRate,
      numberOfFrames: slice.length,
      numberOfChannels: 1,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: slice,
    });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();
  // Wrapped, never rethrown as it came. `AudioEncoder` hands its error callback
  // whatever it likes — a DOMException in Chrome, and not necessarily an Error
  // at all — and a rejection that is not an Error reaches the development
  // overlay as the word `[object Object]` with no stack worth reading.
  if (failure) throw new Error(`opus encoder: ${describeError(failure)}`);

  packets.sort((a, b) => a.granule - b.granule);
  return muxOpusOgg(packets, { channels: 1, inputRate: sampleRate });
}
