import { useEffect, useRef, useState } from 'react';
import { buildWsUrl } from '../config';
import { createVideoPeerConnection } from '../utils/webrtc';

function useWebRtcStream(cameraId) {
  const videoRef = useRef(null);
  const peerRef = useRef(null);
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const sourceIdRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!cameraId) {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setStatus('idle');
      return undefined;
    }

    let disposed = false;

    const closePeer = () => {
      if (peerRef.current) {
        peerRef.current.getReceivers().forEach((receiver) => receiver.track?.stop());
        peerRef.current.close();
        peerRef.current = null;
      }
      sourceIdRef.current = null;
      pendingCandidatesRef.current = [];
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const sendSignal = (payload) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify(payload));
      }
    };

    const requestStream = () => {
      closePeer();
      sendSignal({
        type: 'webrtc_viewer_ready',
        camera_id: cameraId,
        wants: 'video',
      });
      setStatus('waiting-source');
    };

    const ensurePeer = (sourceId) => {
      if (peerRef.current && sourceIdRef.current === sourceId) {
        return peerRef.current;
      }

      closePeer();
      sourceIdRef.current = sourceId;

      const peer = createVideoPeerConnection();

      peer.ontrack = (event) => {
        if (disposed || !videoRef.current) {
          return;
        }

        const stream = event.streams[0] || new MediaStream([event.track]);
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
        }
        videoRef.current.play().catch(() => {});
        setStatus('live');
      };

      peer.onicecandidate = (event) => {
        if (!event.candidate || !sourceIdRef.current) {
          return;
        }
        sendSignal({
          type: 'webrtc_ice',
          target_id: sourceIdRef.current,
          candidate: event.candidate,
        });
      };

      peer.onconnectionstatechange = () => {
        if (disposed) {
          return;
        }

        if (peer.connectionState === 'connected') {
          setStatus('live');
        } else if (
          peer.connectionState === 'failed' ||
          peer.connectionState === 'disconnected'
        ) {
          setStatus('reconnecting');
          window.setTimeout(() => {
            if (!disposed) {
              requestStream();
            }
          }, 450);
        }
      };

      peerRef.current = peer;
      return peer;
    };

    const flushPendingCandidates = async (peer) => {
      const candidates = pendingCandidatesRef.current;
      pendingCandidatesRef.current = [];
      for (const candidate of candidates) {
        await peer.addIceCandidate(candidate).catch(() => {});
      }
    };

    const connect = () => {
      if (disposed) {
        return;
      }

      setStatus('connecting');
      const socket = new WebSocket(buildWsUrl(`/stream/${cameraId}/`));
      socketRef.current = socket;

      socket.onopen = () => {
        if (!disposed) {
          setStatus('waiting-source');
        }
      };

      socket.onmessage = (event) => {
        const handleMessage = async () => {
          const data = JSON.parse(event.data);

          if (data.type === 'webrtc_connected') {
            requestStream();
            return;
          }

          if (data.type === 'webrtc_source_ready') {
            requestStream();
            return;
          }

          if (data.type === 'webrtc_offer') {
            const sourceId = data.sender_id || data.source_id;
            if (!sourceId || !data.sdp) {
              return;
            }

            const peer = ensurePeer(sourceId);
            await peer.setRemoteDescription({ type: 'offer', sdp: data.sdp });
            await flushPendingCandidates(peer);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            sendSignal({
              type: 'webrtc_answer',
              target_id: sourceId,
              sdp: peer.localDescription.sdp,
            });
            return;
          }

          if (data.type === 'webrtc_ice' && data.candidate) {
            const peer = peerRef.current;
            if (!peer?.remoteDescription) {
              pendingCandidatesRef.current.push(data.candidate);
              return;
            }
            await peer.addIceCandidate(data.candidate).catch(() => {});
            return;
          }

          if (data.type === 'webrtc_peer_left' && data.peer_id === sourceIdRef.current) {
            closePeer();
            setStatus('waiting-source');
          }
        };

        handleMessage().catch(() => {
          setStatus('signal-error');
        });
      };

      socket.onclose = () => {
        if (disposed) {
          return;
        }
        closePeer();
        setStatus('reconnecting');
        reconnectTimerRef.current = window.setTimeout(connect, 700);
      };

      socket.onerror = () => {
        setStatus('signal-error');
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      closePeer();
    };
  }, [cameraId]);

  return { status, videoRef };
}

export default useWebRtcStream;
