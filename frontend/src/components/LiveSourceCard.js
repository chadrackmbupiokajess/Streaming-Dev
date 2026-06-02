import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { STREAM_CONFIG } from '../utils/stream';

const API_URL = 'http://localhost:8001/api';
const WS_URL = 'ws://localhost:8001/ws';
const { width, height, jpegQuality, maxBufferedBytes } = STREAM_CONFIG;

async function getMediaStream(deviceId) {
  const baseVideo = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  };

  const tryGet = (useExact) =>
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...baseVideo,
        deviceId: useExact ? { exact: deviceId } : { ideal: deviceId },
      },
    });

  try {
    return await tryGet(true);
  } catch {
    return tryGet(false);
  }
}

function LiveSourceCard({ deviceId, label, sessionId, onStopped }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const streamingRef = useRef(false);
  const encodingRef = useRef(false);
  const [status, setStatus] = useState('Démarrage…');

  useEffect(() => {
    let cancelled = false;

    const cleanup = () => {
      streamingRef.current = false;
      encodingRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };

    const captureLoop = () => {
      if (cancelled || !streamingRef.current || wsRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
        requestAnimationFrame(captureLoop);
        return;
      }

      if (encodingRef.current || wsRef.current.bufferedAmount > maxBufferedBytes) {
        requestAnimationFrame(captureLoop);
        return;
      }

      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      encodingRef.current = true;
      ctx.drawImage(video, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          encodingRef.current = false;
          if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(blob);
          }
          if (!cancelled && streamingRef.current) {
            requestAnimationFrame(captureLoop);
          }
        },
        'image/jpeg',
        jpegQuality
      );
    };

    const start = async () => {
      try {
        const stream = await getMediaStream(deviceId);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        const backendDeviceId = `${sessionId}__${deviceId}`;
        const streamName = (label || 'Source').slice(0, 80);

        // Ancienne entrée (un seul device_id = session) → désactiver
        try {
          const all = await axios.get(`${API_URL}/cameras/`);
          const legacy = all.data.find(
            (c) => c.device_id === sessionId && c.is_active
          );
          if (legacy) {
            await axios.post(`${API_URL}/cameras/${legacy.id}/deactivate/`);
          }
        } catch {
          /* ignore */
        }

        let cameraId;
        try {
          const res = await axios.post(`${API_URL}/cameras/`, {
            name: streamName,
            device_id: backendDeviceId,
          });
          cameraId = res.data.id;
        } catch (e) {
          const list = await axios.get(`${API_URL}/cameras/`);
          const existing = list.data.find((c) => c.device_id === backendDeviceId);
          if (!existing) throw e;
          cameraId = existing.id;
          await axios.patch(`${API_URL}/cameras/${cameraId}/`, {
            name: streamName,
            is_active: true,
          });
        }

        await axios.post(`${API_URL}/cameras/${cameraId}/activate/`);

        if (cancelled) return;

        const canvas = canvasRef.current;
        canvas.width = width;
        canvas.height = height;

        const ws = new WebSocket(`${WS_URL}/stream/${cameraId}/`);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) return;
          setStatus('En direct');
          streamingRef.current = true;
          captureLoop();
        };

        ws.onclose = () => {
          streamingRef.current = false;
          if (!cancelled) setStatus('Déconnecté');
        };

        ws.onerror = () => setStatus('Erreur WebSocket');
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setStatus('Erreur');
          onStopped(deviceId);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      const ws = wsRef.current;
      const backendDeviceId = `${sessionId}__${deviceId}`;
      cleanup();
      axios
        .get(`${API_URL}/cameras/`)
        .then((res) => {
          const cam = res.data.find((c) => c.device_id === backendDeviceId);
          if (cam) {
            return axios.post(`${API_URL}/cameras/${cam.id}/deactivate/`);
          }
        })
        .catch(() => {});
    };
  }, [deviceId, label, sessionId, onStopped]);

  const handleStop = () => {
    onStopped(deviceId);
  };

  return (
    <div
      className="card"
      style={{ padding: '12px', textAlign: 'center', border: '2px solid #27ae60' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
          fontSize: '0.9rem',
        }}
      >
        <strong style={{ textAlign: 'left' }}>{label}</strong>
        <span style={{ color: '#27ae60', fontSize: '0.75rem' }}>{status}</span>
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', background: '#000', borderRadius: '8px', maxHeight: '200px' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <button
        type="button"
        onClick={handleStop}
        style={{
          width: '100%',
          marginTop: '10px',
          padding: '8px',
          background: '#e74c3c',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 'bold',
        }}
      >
        Arrêter cette source
      </button>
    </div>
  );
}

export default LiveSourceCard;
