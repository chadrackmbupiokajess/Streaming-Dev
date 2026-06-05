import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import AudioSourceInput from '../components/AudioSourceInput';
import SourceInput from '../components/SourceInput';
import StreamMonitor from '../components/StreamMonitor';
import { API_URL, buildWsUrl } from '../config';
import apiClient from '../lib/apiClient';
import useAudioStream from '../hooks/useAudioStream';
import './AdminRegie.css';

const initialSourceAccountForm = {
  username: '',
  display_name: '',
  password: '',
};

function AdminPage() {
  const { createSourceAccount, listSourceAccounts, token, user } = useAuth();
  const [cameras, setCameras] = useState([]);
  const [audioSources, setAudioSources] = useState([]);
  const [previewCam, setPreviewCam] = useState(null);
  const [programCam, setProgramCam] = useState(null);
  const [previewAudio, setPreviewAudio] = useState(null);
  const [programAudio, setProgramAudio] = useState(null);
  const [autoTransition, setAutoTransition] = useState('cut');
  const [error, setError] = useState(null);
  const [taking, setTaking] = useState(false);
  const [takingAudio, setTakingAudio] = useState(false);
  const [sourceAccounts, setSourceAccounts] = useState([]);
  const [accountForm, setAccountForm] = useState(initialSourceAccountForm);
  const [accountFeedback, setAccountFeedback] = useState(null);
  const [accountSubmitting, setAccountSubmitting] = useState(false);

  const adminWsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const shouldReconnectRef = useRef(true);
  const previewAudioMonitor = useAudioStream(previewAudio?.id, {
    enabled: Boolean(previewAudio?.id),
  });

  const fetchSourceAccounts = useCallback(async () => {
    const data = await listSourceAccounts();
    setSourceAccounts(data);
  }, [listSourceAccounts]);

  const fetchData = useCallback(async () => {
    try {
      const [resCams, resSel, resAudios, resAudioSel] = await Promise.allSettled([
        apiClient.get(`${API_URL}/cameras/live/`),
        apiClient.get(`${API_URL}/streams/current_selected/`),
        apiClient.get(`${API_URL}/audio-sources/live/`),
        apiClient.get(`${API_URL}/audio-streams/current_selected/`),
      ]);

      if (resCams.status !== 'fulfilled' || resAudios.status !== 'fulfilled') {
        throw new Error('backend');
      }

      const liveCameras = resCams.value.data;
      const liveAudios = resAudios.value.data;

      setCameras(liveCameras);
      setAudioSources(liveAudios);
      setError(null);

      setPreviewCam((prev) => {
        if (prev && liveCameras.some((camera) => camera.id === prev.id)) {
          return prev;
        }
        return liveCameras[0] || null;
      });

      setPreviewAudio((prev) => {
        if (prev && liveAudios.some((source) => source.id === prev.id)) {
          return prev;
        }
        return liveAudios[0] || null;
      });

      if (resSel.status === 'fulfilled') {
        const selectedCamera = liveCameras.find(
          (camera) => camera.id === resSel.value.data.camera_id
        );
        setProgramCam(
          selectedCamera ? { id: selectedCamera.id, name: selectedCamera.name } : null
        );
      } else {
        setProgramCam(null);
      }

      if (resAudioSel.status === 'fulfilled') {
        const selectedAudio = liveAudios.find(
          (source) => source.id === resAudioSel.value.data.audio_source_id
        );
        setProgramAudio(
          selectedAudio ? { id: selectedAudio.id, name: selectedAudio.name } : null
        );
      } else {
        setProgramAudio(null);
      }
    } catch (requestError) {
      setError('Impossible de joindre le backend.');
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      fetchData();
    }, 120);
  }, [fetchData]);

  const connectAdminSocket = useCallback(() => {
    if (!token) {
      return;
    }

    if (
      adminWsRef.current &&
      (adminWsRef.current.readyState === WebSocket.OPEN ||
        adminWsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const socket = new WebSocket(buildWsUrl('/admin/', token));
    socket.onmessage = () => {
      scheduleRefresh();
    };
    socket.onclose = () => {
      adminWsRef.current = null;
      if (!shouldReconnectRef.current) {
        return;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(connectAdminSocket, 800);
    };

    adminWsRef.current = socket;
  }, [scheduleRefresh, token]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    fetchData();
    fetchSourceAccounts().catch(() => {});
    connectAdminSocket();

    return () => {
      shouldReconnectRef.current = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (adminWsRef.current) {
        adminWsRef.current.close();
        adminWsRef.current = null;
      }
    };
  }, [connectAdminSocket, fetchData, fetchSourceAccounts]);

  const takeToProgram = async (transition, cam = previewCam) => {
    if (!cam || taking) {
      return;
    }

    setTaking(true);
    setError(null);

    try {
      await apiClient.post(`${API_URL}/cameras/${cam.id}/select_for_viewer/`, {
        transition,
        duration_ms: transition === 'fade' ? 500 : 0,
      });
      setProgramCam({ id: cam.id, name: cam.name });
    } catch (requestError) {
      setError('Echec du passage video au programme.');
    } finally {
      setTaking(false);
    }
  };

  const takeAudioToProgram = async (source = previewAudio) => {
    if (!source || takingAudio) {
      return;
    }

    setTakingAudio(true);
    setError(null);

    try {
      await apiClient.post(`${API_URL}/audio-sources/${source.id}/select_for_listener/`);
      setProgramAudio({ id: source.id, name: source.name });
    } catch (requestError) {
      setError('Echec du passage audio au programme.');
    } finally {
      setTakingAudio(false);
    }
  };

  const handleCreateSourceAccount = async (event) => {
    event.preventDefault();
    setAccountSubmitting(true);
    setAccountFeedback(null);
    setError(null);

    try {
      const response = await createSourceAccount(accountForm);
      setAccountFeedback(response);
      setAccountForm(initialSourceAccountForm);
      await fetchSourceAccounts();
    } catch (requestError) {
      setError(
        requestError.response?.data?.username?.[0] ||
          requestError.response?.data?.error ||
          "Impossible de creer le compte source."
      );
    } finally {
      setAccountSubmitting(false);
    }
  };

  return (
    <div className="container">
      <div className="page-shell regie">
        <section className="hero-panel">
          <div className="hero-panel__grid">
            {/* <div>
              <p className="hero-panel__eyebrow">Master Control Room</p>
              <h2>Une seule sortie programme. Plusieurs sources. Zero confusion.</h2>
              <p>
                Cette interface est le coeur operationnel du MVP. La regie choisit la video et
                l&apos;audio qui partent vers le flux public visible par tous les visiteurs, sans
                authentification.
              </p>
            </div> */}

            <div className="hero-side">
              <div className="hero-metric">
                <span className="hero-metric__label">Compte regie</span>
                <div className="hero-metric__value">{user?.display_name || 'Regie'}</div>
              </div>
              <div className="hero-metric">
                <span className="hero-metric__label">Sources video</span>
                <div className="hero-metric__value">{cameras.length}</div>
              </div>
              <div className="hero-metric">
                <span className="hero-metric__label">Sources audio</span>
                <div className="hero-metric__value">{audioSources.length}</div>
              </div>
            </div>
          </div>
        </section>

        <div className={`status-strip ${error ? 'status-strip--danger' : ''}`}>
          <span className="soft-chip">
            <strong>Backend</strong> {error ? 'degrade' : 'connecte'}
          </span>
          <span className="soft-chip">
            <strong>Mode</strong> {autoTransition ? `auto ${autoTransition}` : 'manuel'}
          </span>
          <span className="soft-chip">
            <strong>Public live</strong> flux video/audio unifie
          </span>
        </div>

        {error && <div className="notice-banner">{error}</div>}

        {accountFeedback && (
          <div className="notice-banner notice-banner--success">
            <strong style={{ display: 'block', marginBottom: '0.35rem' }}>
              Compte source cree
            </strong>
            <span>
              {accountFeedback.account.display_name} | identifiant{' '}
              <code>{accountFeedback.account.username}</code> | mot de passe initial{' '}
              <code>{accountFeedback.generated_password}</code>
            </span>
          </div>
        )}

        <section className="section-grid section-grid--two">
          <div className="card regie-account-card">
            <div className="section-head">
              <div>
                <span className="mono-label">Source Provisioning</span>
                <h3>Creer des comptes source</h3>
                <p>
                  La regie distribue les acces source. Chaque operateur se connecte ensuite a sa
                  propre console de publication.
                </p>
              </div>
              <span className="soft-chip">
                <strong>{sourceAccounts.length}</strong> comptes source
              </span>
            </div>

            <form className="auth-form auth-form--compact" onSubmit={handleCreateSourceAccount}>
              <label className="field">
                <span>Nom d&apos;utilisateur</span>
                <input
                  value={accountForm.username}
                  onChange={(event) =>
                    setAccountForm((prev) => ({ ...prev, username: event.target.value }))
                  }
                  placeholder="source-plateau-a"
                  required
                />
              </label>
              <label className="field">
                <span>Nom affiche</span>
                <input
                  value={accountForm.display_name}
                  onChange={(event) =>
                    setAccountForm((prev) => ({ ...prev, display_name: event.target.value }))
                  }
                  placeholder="Plateau A"
                />
              </label>
              <label className="field">
                <span>Mot de passe initial</span>
                <input
                  value={accountForm.password}
                  onChange={(event) =>
                    setAccountForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                  placeholder="Laisser vide pour generation automatique"
                />
              </label>
              <button type="submit" disabled={accountSubmitting}>
                {accountSubmitting ? 'Creation...' : 'Creer un compte source'}
              </button>
            </form>
          </div>

          <div className="card regie-account-card">
            <div className="section-head">
              <div>
                <span className="mono-label">Source Directory</span>
                <h3>Acces deja provisionnes</h3>
                <p>Vue rapide des comptes que votre equipe peut utiliser pour publier des flux.</p>
              </div>
            </div>

            {sourceAccounts.length === 0 ? (
              <div className="empty-panel">Aucun compte source cree pour le moment.</div>
            ) : (
              <div className="account-list">
                {sourceAccounts.map((account) => (
                  <div key={account.id} className="account-item">
                    <strong>{account.display_name}</strong>
                    <span>@{account.username}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="card regie-in">
          <div className="section-head">
            <div>
              <span className="mono-label">Input Wall</span>
              <h3>Mur de sources video</h3>
              <p>Choisissez votre preview video, puis poussez-la vers le programme public.</p>
            </div>
            <span className="soft-chip">
              <strong>{cameras.length}</strong> entrees
            </span>
          </div>
          <div className="regie-in__strip">
            {cameras.map((camera) => (
              <SourceInput
                key={camera.id}
                camera={camera}
                isPreview={Number(previewCam?.id) === Number(camera.id)}
                isProgram={Number(programCam?.id) === Number(camera.id)}
                onSelect={(selectedCamera) => {
                  setPreviewCam({ id: selectedCamera.id, name: selectedCamera.name });
                  if (autoTransition === 'cut') {
                    takeToProgram('cut', selectedCamera);
                  } else if (autoTransition === 'fade') {
                    takeToProgram('fade', selectedCamera);
                  }
                }}
              />
            ))}
          </div>
        </section>

        <section className="regie-bus">
          <StreamMonitor
            cameraId={previewCam?.id}
            cameraName={previewCam?.name}
            label="PV - APERCU VIDEO"
            variant="preview"
            emptyText="Choisissez une camera source"
          />

          <div className="regie-controls">
            <div className="regie-controls__arrow">-&gt;</div>
            <button
              type="button"
              className="regie-btn regie-btn--cut"
              onClick={() => takeToProgram('cut')}
              disabled={!previewCam || taking}
            >
              CUT VIDEO
            </button>
            <button
              type="button"
              className="regie-btn regie-btn--fade"
              onClick={() => takeToProgram('fade')}
              disabled={!previewCam || taking}
            >
              FADE VIDEO
            </button>
            <button
              type="button"
              className={`regie-btn regie-btn--auto ${autoTransition === 'cut' ? 'active' : ''}`}
              onClick={() => setAutoTransition(autoTransition === 'cut' ? null : 'cut')}
            >
              {autoTransition === 'cut' ? 'AUTO CUT ACTIF' : 'AUTO CUT'}
            </button>
            <button
              type="button"
              className={`regie-btn regie-btn--auto ${autoTransition === 'fade' ? 'active' : ''}`}
              onClick={() => setAutoTransition(autoTransition === 'fade' ? null : 'fade')}
            >
              {autoTransition === 'fade' ? 'AUTO FADE ACTIF' : 'AUTO FADE'}
            </button>
          </div>

          <StreamMonitor
            cameraId={programCam?.id}
            cameraName={programCam?.name}
            label="PGM - VIDEO ON AIR"
            variant="program"
            emptyText="Aucune video a l'antenne"
          />
        </section>

        <section className="card regie-in">
          <div className="section-head">
            <div>
              <span className="mono-label">Audio Bus</span>
              <h3>Mur de sources audio</h3>
              <p>Le son suit son propre bus pour garder une production live propre et stable.</p>
            </div>
            <span className="soft-chip">
              <strong>{audioSources.length}</strong> entrees
            </span>
          </div>

          <div className="regie-in__strip">
            {audioSources.map((source) => (
              <AudioSourceInput
                key={source.id}
                source={source}
                isPreview={Number(previewAudio?.id) === Number(source.id)}
                isProgram={Number(programAudio?.id) === Number(source.id)}
                onSelect={(selectedSource) =>
                  setPreviewAudio({ id: selectedSource.id, name: selectedSource.name })
                }
              />
            ))}
          </div>
        </section>

        <section className="regie-bus regie-bus--audio">
          <div className="regie-monitor regie-monitor--preview">
            <div className="regie-monitor__head">
              <span className="regie-monitor__label">AUD PRELISTEN</span>
              {previewAudio?.name && (
                <span className="regie-monitor__source">{previewAudio.name}</span>
              )}
            </div>
            <div className="regie-monitor__screen regie-monitor__screen--audio">
              {previewAudio ? (
                <>
                  <div className="regie-monitor__empty regie-monitor__empty--audio">
                    {previewAudioMonitor.audioReady
                      ? 'Monitoring audio actif'
                      : 'Audio en attente d activation navigateur'}
                  </div>
                  {previewAudioMonitor.audioBlocked && (
                    <button
                      type="button"
                      className="regie-btn regie-btn--fade"
                      onClick={previewAudioMonitor.activateAudio}
                    >
                      ACTIVER LE MONITOR AUDIO
                    </button>
                  )}
                </>
              ) : (
                <div className="regie-monitor__empty">Choisissez une source audio</div>
              )}
            </div>
          </div>

          <div className="regie-controls">
            <div className="regie-controls__arrow">-&gt;</div>
            <button
              type="button"
              className="regie-btn regie-btn--cut"
              onClick={() => takeAudioToProgram()}
              disabled={!previewAudio || takingAudio}
            >
              TAKE AUDIO
            </button>
          </div>

          <div className="regie-monitor regie-monitor--program">
            <div className="regie-monitor__head">
              <span className="regie-monitor__label">AUD ON AIR</span>
              {programAudio?.name && (
                <span className="regie-monitor__source">{programAudio.name}</span>
              )}
            </div>
            <div className="regie-monitor__screen regie-monitor__screen--audio">
              <div className="regie-monitor__empty regie-monitor__empty--audio">
                {programAudio ? 'Audio programme public actif' : "Aucun audio a l'antenne"}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default AdminPage;
