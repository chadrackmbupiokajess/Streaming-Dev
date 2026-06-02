import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import CameraPage from './pages/CameraPage';
import AdminPage from './pages/AdminPage';
import ViewerPage from './pages/ViewerPage';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <nav className="navbar">
          <h1>Streaming App</h1>
          <div className="nav-links">
            <Link to="/camera">Caméra</Link>
            <Link to="/admin">Admin</Link>
            <Link to="/viewer">Viewer</Link>
          </div>
        </nav>
        <Routes>
          <Route path="/camera" element={<CameraPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/viewer" element={<ViewerPage />} />
          <Route path="/" element={<CameraPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
