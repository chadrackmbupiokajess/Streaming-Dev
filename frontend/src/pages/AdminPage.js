import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { createFrameDisplayHandler } from '../utils/stream';

const API_URL = 'http://localhost:8001/api';
const WS_URL = 'ws://localhost:8001/ws';

function AdminCameraCard({ camera, isLive, onSetLive }) {
  const imgRef = useRef(null);
  const urlRef = useRef(null);
  const [wsStatus, setWsStatus] = useState('connecting');

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/stream/${camera.id}/`);
    ws.binaryType = 'arraybuffer';

    const handleFrame = createFrameDisplayHandler(() => imgRef.current, urlRef);

    ws.onopen = () => setWsStatus('connected');
    ws.onmessage = handleFrame;
    ws.onerror = () => setWsStatus('error');
    ws.onclose = () => setWsStatus('closed');

    return () => {
      ws.close();
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [camera.id]);

  return (
    <div
      className="card"
      style={{
        padding: 0,
        border: isLive ? '4px solid #f1c40f' : '1px solid #ddd',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 15px',
          background: isLive ? '#f1c40f' : '#333',
          color: isLive ? '#000' : '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <strong>{camera.name}</strong>
        <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>
          {wsStatus === 'connected' ? '● connecté' : wsStatus === 'connecting' ? '… connexion' : '○ hors ligne'}
        </span>
      </div>
      <img
        ref={imgRef}
        alt={`Flux ${camera.name}`}
        style={{
          width: '100%',
          height: '250px',
          background: '#000',
          display: 'block',
          objectFit: 'contain',
        }}
      />
      <div style={{ padding: '10px' }}>
        <button
          type="button"
          onClick={() => onSetLive(camera.id)}
          style={{
            width: '100%',
            padding: '10px',
            background: isLive ? '#eee' : '#27ae60',
            color: isLive ? '#888' : 'white',
            cursor: 'pointer',
            border: 'none',
            fontWeight: 'bold',
          }}
        >
          {isLive ? 'ACTUELLEMENT EN DIRECT' : 'METTRE EN DIRECT'}
        </button>
      </div>
    </div>
  );
}

function AdminPage() {
  const [cameras, setCameras] = useState([]);
  const [selectedCamId, setSelectedCamId] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      const resCams = await axios.get(`${API_URL}/cameras/live/`);
      setCameras(resCams.data);
      setError(null);
    } catch (e) {
      setError('Impossible de joindre le backend (port 8001).');
      return;
    }

    try {
      const resSelected = await axios.get(`${API_URL}/streams/current_selected/`);
      setSelectedCamId(resSelected.data.camera_id);
    } catch (e) {
      if (e.response?.status === 404) {
        setSelectedCamId(null);
      }
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  const setLive = async (id) => {
    try {
      await axios.post(`${API_URL}/cameras/${id}/select_for_viewer/`);
      setSelectedCamId(id);
      setError(null);
    } catch (e) {
      setError("Échec de la mise en direct. Vérifiez que la caméra est active.");
    }
  };

  return (
    <div className="container">
      <h2 style={{ color: 'white', textAlign: 'center', marginBottom: '8px' }}>
        Régie Admin
      </h2>
      <p style={{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginBottom: '20px', fontSize: '0.9rem' }}>
        Toutes les sources actives s&apos;affichent ici. Cliquez sur <strong>Mettre en direct</strong> pour
        basculer ce que voient les spectateurs.
      </p>

      {error && (
        <p style={{ color: '#e74c3c', textAlign: 'center', marginBottom: '1rem' }}>{error}</p>
      )}

      {cameras.length === 0 ? (
        <div className="card" style={{ maxWidth: '500px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
          <h3>Aucune caméra active</h3>
          <p style={{ color: '#666', marginTop: '0.5rem' }}>
            Ouvrez l&apos;onglet <strong>Caméra</strong> et cliquez sur <strong>LANCER LE DIRECT</strong>,
            puis revenez ici.
          </p>
        </div>
      ) : (
        <div
          className="stream-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: '20px',
          }}
        >
          {cameras.map((camera) => (
            <AdminCameraCard
              key={camera.id}
              camera={camera}
              isLive={Number(selectedCamId) === Number(camera.id)}
              onSetLive={setLive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminPage;
