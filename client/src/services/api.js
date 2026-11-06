/**
 * LedgerLine Frontend API Service
 * Centralizes all HTTP communications with the LedgerLine Express backend.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Fetches the backend health status.
 * @returns {Promise<{
 *   ok: boolean,
 *   data?: any,
 *   error?: string,
 *   latencyMs?: number
 * }>}
 */
export async function getHealthStatus() {
  const startTime = performance.now();
  try {
    const url = `${API_BASE_URL}/api/health`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const latencyMs = Math.round(performance.now() - startTime);
    const data = await response.json();

    return {
      ok: response.ok && data.status === 'UP',
      data,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      ok: false,
      error: error.message || 'Network error: Unable to contact LedgerLine API server',
      latencyMs,
    };
  }
}

