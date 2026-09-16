/**
 * Shared "copy to clipboard" utilities for every Mara chat surface (public
 * widget, Control Center, Missions) — extracted from MaraChatWidget.tsx,
 * which already had this built, so the other two surfaces get the exact
 * same one-click "Copy" behavior instead of a second, divergent
 * implementation.
 */

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback: DOM textarea trick — also works on mobile (iOS Safari).
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, el.value.length); // mobile
    document.execCommand('copy');
    document.body.removeChild(el);
    return true;
  } catch {
    return false;
  }
}

/** Strips markdown to plain text (keeps code block contents) for a clean paste target. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => code.trim())
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/(?:^|\n)\d+\. /gm, '\n• ')
    .replace(/(?:^|\n)[•-] /gm, '\n• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
