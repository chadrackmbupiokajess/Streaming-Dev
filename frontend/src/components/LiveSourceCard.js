import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { API_URL, WEBRTC_VIDEO_CONFIG, buildWsUrl } from '../config';
import apiClient from '../lib/apiClient';
import {
  createVideoPeerConnection,
  preferRealtimeCodecs,
  tuneVideoSender,
} from '../utils/webrtc';

async function getVideoStream(videoDeviceId) {
  const requestMedia = (exact) =>
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: WEBRTC_VIDEO_CONFIG.width },
        height: { ideal: WEBRTC_VIDEO_CONFIG.height },
        frameRate: {
          ideal: WEBRTC_VIDEO_CONFIG.frameRate,
          max: WEBRTC_VIDEO_CONFIG.frameRate,
        },
        deviceId: exact ? { exact: videoDeviceId } : { ideal: videoDeviceId },
      },
    });

  try {
    return await requestMedia(true);
  } catch {
    return requestMedia(false);
  }
}

function LiveSourceCard({ deviceId, label, sessionId, onStopped }) {
  const { token } = useAuth();
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const signalSocketRef = useRef(null);
  const peersRef = useRef(new Map());
  const pendingIceRef = useRef(new Map());
  const [status, setStatus] = useState('Initialisation...');
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const backendDeviceId = `${sessionId}__${deviceId}`;

    const refreshViewerCount = () => {
      setViewerCount(peersRef.current.size);
    };

    const sendSignal = (payload) => {
      if (signalSocketRef.current?.readyState === WebSocket.OPEN) {
        signalSocketRef.current.send(JSON.stringify(payload));
      }
    };

    const closePeer = (viewerId) => {
      const peer = peersRef.current.get(viewerId);
      if (peer) {
        peer.close();
      }
      peersRef.current.delete(viewerId);
      pendingIceRef.current.delete(viewerId);
      refreshViewerCount();
    };

    const closeAllPeers = () => {
      peersRef.current.forEach((peer) => peer.close());
      peersRef.current.clear();
      pendingIceRef.current.clear();
      refreshViewerCount();
    };

    const cleanup = () => {
      closeAllPeers();

      if (signalSocketRef.current) {
        signalSocketRef.current.close();
        signalSocketRef.current = null;
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const flushPendingIce = async (viewerId, peer) => {
      const candidates = pendingIceRef.current.get(viewerId) || [];
      pendingIceRef.current.delete(viewerId);
      for (const candidate of candidates) {
        await peer.addIceCandidate(candidate).catch(() => {});
      }
    };

    const createPeerForViewer = async (viewerId) => {
      const stream = mediaStreamRef.current;
      if (!stream || cancelled) {
        return;
      }

      closePeer(viewerId);

      const peer = createVideoPeerConnection();
      peersRef.current.set(viewerId, peer);
      refreshViewerCount();

      const tuningTasks = [];

      stream.getVideoTracks().forEach((track) => {
        track.contentHint = 'motion';
        const transceiver = peer.addTransceiver(track, {
          direction: 'sendonly',
          streams: [stream],
        });
        preferRealtimeCodecs(transceiver);
        tuningTasks.push(tuneVideoSender(transceiver.sender));
      });

      await Promise.allSettled(tuningTasks);

      peer.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }
        sendSignal({
          type: 'webrtc_ice',
          target_id: viewerId,
          candidate: event.candidate,
        });
      };

      peer.onconnectionstatechange = () => {
        if (
          peer.connectionState === 'failed' ||
          peer.connectionState === 'closed' ||
          peer.connectionState === 'disconnected'
        ) {
          closePeer(viewerId);
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      sendSignal({
        type: 'webrtc_offer',
        target_id: viewerId,
        sdp: peer.localDescription.sdp,
      });
    };

    const start = async () => {
      try {
        const stream = await getVideoStream(deviceId);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }

        const response = await apiClient.post(`${API_URL}/cameras/register_source/`, {
          name: (label || 'Source video').slice(0, 80),
          device_id: backendDeviceId,
        });
        const cameraId = response.data.camera.id;

        if (cancelled) {
          return;
        }

        const signalSocket = new WebSocket(buildWsUrl(`/stream/${cameraId}/`, token));
        signalSocketRef.current = signalSocket;

        signalSocket.onopen = () => {
          if (cancelled) {
            return;
          }
          setStatus(
            `WebRTC HD ${WEBRTC_VIDEO_CONFIG.width}x${WEBRTC_VIDEO_CONFIG.height} / ${WEBRTC_VIDEO_CONFIG.frameRate} fps`
          );
          sendSignal({
            type: 'webrtc_source_ready',
            camera_id: cameraId,
          });
        };

        signalSocket.onmessage = (event) => {
          const handleMessage = async () => {
            const data = JSON.parse(event.data);

            if (data.type === 'webrtc_viewer_ready' && data.viewer_id) {
              await createPeerForViewer(data.viewer_id);
              return;
            }

            if (data.type === 'webrtc_answer' && data.sender_id && data.sdp) {
              const peer = peersRef.current.get(data.sender_id);
              if (!peer) {
                return;
              }
              await peer.setRemoteDescription({ type: 'answer', sdp: data.sdp });
              await flushPendingIce(data.sender_id, peer);
              return;
            }

            if (data.type === 'webrtc_ice' && data.sender_id && data.candidate) {
              const peer = peersRef.current.get(data.sender_id);
              if (!peer) {
                return;
              }
              if (!peer.remoteDescription) {
                const queue = pendingIceRef.current.get(data.sender_id) || [];
                queue.push(data.candidate);
                pendingIceRef.current.set(data.sender_id, queue);
                return;
              }
              await peer.addIceCandidate(data.candidate).catch(() => {});
              return;
            }

            if (data.type === 'webrtc_peer_left' && data.peer_id) {
              closePeer(data.peer_id);
            }
          };

          handleMessage().catch(() => {
            setStatus('Erreur signal WebRTC');
          });
        };

        signalSocket.onclose = () => {
          closeAllPeers();
          if (!cancelled) {
            setStatus('Video WebRTC deconnectee');
          }
        };

        signalSocket.onerror = () => {
          setStatus('Erreur WebSocket signal');
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
        .post(`${API_URL}/cameras/deactivate_source/`, {
          device_id: backendDeviceId,
        })
        .catch(() => {});
    };
  }, [deviceId, label, onStopped, sessionId, token]);

  return (
    <div
      className="card video-card"
      style={{
        padding: '1rem',
        textAlign: 'center',
        border: '1px solid rgba(56, 216, 132, 0.22)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.8rem',
          marginBottom: '8px',
          fontSize: '0.9rem',
        }}
      >
        <strong style={{ textAlign: 'left' }}>{label}</strong>
        <span style={{ color: '#27ae60', fontSize: '0.75rem' }}>
          {status} | {viewerCount} receiver
        </span>
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          background: '#000',
          borderRadius: '18px',
          maxHeight: '220px',
          width: '100%',
        }}
      />
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
        Arreter cette source video
      </button>
    </div>
  );
}

export default LiveSourceCard;
