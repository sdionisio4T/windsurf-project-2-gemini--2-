import { describe, it, expect } from 'vitest';
import { AuthManager } from '../assets/js/modules/AuthManager.js';

const auth = new AuthManager();

describe('validateUsername', () => {
  it('acepta username válido', () => {
    expect(auth.validateUsername('pianista_99')).toBeNull();
  });
  it('rechaza username menor a 3 caracteres', () => {
    expect(auth.validateUsername('ab')).toBeTruthy();
  });
  it('rechaza caracteres especiales', () => {
    expect(auth.validateUsername('user@name')).toBeTruthy();
  });
});

describe('validateEmail', () => {
  it('acepta email válido', () => {
    expect(auth.validateEmail('user@example.com')).toBeNull();
  });
  it('rechaza email sin @', () => {
    expect(auth.validateEmail('sinArroba.com')).toBeTruthy();
  });
});

describe('validatePassword', () => {
  it('acepta contraseña de 6+ caracteres', () => {
    expect(auth.validatePassword('segura123')).toBeNull();
  });
  it('rechaza contraseña menor a 6 caracteres', () => {
    expect(auth.validatePassword('123')).toBeTruthy();
  });
});

describe('passwordStrength', () => {
  it('retorna nivel 1 para contraseña muy corta', () => {
    expect(auth.passwordStrength('abc').level).toBe(1);
  });
  it('retorna nivel 5 para contraseña fuerte', () => {
    expect(auth.passwordStrength('M1Contr@sena!Segura').level).toBe(5);
  });
});

describe('hashPassword', () => {
  it('produce el mismo hash con la misma sal', async () => {
    const hash1 = await auth.hashPassword('mipassword', 'sal123');
    const hash2 = await auth.hashPassword('mipassword', 'sal123');
    expect(hash1).toBe(hash2);
  });
  it('produce hashes distintos con distinta sal', async () => {
    const hash1 = await auth.hashPassword('mipassword', 'sal1');
    const hash2 = await auth.hashPassword('mipassword', 'sal2');
    expect(hash1).not.toBe(hash2);
  });
});
