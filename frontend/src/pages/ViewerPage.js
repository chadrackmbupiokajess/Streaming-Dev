import React, { useCallback, useEffect, useRef, useState } from 'react';
import { buildWsUrl } from '../config';
import useAudioStream from '../hooks/useAudioStream';
import useWebRtcStream from '../hooks/useWebRtcStream';

function ViewerPage() {
  const [selectedCam, setSelectedCam] = useState(null);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [fadeClass, setFadeClass] = useState('');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const stageRef = useRef(null);
  const controlWsRef = useRef(null);
  const selectedIdRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const fadeTimerRef = useRef(null);
  const shouldReconnectRef = useRef(true);
  const videoMonitor = useWebRtcStream(selectedCam?.id);
  const audioMonitor = useAudioStream(selectedAudio?.id, {
    enabled: Boolean(selectedAudio?.id),
  });

  const runFadeEffect = useCallback((durationMs) => {
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
    }
    setFadeClass('viewer-fade-out');
    fadeTimerRef.current = setTimeout(() => {
      setFadeClass('viewer-fade-in');
      fadeTimerRef.current = setTimeout(() => {
        setFadeClass('');
        fadeTimerRef.current = null;
      }, durationMs);
    }, Math.min(durationMs, 250));
  }, []);

  const applySelection = useCallback(
    (cameraId, cameraName, transition = 'cut', durationMs = 0) => {
      const id =
        cameraId != null && cameraId !== '' && cameraId !== undefined
          ? Number(cameraId)
          : null;

      if (id === selectedIdRef.current) {
        return;
      }

      const hadProgram = selectedIdRef.current != null;
      selectedIdRef.current = id;

      if (!id) {
        setFadeClass('');
        setSelectedCam(null);
        return;
      }

      if (transition === 'fade' && durationMs > 0 && hadProgram) {
        runFadeEffect(durationMs);
      } else {
        setFadeClass('');
      }

      setSelectedCam({
        id,
        name: cameraName || `Source ${id}`,
      });
    },
    [runFadeEffect]
  );

  const connectControlSocket = useCallback(() => {
    if (
      controlWsRef.current &&
      (controlWsRef.current.readyState === WebSocket.OPEN ||
        controlWsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const controlSocket = new WebSocket(buildWsUrl('/viewer/'));

    controlSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'selection_changed') {
          applySelection(
            data.camera_id,
            data.camera_name,
            data.transition || 'cut',
            Number(data.duration_ms) || 0
          );
        } else if (data.type === 'audio_selection_changed') {
          setSelectedAudio(
            data.audio_source_id
              ? {
                  id: Number(data.audio_source_id),
                  name: data.audio_source_name || `Audio ${data.audio_source_id}`,
                }
              : null
          );
        }
      } catch (error) {
        console.warn('viewer ws:', error);
      }
    };

    controlSocket.onclose = () => {
      controlWsRef.current = null;
      if (!shouldReconnectRef.current) {
        return;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(connectControlSocket, 800);
    };

    controlWsRef.current = controlSocket;
  }, [applySelection]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connectControlSocket();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
      }
      if (controlWsRef.current) {
        controlWsRef.current.close();
        controlWsRef.current = null;
      }
    };
  }, [connectControlSocket]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!stageRef.current) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await stageRef.current.requestFullscreen();
    } catch (error) {
      console.warn('fullscreen', error);
    }
  };

  return (
    <div className="container">
      <div className="page-shell">
        {/* <section className="hero-panel">
          <div className="hero-panel__grid">
            <div>
              <p className="hero-panel__eyebrow">Public Live Experience</p>
              <h2>Le direct est accessible sans connexion, comme une vraie plateforme de streaming.</h2>
              <p>
                Cette page est la facade publique du MVP. Toute personne arrivant sur le site
                voit immediatement le programme courant, pendant que la regie choisit les sources
                en coulisses.
              </p>
              <div className="status-strip" style={{ marginTop: '1.1rem' }}>
                <span className="signal-pill signal-pill--live">Live public</span>
                <span className="soft-chip">
                  <strong>{selectedCam ? `Video ${videoMonitor.status}` : 'Off-air'}</strong>
                </span>
                <span className="soft-chip">
                  <strong>{selectedAudio ? 'Audio actif' : 'Audio off'}</strong>
                </span>
              </div>
            </div>

            <div className="hero-side">
              <div className="hero-metric">
                <span className="hero-metric__label">Experience</span>
                <div className="hero-metric__value">Instant play</div>
                <p className="hero-metric__text">
                  Le public arrive, regarde, et ne voit jamais la complexite de la regie.
                </p>
              </div>
              <div className="hero-metric">
                <span className="hero-metric__label">Mode image</span>
                <div className="hero-metric__value">
                  {isFullscreen ? 'Plein ecran' : isFocusMode ? 'Focus' : 'Standard'}
                </div>
              </div>
            </div>
          </div>
        </section> */}

        {audioMonitor.audioBlocked && selectedAudio && (
          <div className="notice-banner">
            <strong style={{ display: 'block', marginBottom: '0.35rem' }}>
              Activation audio requise
            </strong>
            Le navigateur attend une interaction avant de lancer le son du direct.
            <div className="action-row" style={{ marginTop: '0.85rem' }}>
              <button type="button" onClick={audioMonitor.activateAudio}>
                Activer l&apos;audio du live
              </button>
            </div>
          </div>
        )}

        <section
          ref={stageRef}
          className={`card public-stage ${isFocusMode ? 'public-stage--focus' : ''}`}
        >
          <div className="public-stage__header">
            <div className="public-stage__title">
              {/* <strong>{selectedCam ? selectedCam.name : 'Flux public en attente'}</strong> */}
              <span>
                {selectedCam
                  ? 'Programme emis par la regie centrale'
                  : 'Le direct demarrera des qu une source sera mise a l antenne'}
              </span>
            </div>
            <div className="public-stage__actions">
              <span className={`signal-pill ${selectedCam ? 'signal-pill--live' : ''}`}>
                {selectedCam ? 'On air' : 'Standby'}
              </span>
              <button
                type="button"
                className="button-ghost public-stage__button"
                onClick={() => setIsFocusMode((prev) => !prev)}
              >
                {isFocusMode ? 'Vue standard' : 'Agrandir'}
              </button>
              <button
                type="button"
                className="button-ghost public-stage__button"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? 'Quitter le plein ecran' : 'Plein ecran'}
              </button>
            </div>
          </div>

          <div className={`public-stage__frame viewer-pgm ${fadeClass}`}>
            {selectedCam ? (
              <div className="public-stage__viewport">
                <video
                  ref={videoMonitor.videoRef}
                  className="public-stage__canvas"
                  autoPlay
                  playsInline
                  muted
                />
              </div>
            ) : (
              <div className="empty-panel" style={{ margin: '2rem' }}>
                Aucun programme public n&apos;est diffuse pour le moment.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default ViewerPage;
