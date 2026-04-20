import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

type Kind = 'people' | 'reels' | 'articles' | 'lessons';
interface SearchResult {
  kind: Kind;
  id: string;
  title: string;
  snippet: string;
  href: string;
  thumbnail?: string | null;
  score: number;
}
interface SearchResponse {
  query: string;
  results: SearchResult[];
  counts: Record<Kind, number>;
}

const KIND_LABEL_KEY: Record<Kind, string> = {
  people: 'search.kind.people',
  reels: 'search.kind.reels',
  articles: 'search.kind.articles',
  lessons: 'search.kind.lessons',
};

const KIND_ICON: Record<Kind, string> = {
  people: '👤',
  reels: '🎬',
  articles: '📖',
  lessons: '📈',
};

export const GlobalSearch: React.FC = () => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const navigate = useNavigate();
  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Esc.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Debounced fetch. Cancel in-flight requests so a fast typist doesn't see
  // older results overwrite newer ones.
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}&limit=8`, {
          credentials: 'include',
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`http_${res.status}`);
        const json: SearchResponse = await res.json();
        setResults(json.results);
        setActive(-1);
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = active >= 0 ? results[active] : results[0];
      if (pick) {
        navigate(pick.href);
        setOpen(false);
        setQ('');
      }
    }
  }

  return (
    <div className="global-search" ref={rootRef}>
      <input
        type="search"
        className="global-search-input"
        placeholder={t('search.placeholder', 'Search people, reels, articles…') as string}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => q.trim().length >= 2 && setOpen(true)}
        onKeyDown={onKeyDown}
        aria-label={t('search.placeholder', 'Search') as string}
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {open && q.trim().length >= 2 && (
        <div className="global-search-dropdown" role="listbox">
          {loading && <div className="global-search-status">{t('search.loading', 'Searching…')}</div>}
          {!loading && results.length === 0 && (
            <div className="global-search-status">{t('search.empty', 'No results')}</div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.id}`}
              type="button"
              className={`global-search-item ${i === active ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                navigate(r.href);
                setOpen(false);
                setQ('');
              }}
              role="option"
              aria-selected={i === active}
            >
              <span className="global-search-icon" aria-hidden>{KIND_ICON[r.kind]}</span>
              <span className="global-search-body">
                <span className="global-search-title">{r.title}</span>
                {r.snippet && <span className="global-search-snippet">{r.snippet}</span>}
              </span>
              <span className="global-search-kind">{t(KIND_LABEL_KEY[r.kind], r.kind)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
