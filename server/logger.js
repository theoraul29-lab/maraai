/**
 * Minimal logger used by server/index.ts.
 * Logs errors to stderr without exposing sensitive request body values.
 */
export function logError(err, context = {}) {
  const { body: _body, ...safeContext } = context;
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error('[error]', message, safeContext);
  if (stack) console.error(stack);
}
