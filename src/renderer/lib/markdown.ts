// path: src/renderer/lib/markdown.ts
// Simple markdown renderer wrapper using global marked + hljs.
// TODO: Integrate DOMPurify for sanitization to prevent XSS.

export function isHighlightJsLoaded(): boolean {
  return typeof (window as any).hljs !== 'undefined';
}

export function renderMarkdown(text: string): string {
  try {
    // Configure marked once; rely on global marked object loaded in index.html
    if (typeof (window as any).marked !== 'undefined') {
      (window as any).marked.setOptions({
        highlight: function (code: string, lang: string) {
          if (!isHighlightJsLoaded()) {
            console.warn('Highlight.js is not loaded yet');
            return code;
          }
          try {
            const hljs = (window as any).hljs;
            if (lang && hljs.getLanguage(lang)) {
              return hljs.highlight(code, { language: lang }).value;
            } else {
              return hljs.highlightAuto(code).value;
            }
          } catch (e) {
            console.error('Error highlighting code:', e);
            return code;
          }
        },
        breaks: true,
        gfm: true,
      });

      // NOTE: This is not sanitized. Add DOMPurify if possible.
      return (window as any).marked.parse(text);
    }
    return text;
  } catch (e: any) {
    console.error('Markdown parsing error:', e);
    return `<p>Error rendering markdown: ${e.message}</p><pre>${text}</pre>`;
  }
}
