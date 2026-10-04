import { Markdown } from '@/components/assistant/markdown';

export default function MarkdownRegression() {
  return (
    <main className="p-6">
      <Markdown
        content={
          '[unsafe-js](javascript:window.__r2Markdown=1)\n\n[unsafe-data](data:text/html,marker)\n\n[safe-local](/dashboard)\n\n[safe-external](https://example.test/guide)\n\n<img src=x onerror=window.__r2RawHtml=1>'
        }
      />
    </main>
  );
}
