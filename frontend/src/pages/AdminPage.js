import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:8001/api';
const WS_URL = 'ws://localhost:8001/ws';

function AdminPage() {
  const [cameras, setCameras] = useState([]);
  const [selectedCamId, setSelectedCamId] = useState(null);
  const wsRefs = useRef({});
  const urlsRef = useRef({}); // Pour nettoyer les URLs créées

  const fetchData = async () => {
    try {
      const resCams = await axios.get(`${API_URL}/cameras/`);
      setCameras(resCams.data);
      const resSelected = await axios.get(`${API_URL}/streams/current_selected/`);
      setSelectedCamId(resSelected.data.camera_id);
    } catch (e) {}
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    cameras.forEach(camera => {
      if (camera.is_active && !wsRefs.current[camera.id]) {
        const ws = new WebSocket(`${WS_URL}/stream/${camera.id}/`);
        ws.binaryType = 'blob';

        ws.onmessage = (event) => {
          const imgElement = document.getElementById(`img-cam-${camera.id}`);
          if (!imgElement) return;

          // Nettoyage de l'ancienne URL pour éviter la fuite de mémoire
          if (urlsRef.current[camera.id]) {
            URL.revokeObjectURL(urlsRef.current[camera.id]);
          }

          // Création d'une URL directe depuis le binaire (Vitesse maximum)
          const url = URL.createObjectURL(event.data);
          imgElement.src = url;
          urlsRef.current[camera.id] = url;
        };

        ws.onclose = () => delete wsRefs.current[camera.id];
        wsRefs.current[camera.id] = ws;
      }
    });
  }, [cameras]);

  const setLive = async (id) => {
    try {
      await axios.post(`${API_URL}/cameras/${id}/select_for_viewer/`);
      setSelectedCamId(id);
    } catch (e) {}
  };

  return (
    <div className="container">
      <h2 style={{ color: 'white', textAlign: 'center', marginBottom: '20px' }}>Régie HighSpeed (Binaire)</h2>
      <div className="stream-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
        {cameras.filter(c => c.is_active).map(camera => {
          const isLive = selectedCamId === camera.id;
          return (
            <div key={camera.id} className="card" style={{ padding: '0', border: isLive ? '4px solid #f1c40f' : '1px solid #ddd', overflow: 'hidden' }}>
              <div style={{ padding: '8px 15px', background: isLive ? '#f1c40f' : '#333', color: isLive ? '#000' : '#fff' }}>
                <strong>{camera.name}</strong>
              </div>
              <img
                id={`img-cam-${camera.id}`}
                alt="Flux..."
                style={{ width: '100%', height: '250px', background: '#000', display: 'block', objectFit: 'contain' }}
              />
              <div style={{ padding: '10px' }}>
                <button onClick={() => setLive(camera.id)} style={{ width: '100%', padding: '10px', background: isLive ? '#eee' : '#27ae60', color: isLive ? '#888' : 'white', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>
                  {isLive ? 'ACTUELLEMENT EN DIRECT' : 'METTRE EN DIRECT'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AdminPage;
