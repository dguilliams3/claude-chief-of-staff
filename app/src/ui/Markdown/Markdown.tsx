/**
 * ReactMarkdown wrapper — renders markdown content with GFM support inside a styled container.
 *
 * PRESENTATIONAL — thin wrapper around react-markdown with remark-gfm plugin.
 * All typography styling comes from the `prose-briefing` CSS class.
 * Memoized to avoid re-parsing markdown when content hasn't changed.
 *
 * Used by: `app/src/components/SectionCard.tsx::SectionCard`,
 *          `app/src/components/FollowUpBar.tsx::FollowUpBar`
 * See also: `app/src/index.css` — `prose-briefing` typography styles
 */
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const REMARK_PLUGINS = [remarkGfm];

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-briefing">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
    </div>
  );
});
