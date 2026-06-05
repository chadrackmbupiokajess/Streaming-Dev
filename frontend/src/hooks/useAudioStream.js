import { useCallback, useEffect, useRef, useState } from 'react';
import { WS_URL } from '../config';
import { readPcmChunk, STREAM_CONFIG } from '../utils/stream';

const {
  audioBufferLeadSeconds,
  audioChannels,
  audioMaxLeadSeconds,
  audioMinLeadSeconds,
  audioSampleRate,
} = STREAM_CONFIG;

function useAudioStream(
  sourceId,
  { enabled = true, volume = 1 } = {}
) {
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);
  const nextTimeRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const socketRef = useRef(null);
  const configRef = useRef({
    channels: audioChannels,
    sampleRate: audioSampleRate,
  });

  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  const ensureAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      const context = new AudioContext({
        latencyHint: 'interactive',
        sampleRate: audioSampleRate,
      });
      const gainNode = context.createGain();
      gainNode.gain.value = volume;
      gainNode.connect(context.destination);
      audioContextRef.current = context;
      gainNodeRef.current = gainNode;
    }

    const context = audioContextRef.current;
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }

    if (context.state !== 'running') {
      try {
        await context.resume();
      } catch (error) {
        // Ignore and expose a manual activation path.
      }
    }

    const isRunning = context.state === 'running';
    setAudioBlocked(!isRunning);
    setAudioReady(isRunning);
    return context;
  }, [volume]);

  const activateAudio = useCallback(async () => {
    await ensureAudioContext();
  }, [ensureAudioContext]);

  useEffect(() => {
    const onPointerDown = () => {
      ensureAudioContext().catch(() => {});
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [ensureAudioContext]);

  useEffect(() => {
    if (!enabled || !sourceId) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setAudioReady(false);
      return undefined;
    }

    let disposed = false;
    shouldReconnectRef.current = true;

    const scheduleChunk = async (arrayBuffer) => {
      const context = await ensureAudioContext();
      if (!context || disposed || context.state !== 'running') {
        return;
      }

      const { channels, sampleRate } = configRef.current;
      const decoded = readPcmChunk(arrayBuffer);
      const frameCount = Math.floor(decoded.length / channels);
      if (frameCount <= 0) {
        return;
      }

      const buffer = context.createBuffer(channels, frameCount, sampleRate);
      for (let channel = 0; channel < channels; channel += 1) {
        const channelData = buffer.getChannelData(channel);
        for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex += 1) {
          channelData[sampleIndex] =
            decoded[sampleIndex * channels + channel] || 0;
        }
      }

      const now = context.currentTime;
      if (
        nextTimeRef.current < now ||
        nextTimeRef.current - now > audioMaxLeadSeconds
      ) {
        nextTimeRef.current = now + audioMinLeadSeconds;
      }

      const startAt = Math.max(now + audioMinLeadSeconds, nextTimeRef.current);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNodeRef.current);
      source.start(startAt);

      nextTimeRef.current = startAt + buffer.duration;
      if (nextTimeRef.current - now > audioBufferLeadSeconds) {
        nextTimeRef.current = Math.min(
          nextTimeRef.current,
          now + audioBufferLeadSeconds
        );
      }
    };

    const connect = async () => {
      if (disposed) {
        return;
      }

      await ensureAudioContext();

      const socket = new WebSocket(`${WS_URL}/audio/${sourceId}/`);
      socket.binaryType = 'arraybuffer';
      socketRef.current = socket;

      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'audio_config') {
              configRef.current = {
                channels: Number(payload.channels) || audioChannels,
                sampleRate: Number(payload.sampleRate) || audioSampleRate,
              };
            }
          } catch (error) {
            console.warn('audio ws config', error);
          }
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          scheduleChunk(event.data).catch(() => {});
        }
      };

      socket.onclose = () => {
        if (!disposed && shouldReconnectRef.current) {
          setTimeout(connect, 500);
        }
      };
    };

    connect().catch(() => {});

    return () => {
      disposed = true;
      shouldReconnectRef.current = false;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      nextTimeRef.current = 0;
    };
  }, [enabled, ensureAudioContext, sourceId]);

  return {
    activateAudio,
    audioBlocked,
    audioReady,
  };
}

export default useAudioStream;
