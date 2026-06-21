/**
 * Export barrel — client-side PDF generation and export tracking.
 *
 * Upstream: `app/src/components/AppHeader/AppHeader.tsx` — download button
 * See also: `worker/src/domain/export/` — server-side tracking + R2 storage
 */

export { generateAndDownloadPdf } from './generatePdf';
