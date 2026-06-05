import React from 'react';
import useWebRtcStream from '../hooks/useWebRtcStream';

function SourceInput({ camera, isPreview, isProgram, onSelect }) {
  const { videoRef } = useWebRtcStream(camera.id);

  const classes = [
    'regie-input',
    isPreview ? 'regie-input--preview' : '',
    isProgram ? 'regie-input--program' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} onClick={() => onSelect(camera)}>
      <div className="regie-input__badges">
        {isPreview && <span className="regie-badge regie-badge--pv">PV</span>}
        {isProgram && <span className="regie-badge regie-badge--pgm">ON AIR</span>}
      </div>
      <video ref={videoRef} className="regie-input__img" autoPlay playsInline muted />
      <span className="regie-input__name">{camera.name}</span>
    </button>
  );
}

export default SourceInput;
