import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeFileName, validateAudioBlob } from 
  '../assets/js/utils/sanitizers.js';

describe('escapeHtml', () => {
  it('escapa caracteres HTML peligrosos', () => {
    expect(escapeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });
  it('retorna string vacío para null', () => {
    expect(escapeHtml(null)).toBe('');
  });
  it('retorna string vacío para undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });
  it('convierte números a string', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('sanitizeFileName', () => {
  it('elimina caracteres inválidos de Windows', () => {
    expect(sanitizeFileName('archivo<>:"/\\|?*.txt')).not.toMatch(/[<>:"\/\\|?*]/);
  });
  it('respeta el límite de 255 caracteres', () => {
    const largo = 'a'.repeat(300);
    expect(sanitizeFileName(largo).length).toBeLessThanOrEqual(255);
  });
  it('retorna "file" para string vacío', () => {
    expect(sanitizeFileName('')).toBe('file');
  });
  it('retorna "file" para null', () => {
    expect(sanitizeFileName(null)).toBe('file');
  });
});

describe('validateAudioBlob', () => {
  it('acepta audio/webm', () => {
    const blob = new Blob([], { type: 'audio/webm' });
    expect(validateAudioBlob(blob)).toBe(true);
  });
  it('rechaza video/mp4', () => {
    const blob = new Blob([], { type: 'video/mp4' });
    expect(validateAudioBlob(blob)).toBe(false);
  });
  it('lanza error si no es un Blob', () => {
    expect(() => validateAudioBlob('no-es-blob')).toThrow(TypeError);
  });
});
