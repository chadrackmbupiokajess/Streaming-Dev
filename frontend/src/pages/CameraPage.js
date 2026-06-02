import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:8001/api';
const WS_URL = 'ws://localhost:8001/ws';

function CameraPage() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraId, setCameraId] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const loopRef = useRef();

  useEffect(() => {
    initLocalVideo();
    return () => stopStreaming();
  }, []);

  const initLocalVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 400, height: 300, frameRate: 30 },
        audio: false
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { console.error(err); }
  };

  const startStreaming = async () => {
    try {
      const deviceId = localStorage.getItem('deviceId') || 'cam_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('deviceId', deviceId);

      let id;
      try {
        const res = await axios.post(`${API_URL}/cameras/`, { name: `Direct HighSpeed`, device_id: deviceId });
        id = res.data.id;
      } catch (e) {
        const list = await axios.get(`${API_URL}/cameras/`);
        id = list.data.find(c => c.device_id === deviceId).id;
      }
      setCameraId(id);
      await axios.post(`${API_URL}/cameras/${id}/activate/`);

      wsRef.current = new WebSocket(`${WS_URL}/stream/${id}/`);
      wsRef.current.binaryType = 'blob'; // ON PASSE EN BINAIRE
      wsRef.current.onopen = () => {
        setIsStreaming(true);
        streamLoop();
      };
      wsRef.current.onclose = () => setIsStreaming(false);
    } catch (error) { alert("Erreur connexion"); }
  };

  const streamLoop = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendFrame();
      // On réduit le délai à 30ms (~33 FPS) pour une fluidité totale
      loopRef.current = setTimeout(streamLoop, 30);
    }
  };

  const sendFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    canvas.width = 320; // On réduit légèrement la taille pour la vitesse pure
    canvas.height = 240;
    ctx.drawImage(videoRef.current, 0, 0, 320, 240);

    // Envoi en BLOB BINAIRE (plus rapide que Base64)
    canvas.toBlob((blob) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(blob);
        }
    }, 'image/jpeg', 0.4);
  };

  const stopStreaming = () => {
    clearTimeout(loopRef.current);
    if (wsRef.current) wsRef.current.close();
    setIsStreaming(false);
  };

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '400px', margin: 'auto', textAlign: 'center' }}>
        <h3 style={{ marginBottom: '15px' }}>Studio HighSpeed</h3>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', background: '#000', borderRadius: '8px' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <button onClick={isStreaming ? stopStreaming : startStreaming} style={{ width: '100%', marginTop: '15px', padding: '15px', background: isStreaming ? '#e74c3c' : '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            {isStreaming ? 'STOP DIRECT' : 'LANCER LE DIRECT'}
        </button>
      </div>
    </div>
  );
}

export default CameraPage;
