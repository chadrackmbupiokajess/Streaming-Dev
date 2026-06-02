import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import LiveSourceCard from '../components/LiveSourceCard';

const API_URL = 'http://localhost:8001/api';
const STORAGE_SESSION = 'deviceId';

async function cleanupStaleSessionCameras(sessionId) {
  if (!sessionId) return;
  try {
    await axios.post(`${API_URL}/cameras/cleanup_session/`, { session_id: sessionId });
  } catch (e) {
    console.warn('cleanup_session', e);
  }
}

function CameraPage() {
  const [videoDevices, setVideoDevices] = useState([]);
  const [pickedDevices, setPickedDevices] = useState(() => new Set());
  const [liveSources, setLiveSources] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [deviceError, setDeviceError] = useState(null);
  const [loadingDevices, setLoadingDevices] = useState(true);

  const refreshDeviceList = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === 'videoinput');
    setVideoDevices(inputs);
    return inputs;
  }, []);

  const initDevices = useCallback(async () => {
    setLoadingDevices(true);
    setDeviceError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      await refreshDeviceList();

      let sid = localStorage.getItem(STORAGE_SESSION);
      if (!sid) {
        sid = 'cam_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem(STORAGE_SESSION, sid);
      }
      setSessionId(sid);
      await cleanupStaleSessionCameras(sid);
    } catch (err) {
      console.error(err);
      setDeviceError(
        'Autorisez l\'accès à la caméra pour voir la liste (webcam, Iriun, OBS, etc.).'
      );
    } finally {
      setLoadingDevices(false);
    }
  }, [refreshDeviceList]);

  useEffect(() => {
    initDevices();
    const onDeviceChange = () => refreshDeviceList();
    navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange);
  }, [initDevices, refreshDeviceList]);

  const getDeviceLabel = (device, index) => {
    if (device.label) return device.label;
    return `Caméra ${index + 1}`;
  };

  const isDeviceLive = (deviceId) => liveSources.some((s) => s.deviceId === deviceId);

  const togglePick = (deviceId) => {
    if (isDeviceLive(deviceId)) return;
    setPickedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const selectAll = () => {
    const available = videoDevices
      .map((d) => d.deviceId)
      .filter((id) => !isDeviceLive(id));
    setPickedDevices(new Set(available));
  };

  const clearPick = () => setPickedDevices(new Set());

  const startSelectedStreams = () => {
    const toAdd = [...pickedDevices].filter((id) => !isDeviceLive(id));
    if (toAdd.length === 0) {
      setDeviceError('Cochez au moins une source non diffusée.');
      return;
    }
    setDeviceError(null);
    cleanupStaleSessionCameras(sessionId);

    const newSources = toAdd.map((deviceId) => {
      const device = videoDevices.find((d) => d.deviceId === deviceId);
      const index = videoDevices.indexOf(device);
      return {
        deviceId,
        label: getDeviceLabel(device, index),
      };
    });

    setLiveSources((prev) => [...prev, ...newSources]);
    setPickedDevices(new Set());
  };

  const stopSource = (deviceId) => {
    setLiveSources((prev) => prev.filter((s) => s.deviceId !== deviceId));
    setPickedDevices((prev) => {
      const next = new Set(prev);
      next.delete(deviceId);
      return next;
    });
  };

  const stopAll = () => {
    setLiveSources([]);
    setPickedDevices(new Set());
  };

  const hasLive = liveSources.length > 0;
  const pickCount = pickedDevices.size;

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '720px', margin: '0 auto' }}>
        <h3 style={{ marginBottom: '8px', textAlign: 'center' }}>
          Studio — Sources multiples
        </h3>
        <p style={{ color: '#666', fontSize: '0.85rem', textAlign: 'center', marginBottom: '16px' }}>
          Cochez une ou plusieurs entrées (webcam, Iriun, OBS…). L&apos;admin les verra toutes et
          pourra basculer le direct.
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={selectAll}
            disabled={loadingDevices || hasLive && videoDevices.length === liveSources.length}
            style={{ padding: '6px 12px', fontSize: '0.85rem', background: '#667eea', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Tout cocher
          </button>
          <button
            type="button"
            onClick={clearPick}
            disabled={pickCount === 0}
            style={{ padding: '6px 12px', fontSize: '0.85rem', background: '#888', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Tout décocher
          </button>
          <button
            type="button"
            onClick={initDevices}
            disabled={loadingDevices}
            style={{ padding: '6px 12px', fontSize: '0.85rem', background: '#555', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Actualiser la liste
          </button>
        </div>

        {deviceError && (
          <p style={{ color: '#e74c3c', fontSize: '0.9rem', marginBottom: '10px' }}>{deviceError}</p>
        )}

        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
            maxHeight: '220px',
            overflowY: 'auto',
          }}
        >
          {loadingDevices && <p style={{ color: '#888' }}>Chargement des caméras…</p>}
          {!loadingDevices && videoDevices.length === 0 && (
            <p style={{ color: '#888' }}>Aucune caméra détectée.</p>
          )}
          {videoDevices.map((device, index) => {
            const live = isDeviceLive(device.deviceId);
            const picked = pickedDevices.has(device.deviceId);
            return (
              <label
                key={device.deviceId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 4px',
                  cursor: live ? 'default' : 'pointer',
                  borderBottom: '1px solid #eee',
                  opacity: live ? 0.7 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={live || picked}
                  disabled={live}
                  onChange={() => togglePick(device.deviceId)}
                />
                <span style={{ flex: 1 }}>{getDeviceLabel(device, index)}</span>
                {live && (
                  <span style={{ color: '#e74c3c', fontSize: '0.75rem', fontWeight: 'bold' }}>
                    EN DIRECT
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <button
          type="button"
          onClick={startSelectedStreams}
          disabled={loadingDevices || pickCount === 0 || !sessionId}
          style={{
            width: '100%',
            padding: '14px',
            background: '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: pickCount === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            opacity: pickCount === 0 ? 0.6 : 1,
            marginBottom: '10px',
          }}
        >
          Lancer {pickCount > 1 ? `les ${pickCount} sources` : pickCount === 1 ? 'la source' : '…'}
        </button>

        {hasLive && (
          <button
            type="button"
            onClick={stopAll}
            style={{
              width: '100%',
              padding: '10px',
              background: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              marginBottom: '20px',
            }}
          >
            Arrêter toutes les sources ({liveSources.length})
          </button>
        )}

        {liveSources.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {liveSources.map((source) => (
              <LiveSourceCard
                key={source.deviceId}
                deviceId={source.deviceId}
                label={source.label}
                sessionId={sessionId}
                onStopped={stopSource}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CameraPage;
