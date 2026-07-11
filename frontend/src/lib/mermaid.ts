// Lazy-loaded Mermaid renderer. Turns ```mermaid code blocks (rendered by marked
// as <pre><code class="language-mermaid">) into inline SVG diagrams.
// Mermaid is large, so this module is only imported when a diagram is present.
import mermaid from 'mermaid';

let initialized = false;
let counter = 0;

export async function renderMermaid(container: HTMLElement, isDark: boolean): Promise<void> {
  const blocks = Array.from(
    container.querySelectorAll<HTMLElement>('pre > code.language-mermaid')
  );
  if (blocks.length === 0) return;

  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'strict',
      fontFamily: 'inherit',
    });
    initialized = true;
  }

  for (const code of blocks) {
    const pre = code.closest('pre');
    if (!pre || pre.dataset.mermaidDone) continue;
    pre.dataset.mermaidDone = '1';
    const src = code.textContent || '';
    try {
      const { svg } = await mermaid.render(`mmd-${counter++}`, src);
      const wrap = document.createElement('div');
      wrap.className = 'mermaid-diagram';
      wrap.innerHTML = svg;
      pre.replaceWith(wrap);
    } catch {
      // Invalid diagram — leave the code block as-is so the source is still readable.
      delete pre.dataset.mermaidDone;
    }
  }
}
