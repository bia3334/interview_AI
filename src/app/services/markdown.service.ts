import { Injectable } from '@angular/core';
import { marked } from 'marked';
import hljs from 'highlight.js';

// Declare global renderMathInElement from KaTeX auto-render CDN
declare global {
  interface Window {
    renderMathInElement?: (element: HTMLElement, options?: any) => void;
  }
}

@Injectable({
  providedIn: 'root'
})
export class MarkdownService {
  
  constructor() {
    // Configure marked with highlight.js
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }

  renderMarkdown(text: string): string {
    try {
      // Protect math expressions from markdown parsing by replacing them with placeholders
      const mathBlocks: string[] = [];
      const mathInlines: string[] = [];
      
      // Replace display math ($$...$$) with placeholders - must be done first
      let processedText = text.replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
        mathBlocks.push(match);
        return `%%MATHBLOCK${mathBlocks.length - 1}%%`;
      });
      
      // Replace inline math ($...$) with placeholders
      processedText = processedText.replace(/\$([^\$\n]+?)\$/g, (match) => {
        mathInlines.push(match);
        return `%%MATHINLINE${mathInlines.length - 1}%%`;
      });
      
      // Parse markdown
      let html = marked.parse(processedText) as string;
      
      // Restore math expressions
      mathBlocks.forEach((math, i) => {
        html = html.replace(`%%MATHBLOCK${i}%%`, math);
      });
      mathInlines.forEach((math, i) => {
        html = html.replace(`%%MATHINLINE${i}%%`, math);
      });
      
      // Create temporary container
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      
      // Apply syntax highlighting to code blocks
      tempDiv.querySelectorAll('pre code').forEach((block) => {
        try {
          const langClass = Array.from(block.classList).find(c => c.startsWith('language-'));
          const lang = langClass ? langClass.replace('language-', '') : null;
          
          if (lang && hljs.getLanguage(lang)) {
            block.innerHTML = hljs.highlight(block.textContent || '', { language: lang }).value;
          } else {
            block.innerHTML = hljs.highlightAuto(block.textContent || '').value;
          }
          block.classList.add('hljs');
        } catch (e) {
          console.error('Error highlighting code block:', e);
        }
      });
      
      return tempDiv.innerHTML;
    } catch (e: any) {
      console.error('Markdown parsing error:', e);
      return `<p>Error rendering markdown: ${e.message}</p><pre>${text}</pre>`;
    }
  }

  /**
   * Render math in an element using KaTeX auto-render (same as overlay.html)
   */
  renderMathInElement(element: HTMLElement): void {
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(element, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      } catch (e) {
        console.error('KaTeX rendering error:', e);
      }
    }
  }

  highlightCodeBlocks(): void {
    try {
      document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block as HTMLElement);
      });
    } catch (e) {
      console.error('Error applying syntax highlighting:', e);
    }
  }
}

