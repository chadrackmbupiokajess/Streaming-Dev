import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:8001/api';
const WS_URL = 'ws://localhost:8001/ws';

function ViewerPage() {
  const [selectedCam, setSelectedCam] = useState(null);
  const wsRef = useRef(null);
  const urlRef = useRef(null);

  const checkSelection = async () => {
    try {
      const res = await axios.get(`${API_URL}/streams/current_selected/`);
      if (res.data.camera_id !== selectedCam?.id) {
        setSelectedCam({ id: res.data.camera_id, name: res.data.camera_name });
      }
    } catch (e) {
      setSelectedCam(null);
    }
  };

  useEffect(() => {
    checkSelection();
    const interval = setInterval(checkSelection, 3000);
    return () => clearInterval(interval);
  }, [selectedCam]);

  useEffect(() => {
    if (selectedCam) {
      if (wsRef.current) wsRef.current.close();

      const ws = new WebSocket(`${WS_URL}/stream/${selectedCam.id}/`);
      ws.binaryType = 'blob'; // Important: mode binaire activé

      ws.onmessage = (event) => {
        const imgElement = document.getElementById('viewer-img');
        if (!imgElement) return;

        // Nettoyage de la mémoire (URL précédente)
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current);
        }

        // Création de l'URL d'image à partir du Blob binaire
        const url = URL.createObjectURL(event.data);
        imgElement.src = url;
        urlRef.current = url;
      };

      ws.onclose = () => console.log("Déconnecté du stream");
      wsRef.current = ws;
    }

    return () => {
        if (wsRef.current) wsRef.current.close();
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [selectedCam]);

  return (
    <div className="container" style={{ textAlign: 'center' }}>
      <header style={{ marginBottom: '2rem', color: 'white' }}>
        <h1>Espace Spectateur</h1>
        <p>Réception directe haute performance</p>
      </header>

      {selectedCam ? (
        <div className="card" style={{ maxWidth: '750px', margin: '0 auto', padding: '0', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
          <div style={{ padding: '12px', background: '#e74c3c', color: 'white', fontWeight: 'bold' }}>
            🔴 EN DIRECT : {selectedCam.name}
          </div>

          <img
            id="viewer-img"
            alt="Réception du flux..."
            style={{ width: '100%', height: 'auto', minHeight: '300px', background: '#000', display: 'block' }}
          />

          <div style={{ padding: '15px', background: '#f8f9fa', color: '#666', fontSize: '0.8rem' }}>
            Technologie HighSpeed Binary (Zéro Latence)
          </div>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: '500px', margin: '50px auto', padding: '3rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📺</div>
          <h3>Aucune diffusion active</h3>
          <p style={{ color: '#888' }}>L'administrateur n'a pas encore sélectionné de caméra.</p>
        </div>
      )}
    </div>
  );
}

export default ViewerPage;
