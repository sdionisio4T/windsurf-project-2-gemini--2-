const isDev = typeof import.meta !== 'undefined' 
  ? import.meta.env?.DEV 
  : true;

export const logger = {
  log:   (...args) => { if (isDev) console.log('[PianoStudy]', ...args); },
  warn:  (...args) => { if (isDev) console.warn('[PianoStudy]', ...args); },
  error: (...args) => { console.error('[PianoStudy]', ...args); }, 
  // error siempre se muestra, los demás solo en desarrollo
};
