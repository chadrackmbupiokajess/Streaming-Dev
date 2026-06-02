import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createFrameDisplayHandler } from '../utils/stream';

const WS_URL = 'ws://localhost:8001/ws';

function ViewerPage() {
  const [selectedCam, setSelectedCam] = useState(null);

  const imgRef = useRef(null);
  const urlRef = useRef(null);
  const streamWsRef = useRef(null);
  const controlWsRef = useRef(null);
  const selectedIdRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const closeStream = useCallback(() => {
    if (streamWsRef.current) {
      streamWsRef.current.close();
      streamWsRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (imgRef.current) {
      imgRef.current.removeAttribute('src');
    }
  }, []);

  const openStream = useCallback(
    (cameraId) => {
      closeStream();

      const ws = new WebSocket(`${WS_URL}/stream/${cameraId}/`);
      ws.binaryType = 'arraybuffer';

      const onFrame = createFrameDisplayHandler(() => imgRef.current, urlRef);
      ws.onmessage = onFrame;
      streamWsRef.current = ws;
    },
    [closeStream]
  );

  const applySelection = useCallback(
    (cameraId, cameraName) => {
      const id = cameraId != null && cameraId !== '' ? Number(cameraId) : null;

      if (id === selectedIdRef.current) {
        return;
      }

      selectedIdRef.current = id;

      if (!id) {
        setSelectedCam(null);
        closeStream();
        return;
      }

      const name = cameraName || `Source ${id}`;
      setSelectedCam({ id, name });
      openStream(id);
    },
    [closeStream, openStream]
  );

  const connectControlSocket = useCallback(() => {
    if (controlWsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const ctrl = new WebSocket(`${WS_URL}/viewer/`);

    ctrl.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'selection_changed') {
          applySelection(data.camera_id, data.camera_name);
        }
      } catch (e) {
        console.warn('viewer ws:', e);
      }
    };

    ctrl.onclose = () => {
      controlWsRef.current = null;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(connectControlSocket, 800);
    };

    controlWsRef.current = ctrl;
  }, [applySelection]);

  useEffect(() => {
    connectControlSocket();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (controlWsRef.current) {
        controlWsRef.current.close();
        controlWsRef.current = null;
      }
      closeStream();
    };
  }, [connectControlSocket, closeStream]);

  return (
    <div className="container" style={{ textAlign: 'center' }}>
      <header style={{ marginBottom: '2rem', color: 'white' }}>
        <h1>Espace Spectateur</h1>
        <p>Synchronisation WebSocket instantanée avec la régie</p>
      </header>

      {selectedCam ? (
        <div
          className="card"
          style={{
            maxWidth: '750px',
            margin: '0 auto',
            padding: 0,
            overflow: 'hidden',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              padding: '12px',
              background: '#e74c3c',
              color: 'white',
              fontWeight: 'bold',
            }}
          >
            EN DIRECT : {selectedCam.name}
          </div>

          <img
            ref={imgRef}
            alt="Réception du flux"
            style={{
              width: '100%',
              height: 'auto',
              minHeight: '300px',
              background: '#000',
              display: 'block',
              objectFit: 'contain',
            }}
          />

          <div
            style={{
              padding: '15px',
              background: '#f8f9fa',
              color: '#666',
              fontSize: '0.8rem',
            }}
          >
            Bascule en temps réel via WebSocket
          </div>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: '500px', margin: '50px auto', padding: '3rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📺</div>
          <h3>Aucune diffusion active</h3>
          <p style={{ color: '#888' }}>
            En attente du choix de l&apos;administrateur…
          </p>
        </div>
      )}
    </div>
  );
}

export default ViewerPage;
