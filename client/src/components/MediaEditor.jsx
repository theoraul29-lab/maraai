import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Image,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Download,
  SunDim,
  Contrast,
  Droplets,
  Sparkles,
  Crown,
  Lock,
  ZoomIn,
  ZoomOut,
  Undo2,
  Music,
  Play,
  Pause,
  Square,
} from "lucide-react";
const FREE_FILTERS = [
  { name: "None", css: "" },
  { name: "Grayscale", css: "grayscale(100%)" },
  { name: "Sepia", css: "sepia(80%)" },
  { name: "Bright", css: "brightness(130%)" },
  { name: "High Contrast", css: "contrast(140%)" },
];
const PREMIUM_FILTERS = [
  { name: "Vintage", css: "sepia(40%) contrast(120%) brightness(90%)" },
  { name: "Cool Tone", css: "hue-rotate(180deg) saturate(120%)" },
  {
    name: "Warm Glow",
    css: "hue-rotate(15deg) saturate(130%) brightness(110%)",
  },
  { name: "Dramatic", css: "contrast(160%) brightness(80%) saturate(150%)" },
  { name: "Noir", css: "grayscale(100%) contrast(150%) brightness(80%)" },
  { name: "Dreamy", css: "blur(1px) brightness(120%) saturate(80%)" },
  { name: "Pop Art", css: "saturate(250%) contrast(130%)" },
  { name: "Fade", css: "brightness(110%) contrast(80%) saturate(70%)" },
];
const FREE_MUSIC = [
  {
    name: "Ambient Calm",
    url: "https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg",
  },
  {
    name: "Rain Drops",
    url: "https://actions.google.com/sounds/v1/weather/rain_on_roof.ogg",
  },
  {
    name: "Ocean Waves",
    url: "https://actions.google.com/sounds/v1/water/waves_crashing_on_rock_beach.ogg",
  },
  {
    name: "Birds Morning",
    url: "https://actions.google.com/sounds/v1/ambiences/forest_birds.ogg",
  },
  {
    name: "Fireplace",
    url: "https://actions.google.com/sounds/v1/ambiences/fireplace.ogg",
  },
];
const PREMIUM_MUSIC = [
  {
    name: "Epic Cinematic",
    url: "https://actions.google.com/sounds/v1/ambiences/spaceship_atmosphere.ogg",
  },
  {
    name: "Lo-Fi Beat",
    url: "https://actions.google.com/sounds/v1/ambiences/night_crickets.ogg",
  },
  {
    name: "Wind Ambient",
    url: "https://actions.google.com/sounds/v1/weather/wind_strong.ogg",
  },
  {
    name: "Thunder Storm",
    url: "https://actions.google.com/sounds/v1/weather/thunder_crack.ogg",
  },
  {
    name: "City Night",
    url: "https://actions.google.com/sounds/v1/ambiences/city_traffic.ogg",
  },
];
export function MediaEditor({ onClose }) {
  const [activeTab, setActiveTab] = useState("photo");
  const [imageSrc, setImageSrc] = useState(null);
  const [filter, setFilter] = useState("");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [textOverlay, setTextOverlay] = useState("");
  const [textColor, setTextColor] = useState("#ffffff");
  const [textSize, setTextSize] = useState(32);
  const [zoom, setZoom] = useState(100);
  const [playingTrack, setPlayingTrack] = useState(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const { data: postStatus } = useQuery({
    queryKey: ["/api/creator/post-status"],
  });
  const isPremium = postStatus?.isPremium ?? false;
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImageSrc(ev.target?.result);
      resetEdits();
    };
    reader.readAsDataURL(file);
  };
  const resetEdits = () => {
    setFilter("");
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setTextOverlay("");
    setZoom(100);
  };
  const getFilterString = () => {
    let f = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    if (filter) f += ` ${filter}`;
    return f;
  };
  const getTransform = () => {
    let t = `scale(${zoom / 100}) rotate(${rotation}deg)`;
    if (flipH) t += " scaleX(-1)";
    if (flipV) t += " scaleY(-1)";
    return t;
  };
  const handleExport = useCallback(() => {
    if (!imageSrc) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const size = isPremium
        ? Math.max(img.width, img.height)
        : Math.min(Math.max(img.width, img.height), 1080);
      const ratio = size / Math.max(img.width, img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      ctx.save();
      ctx.filter = getFilterString();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(
        img,
        -canvas.width / 2,
        -canvas.height / 2,
        canvas.width,
        canvas.height,
      );
      ctx.restore();
      if (textOverlay) {
        ctx.fillStyle = textColor;
        ctx.font = `bold ${textSize * ratio}px sans-serif`;
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0,0,0,0.7)";
        ctx.shadowBlur = 6;
        ctx.fillText(textOverlay, canvas.width / 2, canvas.height - 40 * ratio);
      }
      const link = document.createElement("a");
      link.download = `mara-edit-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = imageSrc;
  }, [
    imageSrc,
    brightness,
    contrast,
    saturation,
    filter,
    rotation,
    flipH,
    flipV,
    textOverlay,
    textColor,
    textSize,
    isPremium,
  ]);
  const toggleMusic = (url, name) => {
    if (!url) return;
    if (playingTrack === name) {
      audioRef.current?.pause();
      setPlayingTrack(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audio.loop = true;
      audio.play().catch(() => {});
      audioRef.current = audio;
      setPlayingTrack(name);
    }
  };
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);
  return (
    <div className="min-h-0 flex flex-col">
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
        data-testid="input-upload-image"
      />

      {/* Tab Switcher */}
      <div className="flex border-b border-border/50 mb-4">
        <button
          onClick={() => setActiveTab("photo")}
          className={`flex-1 py-2.5 text-sm font-medium transition flex items-center justify-center gap-2 ${activeTab === "photo" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="tab-photo-editor"
        >
          <Image className="w-4 h-4" />
          Photo Editor
        </button>
        <button
          onClick={() => setActiveTab("music")}
          className={`flex-1 py-2.5 text-sm font-medium transition flex items-center justify-center gap-2 ${activeTab === "music" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="tab-music-library"
        >
          <Music className="w-4 h-4" />
          Music Library
        </button>
      </div>

      {activeTab === "photo" && (
        <div className="space-y-4">
          {/* Image Preview */}
          <div
            className="aspect-square bg-muted/30 rounded-xl border border-border/50 flex items-center justify-center overflow-hidden cursor-pointer relative"
            onClick={() => !imageSrc && fileInputRef.current?.click()}
            data-testid="area-image-preview"
          >
            {imageSrc ? (
              <img
                src={imageSrc}
                alt="Editing"
                className="max-w-full max-h-full object-contain transition-all duration-200"
                style={{ filter: getFilterString(), transform: getTransform() }}
              />
            ) : (
              <div className="text-center p-6">
                <Image className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Click to upload a photo
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  JPG, PNG, WebP
                </p>
              </div>
            )}
            {imageSrc && textOverlay && (
              <div
                className="absolute bottom-4 left-0 right-0 text-center pointer-events-none"
                style={{
                  color: textColor,
                  fontSize: textSize,
                  fontWeight: "bold",
                  textShadow: "2px 2px 4px rgba(0,0,0,0.7)",
                }}
              >
                {textOverlay}
              </div>
            )}
          </div>

          {imageSrc && (
            <>
              {/* Quick Actions */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-muted rounded-lg text-xs hover:bg-muted/80 transition"
                  data-testid="button-change-image"
                >
                  <Image className="w-3.5 h-3.5 inline mr-1" />
                  Change
                </button>
                <button
                  onClick={() => setRotation((r) => r - 90)}
                  className="px-3 py-1.5 bg-muted rounded-lg text-xs hover:bg-muted/80 transition"
                  data-testid="button-rotate-left"
                >
                  <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
                  Left
                </button>
                <button
                  onClick={() => setRotation((r) => r + 90)}
                  className="px-3 py-1.5 bg-muted rounded-lg text-xs hover:bg-muted/80 transition"
                  data-testid="button-rotate-right"
                >
                  <RotateCw className="w-3.5 h-3.5 inline mr-1" />
                  Right
                </button>
                <button
                  onClick={() => setFlipH((f) => !f)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition ${flipH ? "bg-primary/20 text-primary" : "bg-muted hover:bg-muted/80"}`}
                  data-testid="button-flip-h"
                >
                  <FlipHorizontal className="w-3.5 h-3.5 inline mr-1" />
                  Flip H
                </button>
                <button
                  onClick={() => setFlipV((f) => !f)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition ${flipV ? "bg-primary/20 text-primary" : "bg-muted hover:bg-muted/80"}`}
                  data-testid="button-flip-v"
                >
                  <FlipVertical className="w-3.5 h-3.5 inline mr-1" />
                  Flip V
                </button>
                <button
                  onClick={() => setZoom((z) => Math.min(z + 10, 200))}
                  className="px-3 py-1.5 bg-muted rounded-lg text-xs hover:bg-muted/80 transition"
                  data-testid="button-zoom-in"
                >
                  <ZoomIn className="w-3.5 h-3.5 inline mr-1" />+
                </button>
                <button
                  onClick={() => setZoom((z) => Math.max(z - 10, 50))}
                  className="px-3 py-1.5 bg-muted rounded-lg text-xs hover:bg-muted/80 transition"
                  data-testid="button-zoom-out"
                >
                  <ZoomOut className="w-3.5 h-3.5 inline mr-1" />-
                </button>
                <button
                  onClick={resetEdits}
                  className="px-3 py-1.5 bg-muted rounded-lg text-xs hover:bg-muted/80 transition"
                  data-testid="button-reset-edits"
                >
                  <Undo2 className="w-3.5 h-3.5 inline mr-1" />
                  Reset
                </button>
              </div>

              {/* Adjustments */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Adjustments
                </h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs">
                    <SunDim className="w-3.5 h-3.5" />
                    Brightness
                    <input
                      type="range"
                      min="30"
                      max="200"
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="flex-1 accent-primary h-1"
                      data-testid="slider-brightness"
                    />
                    <span className="w-8 text-right text-muted-foreground">
                      {brightness}%
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Contrast className="w-3.5 h-3.5" />
                    Contrast
                    <input
                      type="range"
                      min="30"
                      max="200"
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="flex-1 accent-primary h-1"
                      data-testid="slider-contrast"
                    />
                    <span className="w-8 text-right text-muted-foreground">
                      {contrast}%
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Droplets className="w-3.5 h-3.5" />
                    Saturation
                    <input
                      type="range"
                      min="0"
                      max="300"
                      value={saturation}
                      onChange={(e) => setSaturation(Number(e.target.value))}
                      className="flex-1 accent-primary h-1"
                      data-testid="slider-saturation"
                    />
                    <span className="w-8 text-right text-muted-foreground">
                      {saturation}%
                    </span>
                  </label>
                </div>
              </div>

              {/* Filters */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Filters
                </h4>
                <div className="flex gap-2 flex-wrap">
                  {FREE_FILTERS.map((f) => (
                    <button
                      key={f.name}
                      onClick={() => setFilter(f.css)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition ${filter === f.css ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
                      data-testid={`button-filter-${f.name.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap mt-2">
                  {PREMIUM_FILTERS.map((f) => (
                    <button
                      key={f.name}
                      onClick={() => isPremium && setFilter(f.css)}
                      disabled={!isPremium}
                      className={`px-3 py-1.5 rounded-lg text-xs transition relative ${
                        !isPremium
                          ? "bg-muted/50 text-muted-foreground/50 cursor-not-allowed"
                          : filter === f.css
                            ? "bg-yellow-500 text-black"
                            : "bg-muted hover:bg-muted/80"
                      }`}
                      data-testid={`button-filter-${f.name.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      {!isPremium && <Lock className="w-3 h-3 inline mr-1" />}
                      {f.name}
                    </button>
                  ))}
                </div>
                {!isPremium && (
                  <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                    <Crown className="w-3 h-3 text-yellow-500" />
                    Advanced filters require Premium
                  </p>
                )}
              </div>

              {/* Text Overlay */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Text Overlay
                </h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={textOverlay}
                    onChange={(e) => setTextOverlay(e.target.value)}
                    placeholder="Add text to your photo"
                    className="flex-1 px-3 py-1.5 bg-red border border-border rounded-lg text-sm"
                    data-testid="input-text-overlay"
                  />
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="w-8 h-8 rounded border-0 cursor-pointer"
                    data-testid="input-text-color"
                  />
                  <select
                    value={textSize}
                    onChange={(e) => setTextSize(Number(e.target.value))}
                    className="px-2 py-1 bg-red border border-border rounded-lg text-xs"
                    data-testid="select-text-size"
                  >
                    <option value={16}>Small</option>
                    <option value={24}>Medium</option>
                    <option value={32}>Large</option>
                    <option value={48}>XL</option>
                  </select>
                </div>
              </div>

              {/* Export */}
              <button
                onClick={handleExport}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition flex items-center justify-center gap-2"
                data-testid="button-export-image"
              >
                <Download className="w-4 h-4" />
                Export {isPremium ? "(Full HD)" : "(Standard)"}
              </button>
            </>
          )}
        </div>
      )}

      {activeTab === "music" && (
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-green-400" />
              Free Sounds
            </h4>
            <div className="space-y-2">
              {FREE_MUSIC.map((track) => (
                <div
                  key={track.name}
                  className={`flex items-center justify-between p-3 rounded-lg border transition ${playingTrack === track.name ? "bg-primary/10 border-primary/30" : "bg-card border-border/50 hover:border-primary/20"}`}
                  data-testid={`track-${track.name.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <span className="text-sm">{track.name}</span>
                  <button
                    onClick={() => toggleMusic(track.url, track.name)}
                    className="p-2 rounded-full bg-muted hover:bg-muted/80 transition"
                    data-testid={`button-play-${track.name.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    {playingTrack === track.name ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Crown className="w-3.5 h-3.5 text-yellow-500" />
              Premium Sounds
            </h4>
            <div className="space-y-2">
              {PREMIUM_MUSIC.map((track) => (
                <div
                  key={track.name}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    isPremium
                      ? playingTrack === track.name
                        ? "bg-yellow-500/10 border-yellow-500/30"
                        : "bg-card border-border/50 hover:border-yellow-500/20"
                      : "bg-muted/30 border-border/30"
                  } transition`}
                  data-testid={`track-premium-${track.name.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <span
                    className={`text-sm ${!isPremium ? "text-muted-foreground/50" : ""}`}
                  >
                    {!isPremium && <Lock className="w-3 h-3 inline mr-1.5" />}
                    {track.name}
                  </span>
                  <button
                    onClick={() =>
                      isPremium && toggleMusic(track.url, track.name)
                    }
                    disabled={!isPremium}
                    className="p-2 rounded-full bg-muted hover:bg-muted/80 transition disabled:opacity-30"
                    data-testid={`button-play-premium-${track.name.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    {isPremium ? (
                      playingTrack === track.name ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )
                    ) : (
                      <Lock className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
            {!isPremium && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Crown className="w-3 h-3 text-yellow-500" />
                Premium sounds require a subscription
              </p>
            )}
          </div>

          {playingTrack && (
            <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/30 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Music className="w-4 h-4 text-primary animate-pulse" />
                </div>
                <span className="text-sm font-medium">{playingTrack}</span>
              </div>
              <button
                onClick={() => {
                  audioRef.current?.pause();
                  setPlayingTrack(null);
                }}
                className="p-2 rounded-full bg-muted hover:bg-red-500/20 transition"
                data-testid="button-stop-music"
              >
                <Square className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
