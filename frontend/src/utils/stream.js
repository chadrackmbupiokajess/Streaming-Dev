export const STREAM_CONFIG = {
  width: 1280,
  height: 720,
  captureFps: 25,
  imageMimeType: 'image/webp',
  imageQuality: 0.92,
  maxBufferedBytes: 72 * 1024,
  videoDiffThreshold: 28,
  videoFullFrameRatio: 0.42,
  videoKeyframeIntervalMs: 1800,
  videoSampleStride: 8,
  videoTileSize: 16,
  audioBitsPerSecond: 128000,
  audioBufferLeadSeconds: 0.08,
  audioChannels: 1,
  audioFrameSamples: 2048,
  audioMaxLeadSeconds: 0.35,
  audioMinLeadSeconds: 0.03,
  audioSampleRate: 48000,
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function encodeMediaPacket(header, payload) {
  const headerBytes = textEncoder.encode(JSON.stringify(header));
  const payloadBuffer =
    payload instanceof ArrayBuffer ? payload : await payload.arrayBuffer();
  const packet = new Uint8Array(4 + headerBytes.byteLength + payloadBuffer.byteLength);
  const view = new DataView(packet.buffer);

  view.setUint32(0, headerBytes.byteLength, true);
  packet.set(headerBytes, 4);
  packet.set(new Uint8Array(payloadBuffer), 4 + headerBytes.byteLength);

  return packet.buffer;
}

export function decodeMediaPacket(buffer) {
  const view = new DataView(buffer);
  const headerLength = view.getUint32(0, true);
  const headerBytes = new Uint8Array(buffer, 4, headerLength);
  const payload = buffer.slice(4 + headerLength);

  return {
    header: JSON.parse(textDecoder.decode(headerBytes)),
    payload,
  };
}

export function alignRect(rect, frameWidth, frameHeight, tileSize) {
  const x = Math.max(0, Math.floor(rect.x / tileSize) * tileSize);
  const y = Math.max(0, Math.floor(rect.y / tileSize) * tileSize);
  const maxX = Math.min(
    frameWidth,
    Math.ceil((rect.x + rect.width) / tileSize) * tileSize
  );
  const maxY = Math.min(
    frameHeight,
    Math.ceil((rect.y + rect.height) / tileSize) * tileSize
  );

  return {
    x,
    y,
    width: Math.max(tileSize, maxX - x),
    height: Math.max(tileSize, maxY - y),
  };
}

export function detectMotionRect(current, previous, width, height) {
  if (!previous || previous.length !== current.length) {
    return {
      x: 0,
      y: 0,
      width,
      height,
      ratio: 1,
    };
  }

  const {
    videoDiffThreshold: threshold,
    videoSampleStride: sampleStride,
  } = STREAM_CONFIG;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let changedSamples = 0;
  let totalSamples = 0;

  for (let y = 0; y < height; y += sampleStride) {
    for (let x = 0; x < width; x += sampleStride) {
      const offset = (y * width + x) * 4;
      const diff =
        Math.abs(current[offset] - previous[offset]) +
        Math.abs(current[offset + 1] - previous[offset + 1]) +
        Math.abs(current[offset + 2] - previous[offset + 2]);

      totalSamples += 1;

      if (diff < threshold) {
        continue;
      }

      changedSamples += 1;
      if (x < minX) {
        minX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: Math.min(width - minX, maxX - minX + sampleStride),
    height: Math.min(height - minY, maxY - minY + sampleStride),
    ratio: changedSamples / Math.max(1, totalSamples),
  };
}

export function createPcmChunk(float32Array) {
  const pcm = new Int16Array(float32Array.length);
  for (let index = 0; index < float32Array.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm.buffer;
}

export function readPcmChunk(arrayBuffer) {
  const pcm = new Int16Array(arrayBuffer);
  const samples = new Float32Array(pcm.length);
  for (let index = 0; index < pcm.length; index += 1) {
    samples[index] = pcm[index] / 0x8000;
  }
  return samples;
}
