import React from 'react';
import {
  BrowserRouter as Router,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import AdminPage from './pages/AdminPage';
import CameraPage from './pages/CameraPage';
import LoginPage from './pages/LoginPage';
import ViewerPage from './pages/ViewerPage';
import './App.css';

function Shell() {
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/live');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <div className="brand-mark">LK</div>
          <div>
            <p className="brand-kicker">Live Streaming Platform</p>
            <h1>Kollectif Live Control</h1>
          </div>
        </div>

        <nav className="topbar__nav" aria-label="Primary">
          <NavLink
            to="/live"
            className={({ isActive }) =>
              `topbar__link ${isActive ? 'topbar__link--active' : ''}`
            }
          >
            Live Public
          </NavLink>
          <NavLink
            to="/source"
            className={({ isActive }) =>
              `topbar__link ${isActive ? 'topbar__link--active' : ''}`
            }
          >
            Console Source
          </NavLink>
          <NavLink
            to="/regie"
            className={({ isActive }) =>
              `topbar__link ${isActive ? 'topbar__link--active' : ''}`
            }
          >
            Regie
          </NavLink>
        </nav>

        <div className="topbar__meta">
          <span className="signal-pill signal-pill--live">Public stream open</span>
          {isAuthenticated && user ? (
            <>
              <span className="soft-chip">
                <strong>{user.display_name}</strong> {user.role}
              </span>
              <button type="button" className="button-ghost topbar__button" onClick={handleLogout}>
                Deconnexion
              </button>
            </>
          ) : (
            <NavLink to="/login" className="button-link button-link--small">
              Connexion equipe
            </NavLink>
          )}
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/live" replace />} />
          <Route path="/live" element={<ViewerPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/source"
            element={
              <ProtectedRoute allowedRoles={['source']}>
                <CameraPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/regie"
            element={
              <ProtectedRoute allowedRoles={['regie']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route path="/camera" element={<Navigate to="/source" replace />} />
          <Route path="/admin" element={<Navigate to="/regie" replace />} />
          <Route path="/viewer" element={<Navigate to="/live" replace />} />
          <Route path="*" element={<Navigate to="/live" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Shell />
    </Router>
  );
}

export default App;
