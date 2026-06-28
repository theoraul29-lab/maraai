/**
 * Server-side sanitisation for author-submitted rich-text (Writers articles).
 *
 * The frontend already sanitises with DOMPurify (see
 * frontend/src/components/RichEditor.tsx), but client-side sanitisation is a
 * UX nicety, not a security boundary — a crafted request straight to
 * `POST /api/writers/...` bypasses it entirely. We therefore re-sanitise on
 * the server before persisting, mirroring the same allowlist the client uses
 * so legitimate TipTap output round-trips unchanged.
 */
import sanitizeHtml from 'sanitize-html';

// Mirror of ALLOWED_TAGS / ALLOWED_ATTR in RichEditor.tsx.
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'hr',
  'ul', 'ol', 'li',
  'a', 'img',
  'span', 'div',
];

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      '*': ['class'],
    },
    // Only http(s) and mailto links / images; strips javascript:, data:, etc.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    // Force outbound links to be safe against tab-nabbing while preserving
    // any SEO-relevant tokens (e.g. `nofollow`) the editor already set —
    // TipTap emits rel="noopener noreferrer nofollow".
    transformTags: {
      a: (tagName, attribs) => {
        if (attribs.target === '_blank') {
          const tokens = new Set((attribs.rel ?? '').split(/\s+/).filter(Boolean));
          tokens.add('noopener');
          tokens.add('noreferrer');
          attribs.rel = Array.from(tokens).join(' ');
        }
        return { tagName, attribs };
      },
    },
  });
}

/**
 * Strip ALL markup, returning plain text. Used for fields that are rendered
 * as text but are user-controlled (e.g. article excerpts / previews) so a
 * crafted request can't smuggle HTML through them.
 */
export function stripHtml(input: string): string {
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
}
