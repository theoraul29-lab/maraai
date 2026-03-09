import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Film, User, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
export function SearchBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  const { data, isLoading } = useQuery({
    queryKey: ["/api/search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(debouncedQuery)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
  });
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);
  const handleClickOutside = useCallback((e) => {
    if (containerRef.current && !containerRef.current.contains(e.target)) {
      setIsOpen(false);
      setQuery("");
    }
  }, []);
  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);
  const closeSearch = () => {
    setIsOpen(false);
    setQuery("");
  };
  const hasResults =
    data &&
    (data.videos?.length > 0 ||
      data.users?.length > 0 ||
      data.pages?.length > 0);
  const showDropdown = isOpen && debouncedQuery.length >= 2;
  return (
    <div
      ref={containerRef}
      className="relative"
      data-testid="search-bar-container"
    >
      {!isOpen ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(true)}
          data-testid="button-search-open"
        >
          <Search className="w-4 h-4" />
        </Button>
      ) : (
        <div
          className="flex items-center gap-1 bg-muted rounded-md px-2"
          data-testid="search-input-wrapper"
        >
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="bg-transparent border-none outline-none text-sm py-1.5 w-32 sm:w-48 text-foreground placeholder:text-muted-foreground"
            data-testid="input-search"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={closeSearch}
            className="shrink-0"
            data-testid="button-search-close"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {showDropdown && (
        <div
          className="absolute top-full right-0 mt-2 w-72 sm:w-80 bg-popover border rounded-md shadow-lg z-50 max-h-80 overflow-y-auto"
          data-testid="search-results-dropdown"
        >
          {isLoading && (
            <div
              className="p-3 text-sm text-muted-foreground text-center"
              data-testid="search-loading"
            >
              Searching...
            </div>
          )}

          {!isLoading && !hasResults && debouncedQuery.length >= 2 && (
            <div
              className="p-3 text-sm text-muted-foreground text-center"
              data-testid="search-no-results"
            >
              No results found
            </div>
          )}

          {!isLoading && hasResults && (
            <>
              {data.videos?.length > 0 && (
                <div data-testid="search-section-videos">
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5" />
                    Videos
                  </div>
                  {data.videos.map((video) => (
                    <Link
                      key={video.id}
                      href={`/video/${video.id}`}
                      onClick={closeSearch}
                    >
                      <div
                        className="px-3 py-2 text-sm hover-elevate cursor-pointer flex items-center gap-2"
                        data-testid={`search-result-video-${video.id}`}
                      >
                        <Film className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{video.title}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {data.users?.length > 0 && (
                <div data-testid="search-section-users">
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Users
                  </div>
                  {data.users.map((u) => (
                    <Link
                      key={u.id}
                      href={`/profile/${u.id}`}
                      onClick={closeSearch}
                    >
                      <div
                        className="px-3 py-2 text-sm hover-elevate cursor-pointer flex items-center gap-2"
                        data-testid={`search-result-user-${u.id}`}
                      >
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="truncate">
                          {u.firstName || u.email || "User"}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {data.pages?.length > 0 && (
                <div data-testid="search-section-pages">
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    Writer Pages
                  </div>
                  {data.pages.map((page) => (
                    <Link
                      key={page.id}
                      href={`/writers/${page.slug || page.id}`}
                      onClick={closeSearch}
                    >
                      <div
                        className="px-3 py-2 text-sm hover-elevate cursor-pointer flex items-center gap-2"
                        data-testid={`search-result-page-${page.id}`}
                      >
                        <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{page.title}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
