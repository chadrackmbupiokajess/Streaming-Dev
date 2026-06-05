import React, { useMemo, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const initialBootstrapForm = {
  username: '',
  display_name: '',
  password: '',
};

const initialLoginForm = {
  username: '',
  password: '',
};

function LoginPage() {
  const {
    authLoading,
    bootstrap,
    isAuthenticated,
    login,
    setupRequired,
    user,
  } = useAuth();
  const location = useLocation();

  const [bootstrapForm, setBootstrapForm] = useState(initialBootstrapForm);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const redirectTo = useMemo(() => {
    if (location.state?.from) {
      return location.state.from;
    }
    return user?.role === 'regie' ? '/regie' : '/source';
  }, [location.state, user?.role]);

  if (isAuthenticated && user) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleBootstrapSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await bootstrap(bootstrapForm);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          requestError.response?.data?.username?.[0] ||
          "Impossible d'initialiser la regie."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login(loginForm);
    } catch (requestError) {
      setError(
        requestError.response?.data?.non_field_errors?.[0] ||
          requestError.response?.data?.detail ||
          'Connexion impossible.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container">
      <div className="page-shell">
        <section className="hero-panel hero-panel--auth">
          <div className="hero-panel__grid">
            <div>
              <p className="hero-panel__eyebrow">Production Access</p>
              <h2>Le live public reste ouvert. Les consoles privees, elles, sont securisees.</h2>
              <p>
                Les spectateurs regardent sans compte. Les sources publient avec un compte source.
                La regie pilote l&apos;antenne avec un compte regie.
              </p>
              <div className="status-strip" style={{ marginTop: '1.1rem' }}>
                <span className="signal-pill signal-pill--live">Public live ouvert</span>
                <span className="soft-chip">
                  <strong>Acces prive</strong> source et regie
                </span>
              </div>
            </div>

            <div className="hero-side">
              <div className="hero-metric">
                <span className="hero-metric__label">Etat plateforme</span>
                <div className="hero-metric__value">
                  {setupRequired ? 'Initialisation regie' : 'Connexion equipe'}
                </div>
              </div>
              <div className="hero-metric">
                <span className="hero-metric__label">Experience</span>
                <p className="hero-metric__text">
                  Design broadcast premium, controle strict des roles, et acces public immediat.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section-grid section-grid--two auth-layout">
          <div className="card auth-card">
            <div className="section-head">
              <div>
                <span className="mono-label">
                  {setupRequired ? 'Bootstrap Regie' : 'Team Login'}
                </span>
                <h3>
                  {setupRequired
                    ? 'Creer le premier compte regie'
                    : 'Connexion aux consoles privees'}
                </h3>
                <p>
                  {setupRequired
                    ? "Cette etape ne s'affiche qu'une seule fois lors du premier demarrage sur votre VPS."
                    : "Connectez-vous pour acceder a l'espace source ou a la regie centrale."}
                </p>
              </div>
            </div>

            {error && <div className="notice-banner">{error}</div>}

            {authLoading && setupRequired === null ? (
              <div className="empty-panel">Chargement de la configuration securisee...</div>
            ) : setupRequired ? (
              <form className="auth-form" onSubmit={handleBootstrapSubmit}>
                <label className="field">
                  <span>Nom d&apos;utilisateur regie</span>
                  <input
                    value={bootstrapForm.username}
                    onChange={(event) =>
                      setBootstrapForm((prev) => ({
                        ...prev,
                        username: event.target.value,
                      }))
                    }
                    placeholder="regie-master"
                    required
                  />
                </label>
                <label className="field">
                  <span>Nom affiche</span>
                  <input
                    value={bootstrapForm.display_name}
                    onChange={(event) =>
                      setBootstrapForm((prev) => ({
                        ...prev,
                        display_name: event.target.value,
                      }))
                    }
                    placeholder="Regie Principale"
                  />
                </label>
                <label className="field">
                  <span>Mot de passe</span>
                  <input
                    type="password"
                    value={bootstrapForm.password}
                    onChange={(event) =>
                      setBootstrapForm((prev) => ({
                        ...prev,
                        password: event.target.value,
                      }))
                    }
                    placeholder="Minimum 8 caracteres"
                    required
                  />
                </label>
                <button type="submit" disabled={submitting}>
                  {submitting ? 'Creation en cours...' : 'Initialiser la regie'}
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleLoginSubmit}>
                <label className="field">
                  <span>Nom d&apos;utilisateur</span>
                  <input
                    value={loginForm.username}
                    onChange={(event) =>
                      setLoginForm((prev) => ({
                        ...prev,
                        username: event.target.value,
                      }))
                    }
                    placeholder="source-plateau ou regie-master"
                    required
                  />
                </label>
                <label className="field">
                  <span>Mot de passe</span>
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(event) =>
                      setLoginForm((prev) => ({
                        ...prev,
                        password: event.target.value,
                      }))
                    }
                    placeholder="Votre mot de passe"
                    required
                  />
                </label>
                <button type="submit" disabled={submitting}>
                  {submitting ? 'Connexion...' : 'Entrer dans la console'}
                </button>
              </form>
            )}
          </div>

          <div className="card auth-card auth-card--secondary">
            <div className="section-head">
              <div>
                <span className="mono-label">Public Entrance</span>
                <h3>Le stream reste accessible a tout le monde</h3>
                <p>
                  C&apos;est la vitrine de votre MVP. Le visiteur arrive sur le site et regarde
                  immediatement le programme courant.
                </p>
              </div>
            </div>

            <div className="feature-stack">
              <div className="feature-tile">
                <strong>Sans login</strong>
                <span>Acces direct au live pour le public.</span>
              </div>
              <div className="feature-tile">
                <strong>Full screen</strong>
                <span>Mode immersif pour suivre le direct comme une vraie plateforme.</span>
              </div>
              <div className="feature-tile">
                <strong>Responsive</strong>
                <span>Lecture confortable sur mobile, tablette et desktop.</span>
              </div>
            </div>

            <div className="action-row" style={{ marginTop: '1rem' }}>
              <Link className="button-link" to="/live">
                Ouvrir le live public
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
