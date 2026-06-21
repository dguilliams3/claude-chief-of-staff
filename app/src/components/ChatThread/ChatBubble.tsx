/**
 * Chat bubble -- renders a single user question or assistant answer.
 *
 * PRESENTATIONAL. User messages are right-aligned with copper tint,
 * assistant messages are left-aligned with raised surface.
 *
 * Used by: `app/src/components/ChatThread/ChatThread.tsx`
 * Downstream: `@/components/Markdown` -- renders assistant markdown content
 */
import { Markdown } from '@/ui/Markdown';

export function ChatBubble({ role, content }: {
  role: 'user' | 'assistant';
  content: string;
}) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-sm bg-accent/15 border border-accent/20">
          <p className="font-body text-[0.8rem] text-primary">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] px-3.5 py-2 rounded-2xl rounded-bl-sm bg-surface-raised border border-border-subtle">
        <Markdown content={content} />
      </div>
    </div>
  );
}
