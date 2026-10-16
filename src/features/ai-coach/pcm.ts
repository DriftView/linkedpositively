/**
 * Audio helpers for the video coach. Anam lip-syncs raw 16-bit PCM
 * (little-endian, mono, 16 kHz); ElevenLabs sends MP3, which the browser
 * decodes to float samples. Pure functions, so they're testable without a
 * browser.
 */

export const PCM_SAMPLE_RATE = 16_000;
/** Half a second per message, so no single send is large. */
export const PCM_CHUNK_SAMPLES = PCM_SAMPLE_RATE / 2;

/** Mixes the channels to mono and resamples (linear) to 16-bit PCM at `targetRate`. */
export function toPcm16(channels: Float32Array[], sampleRate: number, targetRate = PCM_SAMPLE_RATE): Int16Array {
  const length = channels[0]?.length ?? 0;
  if (!length || !sampleRate) return new Int16Array(0);
  const outLength = Math.max(1, Math.round((length * targetRate) / sampleRate));
  const step = sampleRate / targetRate;
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const position = i * step;
    const left = Math.min(length - 1, Math.floor(position));
    const right = Math.min(length - 1, left + 1);
    const t = position - left;
    let sample = 0;
    for (const channel of channels) sample += channel[left]! * (1 - t) + channel[right]! * t;
    sample = Math.max(-1, Math.min(1, sample / channels.length));
    out[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return out;
}

/** The PCM as little-endian byte chunks of at most `maxSamples` samples each. */
export function pcmChunks(pcm: Int16Array, maxSamples = PCM_CHUNK_SAMPLES): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < pcm.length; start += maxSamples) {
    const part = pcm.subarray(start, start + maxSamples);
    const bytes = new Uint8Array(part.length * 2);
    const view = new DataView(bytes.buffer);
    part.forEach((sample, i) => view.setInt16(i * 2, sample, true));
    chunks.push(bytes);
  }
  return chunks;
}

/** Loudness (0–1) of `samples` around `ms`, scaled like the avatar's analyser level. */
export function levelAt(samples: Float32Array, sampleRate: number, ms: number, windowMs = 30): number {
  const center = Math.floor((ms / 1000) * sampleRate);
  const half = Math.floor((windowMs / 1000) * sampleRate) / 2;
  const start = Math.max(0, center - half);
  const end = Math.min(samples.length, center + half);
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i]! ** 2;
  return Math.min(1, Math.sqrt(sum / (end - start)) * 4.5);
}
