import { useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  PenTool,
  BookOpen,
  Plus,
  Eye,
  Heart,
  Loader2,
  Sparkles,
  Send,
  Edit3,
  Trash2,
  Globe,
  FileText,
  Clock,
  ChevronLeft,
  ImagePlus,
  X,
  Crown,
  Lock,
} from "lucide-react";
const CATEGORIES = [
  { value: "story", label: "Story", icon: BookOpen },
  { value: "poem", label: "Poem", icon: PenTool },
  { value: "book", label: "Book Chapter", icon: FileText },
  { value: "article", label: "Article", icon: FileText },
  { value: "journal", label: "Journal", icon: Clock },
];
function WriterEditor({ onSaved, editPage }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [penName, setPenName] = useState(editPage?.penName || "");
  const [title, setTitle] = useState(editPage?.title || "");
  const [content, setContent] = useState(editPage?.content || "");
  const [category, setCategory] = useState(editPage?.category || "story");
  const [coverImage, setCoverImage] = useState(editPage?.coverImage || null);
  const [aiTip, setAiTip] = useState(null);
  const [tipLoading, setTipLoading] = useState(false);
  const fileInputRef = useRef(null);
  const handleImageUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        toast({ title: "Image must be under 2MB", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCoverImage(ev.target?.result);
      };
      reader.readAsDataURL(file);
    },
    [toast],
  );
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/writers/create", {
        penName,
        title,
        content,
        category,
        coverImage,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/writers/my-pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/writers/published"] });
      toast({ title: "Page created successfully!" });
      onSaved();
    },
    onError: () =>
      toast({ title: "Failed to create page", variant: "destructive" }),
  });
  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "PATCH",
        `/api/writers/page/${editPage.id}`,
        { penName, title, content, category, coverImage },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/writers/my-pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/writers/published"] });
      toast({ title: "Page updated!" });
      onSaved();
    },
    onError: () =>
      toast({ title: "Failed to update page", variant: "destructive" }),
  });
  const getAiTip = useCallback(async () => {
    if (!content.trim()) return;
    setTipLoading(true);
    setAiTip(null);
    try {
      const res = await apiRequest("POST", "/api/writers/ai-tip", {
        content,
        category,
      });
      const data = await res.json();
      setAiTip(data.tip);
    } catch {
      toast({ title: "Could not get AI tip", variant: "destructive" });
    } finally {
      setTipLoading(false);
    }
  }, [content, category, toast]);
  const isEditing = !!editPage;
  const canSubmit = penName.trim() && title.trim() && content.trim();
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Edit3 className="w-6 h-6 text-cyan-400" />
        {isEditing ? "Edit Your Page" : "Create Your Writer Page"}
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Pen Name</label>
          <input
            type="text"
            value={penName}
            onChange={(e) => setPenName(e.target.value)}
            placeholder="Your writer name..."
            className="w-full px-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            data-testid="input-writer-pen-name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Category</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition ${category === c.value ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-400" : "bg-card border border-border/50"}`}
                data-testid={`button-category-${c.value}`}
              >
                <c.icon className="w-3.5 h-3.5" />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Page title / Book title..."
            className="w-full px-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            data-testid="input-writer-title"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your story, poem, chapter, or article here..."
            rows={12}
            className="w-full px-4 py-3 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-y min-h-[200px]"
            data-testid="input-writer-content"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {content.length.toLocaleString()} characters
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Cover Image (optional)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          {coverImage ? (
            <div className="relative rounded-xl overflow-hidden border border-border/50">
              <img
                src={coverImage}
                alt="Cover"
                className="w-full h-48 object-cover"
              />
              <button
                onClick={() => {
                  setCoverImage(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg hover:bg-black/80 transition"
                data-testid="button-remove-cover-image"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-6 border-2 border-dashed border-border/50 rounded-xl flex flex-col items-center gap-2 hover:border-cyan-500/30 transition text-muted-foreground hover:text-cyan-400"
              data-testid="button-upload-cover-image"
            >
              <ImagePlus className="w-8 h-8" />
              <span className="text-sm">
                Click to upload a cover image (max 2MB)
              </span>
            </button>
          )}
        </div>

        {aiTip && (
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4">
            <p className="text-sm font-medium flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Mara AI Writing Tip
            </p>
            <p className="text-sm text-muted-foreground">{aiTip}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={getAiTip}
            disabled={!content.trim() || tipLoading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-card border border-cyan-500/30 rounded-xl text-sm text-cyan-400 hover:bg-cyan-500/10 transition disabled:opacity-50"
            data-testid="button-get-ai-tip"
          >
            {tipLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Get Mara AI Tip
          </button>
          <button
            onClick={() =>
              isEditing ? updateMutation.mutate() : createMutation.mutate()
            }
            disabled={
              !canSubmit || createMutation.isPending || updateMutation.isPending
            }
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-500 text-black rounded-xl text-sm font-medium hover:bg-cyan-400 transition disabled:opacity-50"
            data-testid="button-save-writer-page"
          >
            {createMutation.isPending || updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {isEditing ? "Update Page" : "Save Page"}
          </button>
        </div>
      </div>
    </div>
  );
}
function PageCard({ page, onRead, onEdit, onDelete, isOwner }) {
  const queryClient = useQueryClient();
  const likeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/writers/page/${page.id}/like`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/writers/published"] });
      queryClient.invalidateQueries({ queryKey: ["/api/writers/my-pages"] });
    },
  });
  const catInfo =
    CATEGORIES.find((c) => c.value === page.category) || CATEGORIES[0];
  return (
    <div
      className="bg-card border border-border/50 rounded-xl p-5 hover:border-cyan-500/30 transition cursor-pointer group"
      onClick={onRead}
      data-testid={`card-writer-page-${page.id}`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center gap-1">
          <catInfo.icon className="w-3 h-3" />
          {catInfo.label}
        </span>
        {page.published && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 flex items-center gap-1">
            <Globe className="w-3 h-3" />
            Published
          </span>
        )}
      </div>

      {page.coverImage && (
        <div className="rounded-lg overflow-hidden mb-3 -mx-1">
          <img
            src={page.coverImage}
            alt={page.title}
            className="w-full h-32 object-cover"
          />
        </div>
      )}

      <h3 className="font-semibold text-lg mb-1 group-hover:text-cyan-400 transition">
        {page.title}
      </h3>
      <p className="text-sm text-muted-foreground mb-3">by {page.penName}</p>
      <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
        {page.content.substring(0, 200)}...
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <button
            onClick={(e) => {
              e.stopPropagation();
              likeMutation.mutate();
            }}
            className="flex items-center gap-1 hover:text-cyan-400 transition"
            data-testid={`button-like-page-${page.id}`}
          >
            <Heart className="w-3.5 h-3.5" /> {page.likes}
          </button>
          <span className="flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" /> {page.views}
          </span>
        </div>
        {isOwner && (
          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 rounded-lg hover:bg-muted transition"
                data-testid={`button-edit-page-${page.id}`}
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition"
                data-testid={`button-delete-page-${page.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
function PageReader({ pageId, onBack }) {
  const { data: page, isLoading } = useQuery({
    queryKey: ["/api/writers/page", pageId],
    queryFn: async () => {
      const res = await fetch(`/api/writers/page/${pageId}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
  if (isLoading || !page) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }
  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition"
        data-testid="button-back-from-reader"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <article className="bg-card border border-border/50 rounded-xl overflow-hidden">
        {page.coverImage ? (
          <img
            src={page.coverImage}
            alt={page.title}
            className="w-full h-64 object-cover"
          />
        ) : null}
        <div className="p-6 sm:p-8">
          <div className="text-center mb-8">
            <span className="text-xs px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 inline-block mb-4">
              {CATEGORIES.find((c) => c.value === page.category)?.label ||
                "Story"}
            </span>
            <h1
              className="text-3xl font-bold mb-2"
              data-testid="text-reader-title"
            >
              {page.title}
            </h1>
            <p className="text-muted-foreground">by {page.penName}</p>
            <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" /> {page.views} views
              </span>
              <span className="flex items-center gap-1">
                <Heart className="w-3.5 h-3.5" /> {page.likes} likes
              </span>
              <span>{new Date(page.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="prose prose-invert max-w-none">
            {page.content.split("\n").map((paragraph, i) =>
              paragraph.trim() ? (
                <p key={i} className="text-sm leading-relaxed mb-4">
                  {paragraph}
                </p>
              ) : (
                <br key={i} />
              ),
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
export default function WritersHub() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState("hub");
  const [editPage, setEditPage] = useState(null);
  const [readPageId, setReadPageId] = useState(null);
  const { data: myPages = [], isLoading: myLoading } = useQuery({
    queryKey: ["/api/writers/my-pages"],
    enabled: !!user,
  });
  const { data: publishedPages = [], isLoading: pubLoading } = useQuery({
    queryKey: ["/api/writers/published"],
  });
  const { data: premiumData } = useQuery({
    queryKey: ["/api/premium/status"],
    enabled: !!user,
  });
  const isPremium = premiumData?.isPremium ?? false;
  const publishMutation = useMutation({
    mutationFn: async ({ id, published }) => {
      const res = await apiRequest("PATCH", `/api/writers/page/${id}`, {
        published,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/writers/my-pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/writers/published"] });
      toast({ title: "Page status updated!" });
    },
    onError: (err) => {
      toast({
        title:
          err?.message || "Premium subscription required to publish online",
        variant: "destructive",
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await apiRequest("DELETE", `/api/writers/page/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/writers/my-pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/writers/published"] });
      toast({ title: "Page deleted" });
    },
  });
  if (view === "read" && readPageId) {
    return (
      <div className="min-h-screen bg-red">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
        <header className="sticky top-0 z-30 bg-red/80 backdrop-blur-xl border-b border-border/50">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => {
                setView("browse");
                setReadPageId(null);
              }}
              className="p-2 rounded-lg hover:bg-muted transition"
              data-testid="link-back-from-reader"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <PenTool className="w-5 h-5 text-cyan-400" />
            <span className="font-semibold">Reading</span>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6">
          <PageReader
            pageId={readPageId}
            onBack={() => {
              setView("browse");
              setReadPageId(null);
            }}
          />
        </main>
      </div>
    );
  }
  if (view === "create") {
    return (
      <div className="min-h-screen bg-red">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
        <header className="sticky top-0 z-30 bg-red/80 backdrop-blur-xl border-b border-border/50">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => {
                setView("hub");
                setEditPage(null);
              }}
              className="p-2 rounded-lg hover:bg-muted transition"
              data-testid="link-back-from-editor"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <PenTool className="w-5 h-5 text-cyan-400" />
            <span className="font-semibold">
              {editPage ? "Edit Page" : "Create Page"}
            </span>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6">
          <WriterEditor
            editPage={editPage}
            onSaved={() => {
              setView("my-pages");
              setEditPage(null);
            }}
          />
        </main>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button
                className="p-2 rounded-lg hover:bg-muted transition"
                data-testid="link-back-home"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </Link>
            <div className="flex items-center gap-2">
              <PenTool className="w-6 h-6 text-cyan-400" />
              <h1 className="text-xl font-bold">Mara AI Writers</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {view === "hub" && (
          <>
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto bg-cyan-500/20 rounded-2xl flex items-center justify-center mb-4">
                <PenTool className="w-10 h-10 text-cyan-400" />
              </div>
              <h2
                className="text-3xl font-bold mb-2"
                data-testid="text-writers-hub-title"
              >
                Mara AI Writers Hub
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Create your personal writer page, publish stories, poems, or
                books online with Mara AI writing support.
              </p>
              {!isPremium && (
                <Link href="/premium">
                  <div
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-sm text-yellow-400 hover:bg-yellow-500/20 transition cursor-pointer"
                    data-testid="link-writers-premium-upsell"
                  >
                    <Crown className="w-4 h-4" />
                    Get Premium to publish your pages online
                  </div>
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <button
                onClick={() => setView("create")}
                className="bg-card border border-border/50 rounded-xl p-6 hover:border-cyan-500/30 transition text-left group"
                data-testid="button-create-page"
              >
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center mb-3">
                  <Plus className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="font-semibold mb-1 group-hover:text-cyan-400 transition">
                  Create My Page
                </h3>
                <p className="text-sm text-muted-foreground">
                  Start writing a story, poem, or book chapter
                </p>
              </button>

              <button
                onClick={() => setView("my-pages")}
                className="bg-card border border-border/50 rounded-xl p-6 hover:border-cyan-500/30 transition text-left group"
                data-testid="button-my-pages"
              >
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-3">
                  <FileText className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="font-semibold mb-1 group-hover:text-purple-400 transition">
                  My Pages
                </h3>
                <p className="text-sm text-muted-foreground">
                  {myPages.length} page{myPages.length !== 1 ? "s" : ""} created
                </p>
              </button>

              <button
                onClick={() => setView("browse")}
                className="bg-card border border-border/50 rounded-xl p-6 hover:border-cyan-500/30 transition text-left group"
                data-testid="button-browse-pages"
              >
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mb-3">
                  <Globe className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="font-semibold mb-1 group-hover:text-green-400 transition">
                  Browse Published
                </h3>
                <p className="text-sm text-muted-foreground">
                  {publishedPages.length} published page
                  {publishedPages.length !== 1 ? "s" : ""}
                </p>
              </button>
            </div>

            {publishedPages.length > 0 && (
              <div>
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-cyan-400" />
                  Recent Publications
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {publishedPages.slice(0, 4).map((page) => (
                    <PageCard
                      key={page.id}
                      page={page}
                      onRead={() => {
                        setReadPageId(page.id);
                        setView("read");
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {view === "my-pages" && (
          <>
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setView("hub")}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition"
                data-testid="button-back-to-hub"
              >
                <ChevronLeft className="w-4 h-4" /> Back to Hub
              </button>
              <button
                onClick={() => setView("create")}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-black rounded-xl text-sm font-medium hover:bg-cyan-400 transition"
                data-testid="button-new-page"
              >
                <Plus className="w-4 h-4" /> New Page
              </button>
            </div>

            <h2 className="text-2xl font-bold mb-4">My Pages</h2>

            {myLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              </div>
            ) : myPages.length === 0 ? (
              <div className="text-center py-12">
                <PenTool className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">
                  You haven't created any pages yet.
                </p>
                <button
                  onClick={() => setView("create")}
                  className="px-4 py-2 bg-cyan-500 text-black rounded-xl text-sm font-medium hover:bg-cyan-400 transition"
                  data-testid="button-create-first-page"
                >
                  Create Your First Page
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {myPages.map((page) => (
                  <div
                    key={page.id}
                    className="bg-card border border-border/50 rounded-xl p-5"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => {
                          setReadPageId(page.id);
                          setView("read");
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <h3
                            className="font-semibold"
                            data-testid={`text-my-page-title-${page.id}`}
                          >
                            {page.title}
                          </h3>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">
                            {
                              CATEGORIES.find((c) => c.value === page.category)
                                ?.label
                            }
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          by {page.penName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {!page.published && !isPremium ? (
                          <Link href="/premium">
                            <span
                              className="text-xs px-3 py-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 flex items-center gap-1 cursor-pointer hover:bg-yellow-500/20 transition"
                              data-testid={`button-publish-locked-${page.id}`}
                            >
                              <Lock className="w-3 h-3" /> Premium
                            </span>
                          </Link>
                        ) : (
                          <button
                            onClick={() =>
                              publishMutation.mutate({
                                id: page.id,
                                published: !page.published,
                              })
                            }
                            className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                              page.published
                                ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                                : "bg-card border-border/50 hover:border-cyan-500/30"
                            }`}
                            data-testid={`button-publish-toggle-${page.id}`}
                          >
                            {page.published ? "Published" : "Publish"}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditPage(page);
                            setView("create");
                          }}
                          className="p-2 rounded-lg hover:bg-muted transition"
                          data-testid={`button-edit-my-page-${page.id}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Delete this page?"))
                              deleteMutation.mutate(page.id);
                          }}
                          className="p-2 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition"
                          data-testid={`button-delete-my-page-${page.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {page.content.substring(0, 150)}...
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" /> {page.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {page.views}
                      </span>
                      <span>
                        Updated {new Date(page.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === "browse" && (
          <>
            <button
              onClick={() => setView("hub")}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition"
              data-testid="button-back-to-hub-browse"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Hub
            </button>

            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Globe className="w-6 h-6 text-green-400" />
              Published Pages
            </h2>

            {pubLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              </div>
            ) : publishedPages.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  No published pages yet. Be the first to publish!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {publishedPages.map((page) => (
                  <PageCard
                    key={page.id}
                    page={page}
                    onRead={() => {
                      setReadPageId(page.id);
                      setView("read");
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
