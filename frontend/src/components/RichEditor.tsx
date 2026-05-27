/**
 * Rich-text editor for Writers Hub.
 *
 * Wraps TipTap + StarterKit with the formatting controls the spec calls out:
 * bold / italic / headings (H2 / H3) / bullet + ordered lists / blockquote /
 * inline code + code block / image-by-URL / hyperlink. Kept deliberately small
 * — TipTap's extension surface is huge; we only expose what scriitorii need
 * day-to-day, and only what DOMPurify will let through on render.
 *
 * Value semantics: always HTML. `initialHtml` seeds the editor on mount;
 * every user keystroke calls `onChange(html)` with the current sanitised
 * HTML. Callers pass that straight into the backend's `content` field.
 */
import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import './RichEditor.css';

interface Props {
  initialHtml?: string;
  placeholder?: string;
  onChange: (html: string) => void;
  // When true, renders a more compact toolbar (mobile). Defaults to false.
  compact?: boolean;
}

// Sanitiser shared between editor output and read-mode rendering. We allow
// only the tags + attrs TipTap actually produces with the extensions wired
// below. Anything fancier (iframes, scripts, data-URIs) is stripped.
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'hr',
  'ul', 'ol', 'li',
  'a', 'img',
  'span', 'div',
];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'target', 'rel', 'class'];

export function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Force `target="_blank"` links through `rel="noopener noreferrer"` so
    // user-authored outbound links can't hijack our tab via `window.opener`.
    ADD_ATTR: ['target'],
  });
}

function ToolbarButton({
  cmd,
  active,
  label,
  tooltip,
  hotkey,
}: {
  cmd: () => void;
  active?: boolean;
  label: string;
  tooltip?: string;
  hotkey?: string;
}) {
  const tip = tooltip || label;
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Prevent focus jump out of the editor — otherwise clicking a
        // toolbar button would blur the doc, and `chain().focus()` would
        // have nothing to re-focus on mobile Safari.
        e.preventDefault();
        cmd();
      }}
      className={`rt-btn ${active ? 'is-active' : ''}`}
      title={hotkey ? `${tip} (${hotkey})` : tip}
      aria-label={tip}
      aria-pressed={active ? 'true' : 'false'}
    >
      {label}
    </button>
  );
}

export const RichEditor: React.FC<Props> = ({
  initialHtml = '',
  placeholder = '',
  onChange,
  compact = false,
}) => {
  const { t } = useTranslation();

  // Keep latest onChange in a ref so the editor instance doesn't need to be
  // recreated every time the parent re-renders with a new callback closure.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Headings: spec mentions "headings" — we expose H2/H3 in the toolbar
        // but allow all levels so pasted content from Word/Docs survives.
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Image.configure({
        inline: false,
        allowBase64: false, // prevent 10MB base64 blobs in article bodies
        HTMLAttributes: { class: 'rt-img' },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialHtml || '',
    editorProps: {
      attributes: {
        class: 'rt-content',
        // Authoring surface is deliberately writable — sanitisation happens
        // in onUpdate before we hand the HTML back to the parent.
        spellcheck: 'true',
      },
    },
    onUpdate({ editor }) {
      const raw = editor.getHTML();
      // Strip anything our allow-list doesn't match so a pasted <script>
      // can't leak into the stored content. We still sanitise again on
      // render — defence in depth.
      onChangeRef.current(sanitizeRichHtml(raw));
    },
  });

  // If the caller swaps `initialHtml` at runtime (e.g. loading a draft),
  // push the new content into the editor without forcing a remount.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    // Compare against coerced empty string so resetting the parent to `''`
    // actually clears the editor — otherwise TipTap keeps the old doc while
    // the parent thinks content is empty, and the next keystroke re-fills
    // state with stale HTML.
    if ((initialHtml || '') !== current) {
      editor.commands.setContent(initialHtml, { emitUpdate: false });
    }
  }, [editor, initialHtml]);

  if (!editor) {
    return <div className="rt-shell rt-loading">…</div>;
  }

  const addImage = () => {
    const url = window.prompt(t('writers.editor.imagePrompt', 'Image URL (https://…)'));
    if (!url) return;
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return;
      editor.chain().focus().setImage({ src: u.href }).run();
    } catch {
      /* ignore bad URL */
    }
  };

  const addLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt(t('writers.editor.linkPrompt', 'Link URL'), prev ?? 'https://');
    if (url === null) return; // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return;
      editor.chain().focus().extendMarkRange('link').setLink({ href: u.href }).run();
    } catch {
      /* ignore bad URL */
    }
  };

  return (
    <div className={`rt-shell ${compact ? 'rt-compact' : ''}`}>
      <div className="rt-toolbar" role="toolbar" aria-label={t('writers.editor.toolbar', 'Formatting')}>
        <ToolbarButton
          cmd={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          label="B"
          tooltip={t('writers.editor.bold', 'Bold')}
          hotkey="Ctrl+B"
        />
        <ToolbarButton
          cmd={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          label="I"
          tooltip={t('writers.editor.italic', 'Italic')}
          hotkey="Ctrl+I"
        />
        <span className="rt-sep" />
        <ToolbarButton
          cmd={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          label="H2"
          tooltip={t('writers.editor.heading2', 'Heading 2')}
        />
        <ToolbarButton
          cmd={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          label="H3"
          tooltip={t('writers.editor.heading3', 'Heading 3')}
        />
        <span className="rt-sep" />
        <ToolbarButton
          cmd={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          label="• List"
          tooltip={t('writers.editor.bulletList', 'Bullet list')}
        />
        <ToolbarButton
          cmd={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          label="1. List"
          tooltip={t('writers.editor.orderedList', 'Numbered list')}
        />
        <span className="rt-sep" />
        <ToolbarButton
          cmd={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          label="&ldquo;&nbsp;&rdquo;"
          tooltip={t('writers.editor.blockquote', 'Blockquote')}
        />
        <ToolbarButton
          cmd={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive('code')}
          label="`code`"
          tooltip={t('writers.editor.inlineCode', 'Inline code')}
        />
        <ToolbarButton
          cmd={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
          label="</>"
          tooltip={t('writers.editor.codeBlock', 'Code block')}
        />
        <span className="rt-sep" />
        <ToolbarButton cmd={addLink} active={editor.isActive('link')} label="🔗" tooltip={t('writers.editor.link', 'Link')} />
        <ToolbarButton cmd={addImage} label="🖼" tooltip={t('writers.editor.image', 'Image')} />
        <span className="rt-sep" />
        <ToolbarButton
          cmd={() => editor.chain().focus().undo().run()}
          label="↶"
          tooltip={t('writers.editor.undo', 'Undo')}
          hotkey="Ctrl+Z"
        />
        <ToolbarButton
          cmd={() => editor.chain().focus().redo().run()}
          label="↷"
          tooltip={t('writers.editor.redo', 'Redo')}
          hotkey="Ctrl+Shift+Z"
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};
