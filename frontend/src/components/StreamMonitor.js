import React from 'react';
import useWebRtcStream from '../hooks/useWebRtcStream';

function StreamMonitor({ cameraId, cameraName, label, variant, emptyText }) {
  const { status, videoRef } = useWebRtcStream(cameraId);

  return (
    <div className={`regie-monitor regie-monitor--${variant}`}>
      <div className="regie-monitor__head">
        <span className="regie-monitor__label">{label}</span>
        {cameraName && (
          <span className="regie-monitor__source">
            {cameraName} | {status}
          </span>
        )}
      </div>
      <div className="regie-monitor__screen">
        {!cameraId ? (
          <div className="regie-monitor__empty">{emptyText || 'Aucune source'}</div>
        ) : (
          <video
            ref={videoRef}
            className="regie-monitor__img"
            autoPlay
            playsInline
            muted
          />
        )}
      </div>
    </div>
  );
}

export default StreamMonitor;
