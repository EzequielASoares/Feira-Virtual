/**
 * Camada centralizada de comunicação com a API Django REST Framework.
 * Utiliza cookies HttpOnly + proteção CSRF (sem armazenar tokens JWT em localStorage).
 */

export const API_BASE =
  window.location.port === '8000' || window.location.protocol === 'https:' || window.location.hostname !== '127.0.0.1'
    ? '/api'
    : 'http://127.0.0.1:8000/api';

let refreshPromise = null;
let onUnauthorizedCallback = null;

export function setOnUnauthorized(cb) {
  onUnauthorizedCallback = cb;
}

export function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  for (const cookie of cookies) {
    const idx = cookie.indexOf('=');
    const key = idx > -1 ? cookie.slice(0, idx) : cookie;
    if (key === name) {
      return decodeURIComponent(cookie.slice(idx + 1));
    }
  }
  return null;
}

export async function ensureCsrf() {
  if (getCookie('csrftoken')) return;
  try {
    await fetch(`${API_BASE}/auth/csrf/`, {
      method: 'GET',
      credentials: 'same-origin',
    });
  } catch {
    // Falha silenciosa tratada nas chamadas subsequentes
  }
}

export async function refreshSession() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      await ensureCsrf();
      const csrf = getCookie('csrftoken');
      const res = await fetch(`${API_BASE}/auth/refresh/`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Mode': 'cookie',
          ...(csrf ? { 'X-CSRFToken': csrf } : {}),
        },
        body: JSON.stringify({}),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const method = (options.method || 'GET').toUpperCase();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const isSafe = ['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method);

  if (!isSafe) {
    await ensureCsrf();
  }

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };

  if (!isSafe) {
    const csrf = getCookie('csrftoken');
    if (csrf) {
      headers['X-CSRFToken'] = csrf;
    }
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      method,
      credentials: 'same-origin',
      headers,
    });
  } catch (err) {
    console.error('Falha de conexão com a API:', err);
    throw new Error('Não foi possível conectar ao servidor. Verifique se o backend está em execução.');
  }

  if (response.status === 401 && !options._retry && !options.skipAuthRefresh) {
    const ok = await refreshSession();
    if (ok) {
      return apiFetch(endpoint, { ...options, _retry: true });
    }
    if (onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }
  }

  return response;
}

export async function extractApiError(response, fallback = 'Ocorreu um erro na operação.') {
  try {
    const data = await response.json();
    if (typeof data === 'string') return data;
    if (data?.detail) return String(data.detail);
    if (Array.isArray(data) && data.length > 0) return String(data[0]);
    if (Array.isArray(data?.non_field_errors) && data.non_field_errors.length > 0) {
      return String(data.non_field_errors[0]);
    }
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      if (keys.length > 0) {
        const firstVal = data[keys[0]];
        const msg = Array.isArray(firstVal) ? firstVal[0] : firstVal;
        return `${keys[0]}: ${msg}`;
      }
    }
  } catch {
    // Resposta não JSON
  }
  return fallback;
}
