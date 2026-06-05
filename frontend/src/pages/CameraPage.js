import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import LiveAudioCard from '../components/LiveAudioCard';
import LiveSourceCard from '../components/LiveSourceCard';
import { API_URL } from '../config';
import apiClient from '../lib/apiClient';

const STORAGE_SESSION = 'deviceId';

async function cleanupStaleEntries(sessionId) {
  if (!sessionId) {
    return;
  }

  await Promise.allSettled([
    apiClient.post(`${API_URL}/cameras/cleanup_session/`, { session_id: sessionId }),
    apiClient.post(`${API_URL}/audio-sources/cleanup_session/`, {
      session_id: `${sessionId}__audio`,
    }),
  ]);
}

function dedupeAudioDevices(devices) {
  const filtered = devices.filter(
    (device) => device.deviceId && device.deviceId !== 'communications'
  );
  const seen = new Set();

  return filtered.filter((device) => {
    const key = `${device.groupId || ''}:${device.label || device.deviceId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function CameraPage() {
  const { user } = useAuth();
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [pickedVideoDevices, setPickedVideoDevices] = useState(() => new Set());
  const [pickedAudioDevices, setPickedAudioDevices] = useState(() => new Set());
  const [liveVideoSources, setLiveVideoSources] = useState([]);
  const [liveAudioSources, setLiveAudioSources] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [deviceError, setDeviceError] = useState(null);
  const [loadingDevices, setLoadingDevices] = useState(true);

  const refreshDeviceList = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((device) => device.kind === 'videoinput');
    const audioInputs = dedupeAudioDevices(
      devices.filter((device) => device.kind === 'audioinput')
    );
    setVideoDevices(videoInputs);
    setAudioDevices(audioInputs);
  }, []);

  const initDevices = useCallback(async () => {
    setLoadingDevices(true);
    setDeviceError(null);

    let permissionStream = null;

    try {
      permissionStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      await refreshDeviceList();

      let sid = localStorage.getItem(STORAGE_SESSION);
      if (!sid) {
        sid =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? `cam_${crypto.randomUUID()}`
            : `cam_${Math.random().toString(36).slice(2, 11)}`;
        localStorage.setItem(STORAGE_SESSION, sid);
      }

      setSessionId(sid);
      await cleanupStaleEntries(sid);
    } catch (error) {
      console.error(error);
      setDeviceError(
        "Autorisez l'acces a la camera et au micro pour publier des flux live."
      );
    } finally {
      if (permissionStream) {
        permissionStream.getTracks().forEach((track) => track.stop());
      }
      setLoadingDevices(false);
    }
  }, [refreshDeviceList]);

  useEffect(() => {
    initDevices();
    const onDeviceChange = () => refreshDeviceList();
    navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange);
  }, [initDevices, refreshDeviceList]);

  const getVideoLabel = (device, index) => device?.label || `Camera ${index + 1}`;
  const getAudioLabel = (device, index) => device?.label || `Micro ${index + 1}`;

  const liveVideoIds = new Set(liveVideoSources.map((source) => source.deviceId));
  const liveAudioIds = new Set(liveAudioSources.map((source) => source.deviceId));

  const togglePicked = (deviceId, type) => {
    const liveIds = type === 'video' ? liveVideoIds : liveAudioIds;
    const setter = type === 'video' ? setPickedVideoDevices : setPickedAudioDevices;

    if (liveIds.has(deviceId)) {
      return;
    }

    setter((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  };

  const launchSelectedVideos = () => {
    const toAdd = [...pickedVideoDevices].filter((deviceId) => !liveVideoIds.has(deviceId));
    if (toAdd.length === 0) {
      setDeviceError('Selectionnez au moins une source video libre.');
      return;
    }

    setDeviceError(null);
    const newSources = toAdd.map((deviceId) => {
      const videoDevice = videoDevices.find((device) => device.deviceId === deviceId);
      const index = videoDevices.indexOf(videoDevice);
      return { deviceId, label: getVideoLabel(videoDevice, index) };
    });

    setLiveVideoSources((prev) => [...prev, ...newSources]);
    setPickedVideoDevices(new Set());
  };

  const launchSelectedAudios = () => {
    const toAdd = [...pickedAudioDevices].filter((deviceId) => !liveAudioIds.has(deviceId));
    if (toAdd.length === 0) {
      setDeviceError('Selectionnez au moins une source audio libre.');
      return;
    }

    setDeviceError(null);
    const newSources = toAdd.map((deviceId) => {
      const audioDevice = audioDevices.find((device) => device.deviceId === deviceId);
      const index = audioDevices.indexOf(audioDevice);
      return { deviceId, label: getAudioLabel(audioDevice, index) };
    });

    setLiveAudioSources((prev) => [...prev, ...newSources]);
    setPickedAudioDevices(new Set());
  };

  const stopVideoSource = useCallback((deviceId) => {
    setLiveVideoSources((prev) => prev.filter((source) => source.deviceId !== deviceId));
    setPickedVideoDevices((prev) => {
      const next = new Set(prev);
      next.delete(deviceId);
      return next;
    });
  }, []);

  const stopAudioSource = useCallback((deviceId) => {
    setLiveAudioSources((prev) => prev.filter((source) => source.deviceId !== deviceId));
    setPickedAudioDevices((prev) => {
      const next = new Set(prev);
      next.delete(deviceId);
      return next;
    });
  }, []);

  return (
    <div className="container">
      <div className="page-shell">
        <section className="hero-panel">
          <div className="hero-panel__grid">
            <div>
              {/* <p className="hero-panel__eyebrow">Source Operator Workspace</p>
              <h2>Publiez vos cameras et vos micros dans la plateforme live.</h2>
              <p>
                Cette console correspond a l'experience source du MVP SaaS. La regie
                centrale peut ensuite choisir le meilleur flux video et le meilleur flux
                audio pour alimenter la diffusion publique.
              </p> */}
              <div className="status-strip" style={{ marginTop: '1.1rem' }}>
                <span className="soft-chip">
                  <strong>{sessionId ? 'Session prete' : 'Session en cours'}</strong>
                </span>
                <span className="soft-chip">
                  <strong>{liveVideoSources.length}</strong> video live
                </span>
                <span className="soft-chip">
                  <strong>{liveAudioSources.length}</strong> audio live
                </span>
              </div>
            </div>

            <div className="hero-side">
              <div className="hero-metric">
                <span className="hero-metric__label">Compte source</span>
                <div className="hero-metric__value">{user?.display_name || 'Operateur source'}</div>
                <p className="hero-metric__text">
                  Une source se connecte pour pousser un flux; le public regarde sans login.
                </p>
              </div>
              <div className="hero-metric">
                <span className="hero-metric__label">Console active</span>
                <div className="hero-metric__value">
                  {loadingDevices ? 'Scanning...' : `${videoDevices.length + audioDevices.length} devices`}
                </div>
              </div>
            </div>
          </div>
        </section>

        {deviceError && (
          <div className="notice-banner">
            <strong style={{ display: 'block', marginBottom: '0.35rem' }}>
              Action requise
            </strong>
            {deviceError}
          </div>
        )}

        <div className="action-row">
          <button type="button" className="button-secondary" onClick={initDevices} disabled={loadingDevices}>
            Actualiser les peripheriques
          </button>
          <button
            type="button"
            className="button-ghost"
            onClick={() => {
              setPickedVideoDevices(new Set(videoDevices.map((device) => device.deviceId)));
              setPickedAudioDevices(new Set(audioDevices.map((device) => device.deviceId)));
            }}
            disabled={loadingDevices}
          >
            Tout selectionner
          </button>
        </div>

        <section className="section-grid section-grid--two">
          <div className="card">
            <div className="section-head">
              <div>
                <span className="mono-label">Video Inputs</span>
                <h3>Sources video disponibles</h3>
                <p>Selectionnez les cameras que la regie pourra retrouver dans son mur de sources.</p>
              </div>
              <span className="soft-chip">
                <strong>{videoDevices.length}</strong> detectees
              </span>
            </div>

            <div className="catalog-list">
              {loadingDevices && <div className="empty-panel">Chargement des cameras...</div>}
              {!loadingDevices && videoDevices.length === 0 && (
                <div className="empty-panel">Aucune camera detectee sur cette station.</div>
              )}
              {videoDevices.map((device, index) => {
                const live = liveVideoIds.has(device.deviceId);
                const picked = pickedVideoDevices.has(device.deviceId);
                return (
                  <label key={device.deviceId} className="catalog-item">
                    <input
                      type="checkbox"
                      checked={live || picked}
                      disabled={live}
                      onChange={() => togglePicked(device.deviceId, 'video')}
                    />
                    <div>
                      <div className="catalog-item__name">{getVideoLabel(device, index)}</div>
                      <div className="catalog-item__meta">Source camera prete pour le direct</div>
                    </div>
                    <span className={`catalog-badge ${live ? 'catalog-badge--live' : ''}`}>
                      {live ? 'LIVE' : 'READY'}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="action-row" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                onClick={launchSelectedVideos}
                disabled={loadingDevices || pickedVideoDevices.size === 0 || !sessionId}
              >
                Publier la video
              </button>
            </div>
          </div>

          <div className="card">
            <div className="section-head">
              <div>
                <span className="mono-label">Audio Inputs</span>
                <h3>Sources audio disponibles</h3>
                <p>Les micros suivent un pipeline dedie pour que le son ne ralentisse jamais la video.</p>
              </div>
              <span className="soft-chip">
                <strong>{audioDevices.length}</strong> detectees
              </span>
            </div>

            <div className="catalog-list">
              {loadingDevices && <div className="empty-panel">Chargement des micros...</div>}
              {!loadingDevices && audioDevices.length === 0 && (
                <div className="empty-panel">Aucune source audio detectee sur cette station.</div>
              )}
              {audioDevices.map((device, index) => {
                const live = liveAudioIds.has(device.deviceId);
                const picked = pickedAudioDevices.has(device.deviceId);
                return (
                  <label key={device.deviceId} className="catalog-item">
                    <input
                      type="checkbox"
                      checked={live || picked}
                      disabled={live}
                      onChange={() => togglePicked(device.deviceId, 'audio')}
                    />
                    <div>
                      <div className="catalog-item__name">{getAudioLabel(device, index)}</div>
                      <div className="catalog-item__meta">Bus audio independant, optimisé pour le live</div>
                    </div>
                    <span className={`catalog-badge ${live ? 'catalog-badge--audio' : ''}`}>
                      {live ? 'LIVE' : 'READY'}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="action-row" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="button-audio"
                onClick={launchSelectedAudios}
                disabled={loadingDevices || pickedAudioDevices.size === 0 || !sessionId}
              >
                Publier l'audio
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="section-head">
            <div>
              <span className="mono-label">Published Sources</span>
              <h3>Flux actuellement disponibles pour la regie</h3>
              <p>Chaque source publiee devient une entree exploitable par le compte regie central.</p>
            </div>
            <span className="soft-chip">
              <strong>{liveVideoSources.length + liveAudioSources.length}</strong> streams actifs
            </span>
          </div>

          {liveVideoSources.length === 0 && liveAudioSources.length === 0 ? (
            <div className="empty-panel">
              Aucune source publiee pour le moment. Selectionnez vos cameras ou micros pour alimenter la plateforme.
            </div>
          ) : (
            <div className="publisher-grid">
              {liveVideoSources.map((source) => (
                <LiveSourceCard
                  key={`video-${source.deviceId}`}
                  deviceId={source.deviceId}
                  label={source.label}
                  sessionId={sessionId}
                  onStopped={stopVideoSource}
                />
              ))}
              {liveAudioSources.map((source) => (
                <LiveAudioCard
                  key={`audio-${source.deviceId}`}
                  deviceId={source.deviceId}
                  label={source.label}
                  sessionId={sessionId}
                  onStopped={stopAudioSource}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default CameraPage;
