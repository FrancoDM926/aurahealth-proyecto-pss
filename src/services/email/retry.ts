/**
 * Utilidad de reintentos acotados con backoff exponencial (US-21 / Criterio 3)
 */

export interface RetryOptions {
  maxRetries?: number; // Cantidad máxima de reintentos (por defecto 3)
  initialDelayMs?: number; // Delay inicial en milisegundos (por defecto 500ms)
  backoffFactor?: number; // Multiplicador de backoff (por defecto 2)
  onRetry?: (attempt: number, error: unknown, nextDelayMs: number) => void;
  sleepFn?: (ms: number) => Promise<void>; // Inyección de sleep para agilizar tests
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<{ result: T; attempts: number }> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelay = options.initialDelayMs ?? 500;
  const factor = options.backoffFactor ?? 2;
  const sleep = options.sleepFn ?? defaultSleep;

  let currentAttempt = 0;
  let lastError: unknown;

  // Intento inicial (1) + hasta maxRetries reintentos adicionales (total: 1 + maxRetries)
  // O si maxRetries representa intentos totales (ej. 3 intentos en total).
  // En US-21: "se reintentan una cantidad acotada de veces antes de marcarse como fallidos".
  // Manejamos maxAttempts = Math.max(1, maxRetries);
  const totalAllowedAttempts = Math.max(1, maxRetries);

  while (currentAttempt < totalAllowedAttempts) {
    currentAttempt++;
    try {
      const result = await operation(currentAttempt);
      return { result, attempts: currentAttempt };
    } catch (error) {
      lastError = error;

      if (currentAttempt < totalAllowedAttempts) {
        const delay = initialDelay * Math.pow(factor, currentAttempt - 1);
        if (options.onRetry) {
          options.onRetry(currentAttempt, error, delay);
        }
        await sleep(delay);
      }
    }
  }

  // Si agotó todos los intentos acotados, lanza el error acumulado
  const finalError =
    lastError instanceof Error
      ? lastError
      : new Error(typeof lastError === "string" ? lastError : "Operación fallida tras reintentos");

  // Asignamos metadatos de intentos al error
  (finalError as Error & { attempts?: number }).attempts = currentAttempt;
  throw finalError;
}
