import React from 'react';

function AudioSourceInput({ source, isPreview, isProgram, onSelect }) {
  const classes = [
    'regie-input',
    isPreview ? 'regie-input--preview' : '',
    isProgram ? 'regie-input--program' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} onClick={() => onSelect(source)}>
      <div className="regie-input__badges">
        {isPreview && <span className="regie-badge regie-badge--pv">AUD PRE</span>}
        {isProgram && <span className="regie-badge regie-badge--pgm">AUD ON AIR</span>}
      </div>
      <div
        style={{
          height: '90px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a, #1d4ed8)',
          color: '#fff',
          fontWeight: 800,
          letterSpacing: '0.08em',
        }}
      >
        AUDIO
      </div>
      <span className="regie-input__name">{source.name}</span>
    </button>
  );
}

export default AudioSourceInput;
