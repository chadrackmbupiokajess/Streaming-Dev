import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { API_URL, buildWsUrl } from '../config';
import apiClient from '../lib/apiClient';
import { createPcmChunk, STREAM_CONFIG } from '../utils/stream';

const {
  audioChannels,
  audioFrameSamples,
  audioSampleRate,
  maxBufferedBytes,
} = STREAM_CONFIG;

async function getAudioStream(audioDeviceId) {
  const requestMedia = (exact) =>
    navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        channelCount: { ideal: audioChannels },
        deviceId: audioDeviceId
          ? exact
            ? { exact: audioDeviceId }
            : { ideal: audioDeviceId }
          : undefined,
        echoCancellation: false,
        latency: { ideal: 0.01 },
        noiseSuppression: false,
        sampleRate: { ideal: audioSampleRate },
        sampleSize: { ideal: 16 },
      },
      video: false,
    });

  try {
    return await requestMedia(true);
  } catch {
    return requestMedia(false);
  }
}

function LiveAudioCard({ deviceId, label, sessionId, onStopped }) {
  const { token } = useAuth();
  const audioStreamRef = useRef(null);
  const audioSocketRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const muteGainRef = useRef(null);
  const [status, setStatus] = useState('Initialisation...');

  useEffect(() => {
    let cancelled = false;
    const backendDeviceId = `${sessionId}__audio__${deviceId}`;

    const cleanup = () => {
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
        processorRef.current = null;
      }

      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }

      if (muteGainRef.current) {
        muteGainRef.current.disconnect();
        muteGainRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }

      if (audioSocketRef.current) {
        audioSocketRef.current.close();
        audioSocketRef.current = null;
      }

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
    };

    const start = async () => {
      try {
        const stream = await getAudioStream(deviceId);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        audioStreamRef.current = stream;

        const response = await apiClient.post(`${API_URL}/audio-sources/register_source/`, {
          name: (label || 'Source audio').slice(0, 80),
          device_id: backendDeviceId,
        });
        const audioSourceId = response.data.audio_source.id;

        if (cancelled) {
          return;
        }

        const audioContext = new AudioContext({
          latencyHint: 'interactive',
          sampleRate: audioSampleRate,
        });
        await audioContext.resume();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(
          audioFrameSamples,
          audioChannels,
          audioChannels
        );
        const muteGain = audioContext.createGain();
        muteGain.gain.value = 0;

        source.connect(processor);
        processor.connect(muteGain);
        muteGain.connect(audioContext.destination);

        sourceRef.current = source;
        processorRef.current = processor;
        muteGainRef.current = muteGain;

        const audioSocket = new WebSocket(buildWsUrl(`/audio/${audioSourceId}/`, token));
        audioSocket.binaryType = 'arraybuffer';
        audioSocketRef.current = audioSocket;

        audioSocket.onopen = () => {
          if (cancelled) {
            return;
          }

          audioSocket.send(
            JSON.stringify({
              type: 'audio_config',
              channels: audioChannels,
              format: 'pcm_s16le',
              sampleRate: audioSampleRate,
            })
          );

          processor.onaudioprocess = (event) => {
            if (
              audioSocket.readyState !== WebSocket.OPEN ||
              audioSocket.bufferedAmount > maxBufferedBytes * 2
            ) {
              return;
            }

            const channelData = event.inputBuffer.getChannelData(0);
            audioSocket.send(createPcmChunk(channelData));
          };

          setStatus('Audio PCM live faible latence');
        };

        audioSocket.onclose = () => {
          if (!cancelled) {
            setStatus('Audio deconnecte');
          }
        };

        audioSocket.onerror = () => {
          setStatus('Erreur WebSocket audio');
        };
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setStatus('Erreur');
          onStopped(deviceId);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      cleanup();
      apiClient
        .post(`${API_URL}/audio-sources/deactivate_source/`, {
          device_id: backendDeviceId,
        })
        .catch(() => {});
    };
  }, [deviceId, label, onStopped, sessionId, token]);

  return (
    <div
      className="card"
      style={{ padding: '1rem', textAlign: 'left', border: '1px solid rgba(68, 167, 255, 0.24)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
        <strong>{label}</strong>
        <span style={{ color: '#1f6feb', fontSize: '0.75rem' }}>{status}</span>
      </div>
      <p style={{ color: 'rgba(226, 232, 240, 0.72)', fontSize: '0.82rem', marginTop: '8px' }}>
        Pipeline audio PCM separe. Le son est transporte independamment de l'image.
      </p>
      <button
        type="button"
        onClick={() => onStopped(deviceId)}
        style={{
          width: '100%',
          marginTop: '10px',
          padding: '0.85rem',
          background: '#e74c3c',
          color: 'white',
          border: 'none',
          borderRadius: '999px',
          cursor: 'pointer',
          fontWeight: 'bold',
        }}
      >
        Arreter cette source audio
      </button>
    </div>
  );
}

export default LiveAudioCard;
