/**
 * Shared pino logger — used by all agent and API modules.
 *
 * Pretty-prints in dev (pino-pretty with color), structured JSON in production.
 *
 * Used by: all `agent/` and `server/local/` modules
 */
import pino from 'pino';

export const logger = pino({
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
