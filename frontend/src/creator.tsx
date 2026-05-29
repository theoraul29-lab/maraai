import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import {
  ChartBar, Sparkle, Upload, Article, TrendUp, CurrencyEur,
  PaintBrush, Folder, ChatCircle, UserCircle,
  FilmStrip, Eye, Heart, UsersThree, X as PhX,
  Lock, MusicNote, Image as PhImage, VideoCamera,
} from '@phosphor-icons/react';
import './styles/Creator.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

const LAUNCH_DATE = new Date('2026-07-01T00:00:00Z');
function getDaysUntilLaunch() {
  return Math.max(0, Math.ceil((LAUNCH_DATE.getTime() - Date.now()) / 86400000));
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Video {
  id: number; title: string; url: string; description: string;
  views: number; likes: number; createdAt: string; thumbnail?: string;
}
interface Analytics {
  totalReels: number; totalViews: number; totalLikes: number;
  followers: number; engagementRate: number; thisMonth: number;
}
interface Article {
  id: number; title: string; slug: string; type: string;
  views: number; likes: number; createdAt: string; status?: string;
  authorShareCents?: number;
}
interface Comment {
  id: number; content: string; createdAt: string;
  videoId: number; videoTitle: string;
  userName: string | null; userAvatar: string | null;
}
interface XPData { xp: number; level: number; streak: number; }
interface ProfileData {
  displayName: string; bio: string; location: string; website: string;
}

// ─── Audio helpers (Music Creator) ────────────────────────────────────────────

function playDrum(ctx: AudioContext, track: number, time: number, dest: AudioNode) {
  switch (track) {
    case 0: { // Kick
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(0.001, time + 0.12);
      gain.gain.setValueAtTime(1.0, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      osc.connect(gain); gain.connect(dest);
      osc.start(time); osc.stop(time + 0.15);
      break;
    }
    case 1: { // Snare
      const bufLen = Math.floor(ctx.sampleRate * 0.1);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const gain = ctx.createGain();
      const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 3000; flt.Q.value = 0.7;
      gain.gain.setValueAtTime(0.7, time); gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      src.connect(flt); flt.connect(gain); gain.connect(dest);
      src.start(time); src.stop(time + 0.1);
      const osc = ctx.createOscillator(); const og = ctx.createGain();
      osc.frequency.value = 200; og.gain.setValueAtTime(0.4, time); og.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.connect(og); og.connect(dest); osc.start(time); osc.stop(time + 0.05);
      break;
    }
    case 2: { // Hi-Hat
      const bufLen = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const gain = ctx.createGain();
      const flt = ctx.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 7000;
      gain.gain.setValueAtTime(0.35, time); gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      src.connect(flt); flt.connect(gain); gain.connect(dest);
      src.start(time); src.stop(time + 0.05);
      break;
    }
    case 3: { // Bass
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 80;
      gain.gain.setValueAtTime(0.8, time); gain.gain.setValueAtTime(0.8, time + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
      osc.connect(gain); gain.connect(dest); osc.start(time); osc.stop(time + 0.35);
      break;
    }
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'create' | 'upload' | 'articles' | 'analytics' | 'earnings' | 'studio' | 'content' | 'comments' | 'profile';
type StudioTab = 'video' | 'photo' | 'music';

interface Props { onClose: () => void; }

export const Creator: React.FC<Props> = ({ onClose }) => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [studioTab, setStudioTab] = useState<StudioTab>('music');

  // Data
  const [videos, setVideos] = useState<Video[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({ totalReels: 0, totalViews: 0, totalLikes: 0, followers: 0, engagementRate: 0, thisMonth: 0 });
  const [articles, setArticles] = useState<Article[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [creatorXP, setCreatorXP] = useState<XPData>({ xp: 0, level: 1, streak: 0 });
  const [profile, setProfile] = useState<ProfileData>({ displayName: '', bio: '', location: '', website: '' });
  const [postStatus, setPostStatus] = useState({ canPost: true, postsToday: 0, maxDaily: 5 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Upload tab state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const videoFileRef = useRef<HTMLInputElement>(null);

  // Create & Share tab state
  const [createType, setCreateType] = useState<'reel' | 'photo' | 'article'>('reel');
  const [createTitle, setCreateTitle] = useState('');
  const [createContent, setCreateContent] = useState('');
  const [createTags, setCreateTags] = useState('');
  const [createUrl, setCreateUrl] = useState('');
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [createFilePreview, setCreateFilePreview] = useState('');
  const [shareToReels, setShareToReels] = useState(true);
  const [shareToYou, setShareToYou] = useState(true);
  const [articleType, setArticleType] = useState<'public' | 'vip' | 'paid'>('public');
  const [creating, setCreating] = useState(false);
  const createFileRef = useRef<HTMLInputElement>(null);

  // Profile tab state
  const [profileSaving, setProfileSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // ─── Studio: Photo Editor ──────────────────────────────────────────────────
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoBrightness, setPhotoBrightness] = useState(100);
  const [photoContrast, setPhotoContrast] = useState(100);
  const [photoSaturation, setPhotoSaturation] = useState(100);
  const [photoSepia, setPhotoSepia] = useState(0);
  const [photoGrayscale, setPhotoGrayscale] = useState(0);
  const [photoText, setPhotoText] = useState('');
  const photoCanvasRef = useRef<HTMLCanvasElement>(null);
  const photoImgRef = useRef<HTMLImageElement | null>(null);

  // ─── Studio: Video Thumbnail Extractor ────────────────────────────────────
  const [thumbVideoUrl, setThumbVideoUrl] = useState('');
  const [thumbText, setThumbText] = useState('');
  const thumbVideoRef = useRef<HTMLVideoElement>(null);
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null);

  // ─── Studio: Music Creator ─────────────────────────────────────────────────
  const TRACK_NAMES = ['Kick', 'Snare', 'Hi-Hat', 'Bass'];
  const TRACK_COLORS = ['#ff6b00', '#ff4488', '#44ddff', '#88ff44'];
  const [bpm, setBpm] = useState(120);
  const [beatSteps, setBeatSteps] = useState<boolean[][]>(() =>
    Array(4).fill(null).map(() => Array(16).fill(false))
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [isRecording, setIsRecording] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const schedulerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const nextTimeRef = useRef(0);
  const nextStepRef = useRef(0);
  const bpmRef = useRef(bpm);
  const stepsRef = useRef(beatSteps);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { stepsRef.current = beatSteps; }, [beatSteps]);

  // ─── Data Fetching ─────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [analyticsRes, videosRes, statusRes, xpRes, profileRes] = await Promise.all([
        axios.get(`${API_URL}/api/creator/analytics`, { withCredentials: true }).catch(() => ({ data: null })),
        axios.get(`${API_URL}/api/creator/my-videos`, { withCredentials: true }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/creator/post-status`, { withCredentials: true }).catch(() => ({ data: { canPost: true, postsToday: 0, maxDaily: 5 } })),
        axios.get(`${API_URL}/api/creator/creator-xp`, { withCredentials: true }).catch(() => ({ data: { xp: 0, level: 1, streak: 0 } })),
        axios.get(`${API_URL}/api/profile/me`, { withCredentials: true }).catch(() => ({ data: null })),
      ]);
      if (analyticsRes.data) {
        setAnalytics({
          totalReels: analyticsRes.data.totalVideos || 0,
          totalViews: analyticsRes.data.totalViews || 0,
          totalLikes: analyticsRes.data.totalLikes || 0,
          followers: analyticsRes.data.followerCount || 0,
          engagementRate: analyticsRes.data.totalViews
            ? ((analyticsRes.data.totalLikes / analyticsRes.data.totalViews) * 100)
            : 0,
          thisMonth: 0,
        });
      }
      setVideos(Array.isArray(videosRes.data) ? videosRes.data : []);
      if (statusRes.data) setPostStatus(statusRes.data);
      if (xpRes.data) setCreatorXP(xpRes.data);
      if (profileRes.data?.user) {
        const u = profileRes.data.user;
        setProfile({
          displayName: u.displayName || u.firstName || '',
          bio: u.bio || '',
          location: u.location || '',
          website: u.website || '',
        });
      }
    } catch {
      setError('Failed to load creator data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchArticles = useCallback(async () => {
    const res = await axios.get(`${API_URL}/api/writers/mine`, { withCredentials: true }).catch(() => ({ data: [] }));
    setArticles(Array.isArray(res.data) ? res.data : []);
  }, []);

  const fetchComments = useCallback(async () => {
    const res = await axios.get(`${API_URL}/api/creator/my-comments`, { withCredentials: true }).catch(() => ({ data: { items: [] } }));
    setComments(Array.isArray(res.data?.items) ? res.data.items : []);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (activeTab === 'articles') fetchArticles();
    if (activeTab === 'comments') fetchComments();
  }, [activeTab, fetchArticles, fetchComments]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const formatNum = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3500);
  };

  const estimatedXP = () => {
    if (createType === 'reel') {
      if (shareToReels && shareToYou) return 60;
      if (shareToReels) return 50;
      if (shareToYou) return 30;
    }
    if (createType === 'photo') return shareToYou ? 30 : 0;
    if (createType === 'article') {
      const base = articleType === 'public' ? 40 : 80;
      return base + (shareToYou ? 30 : 0);
    }
    return 0;
  };

  // ─── Upload Reel ──────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadTitle.trim()) { setError('Title is required.'); return; }
    if (!videoFile && !uploadUrl.trim()) { setError('Attach a video file or paste a URL.'); return; }
    if (!postStatus.canPost) { setError(`Post limit reached (${postStatus.maxDaily}/day).`); return; }
    setUploading(true); setError('');
    try {
      await axios.post(`${API_URL}/api/creator/post-reel`, {
        title: uploadTitle, url: uploadUrl, description: uploadDesc,
        tags: uploadTags.split(',').map(t => t.trim()).filter(Boolean),
      }, { withCredentials: true });
      showSuccess('Reel published! +50 XP');
      setUploadTitle(''); setUploadDesc(''); setUploadUrl(''); setUploadTags('');
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      setVideoFile(null); setVideoPreviewUrl('');
      if (videoFileRef.current) videoFileRef.current.value = '';
      fetchAll();
      setActiveTab('dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to publish reel.');
    } finally { setUploading(false); }
  };

  // ─── Create & Share ────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createTitle.trim() && createType !== 'photo') { setError('Title is required.'); return; }
    if (createType === 'reel' && !createUrl.trim() && !createFile) { setError('Attach a video or paste a URL.'); return; }
    if (createType === 'photo' && !createFile) { setError('Select an image.'); return; }
    if (createType === 'article' && !createContent.trim()) { setError('Article content is required.'); return; }
    if (!shareToReels && !shareToYou) { setError('Choose at least one destination.'); return; }

    setCreating(true); setError('');
    let videoId: number | null = null;
    let xpTotal = 0;

    try {
      if (createType === 'reel' && shareToReels) {
        const res = await axios.post(`${API_URL}/api/creator/post-reel`, {
          title: createTitle, url: createUrl, description: createContent,
          tags: createTags.split(',').map(t => t.trim()).filter(Boolean),
        }, { withCredentials: true });
        videoId = res.data?.id ?? null;
        xpTotal += 50;
      }

      if (createType === 'article') {
        const res = await axios.post(`${API_URL}/api/writers/publish`, {
          title: createTitle, content: createContent,
          type: articleType, tags: createTags.split(',').map(t => t.trim()).filter(Boolean),
        }, { withCredentials: true });
        if (shareToYou) {
          await axios.post(`${API_URL}/api/creator/share-to-you`, {
            content: `📝 Articol nou: ${createTitle}`,
            sourceKind: 'writers',
            sourceId: res.data?.id ?? null,
          }, { withCredentials: true });
          xpTotal += 30;
        }
        xpTotal += articleType === 'public' ? 40 : 80;
      } else if (shareToYou) {
        const xpRes = await axios.post(`${API_URL}/api/creator/share-to-you`, {
          content: createType === 'reel'
            ? `🎬 Reel nou: ${createTitle}${createContent ? ' — ' + createContent : ''}`
            : `🖼️ ${createTitle || 'Post nou'}${createContent ? ': ' + createContent : ''}`,
          sourceKind: createType === 'reel' ? 'reel' : null,
          sourceId: videoId,
        }, { withCredentials: true });
        xpTotal += xpRes.data?.xpGained ?? 30;
      }

      showSuccess(`Publicat! +${xpTotal} XP câștigat`);
      setCreateTitle(''); setCreateContent(''); setCreateTags(''); setCreateUrl('');
      if (createFilePreview) URL.revokeObjectURL(createFilePreview);
      setCreateFile(null); setCreateFilePreview('');
      if (createFileRef.current) createFileRef.current.value = '';
      fetchAll();
      setActiveTab('dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to publish content.');
    } finally { setCreating(false); }
  };

  // ─── Delete Video ─────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/api/creator/videos/${id}`, { withCredentials: true });
      setVideos(v => v.filter(x => x.id !== id));
      setDeleteId(null);
    } catch { setError('Failed to delete video.'); }
  };

  // ─── Profile Save ─────────────────────────────────────────────────────────
  const handleProfileSave = async () => {
    setProfileSaving(true);
    try {
      await axios.patch(`${API_URL}/api/profile/me`, {
        displayName: profile.displayName,
        bio: profile.bio,
        location: profile.location,
        website: profile.website,
      }, { withCredentials: true });
      showSuccess('Profile saved!');
    } catch { setError('Failed to save profile.'); }
    finally { setProfileSaving(false); }
  };

  // ─── Studio: Photo Editor ─────────────────────────────────────────────────
  const applyPhotoFilters = useCallback(() => {
    if (!photoImgRef.current || !photoCanvasRef.current) return;
    const canvas = photoCanvasRef.current;
    const img = photoImgRef.current;
    const ctx = canvas.getContext('2d')!;
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    ctx.filter = `brightness(${photoBrightness}%) contrast(${photoContrast}%) saturate(${photoSaturation}%) sepia(${photoSepia}%) grayscale(${photoGrayscale}%)`;
    ctx.drawImage(img, 0, 0);
    if (photoText.trim()) {
      ctx.filter = 'none';
      ctx.font = `bold ${Math.max(24, canvas.width / 20)}px Inter, sans-serif`;
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      ctx.strokeText(photoText, canvas.width / 2, canvas.height - 40);
      ctx.fillText(photoText, canvas.width / 2, canvas.height - 40);
    }
  }, [photoBrightness, photoContrast, photoSaturation, photoSepia, photoGrayscale, photoText]);

  useEffect(() => {
    if (photoPreview) applyPhotoFilters();
  }, [photoPreview, applyPhotoFilters]);

  const downloadPhoto = () => {
    if (!photoCanvasRef.current) return;
    const a = document.createElement('a');
    a.href = photoCanvasRef.current.toDataURL('image/png');
    a.download = `mara-photo-${Date.now()}.png`;
    a.click();
  };

  // ─── Studio: Video Thumbnail ──────────────────────────────────────────────
  const captureThumb = () => {
    const video = thumbVideoRef.current;
    const canvas = thumbCanvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    if (thumbText.trim()) {
      ctx.font = `bold ${Math.max(24, canvas.width / 18)}px Inter, sans-serif`;
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      ctx.strokeText(thumbText, canvas.width / 2, canvas.height - 40);
      ctx.fillText(thumbText, canvas.width / 2, canvas.height - 40);
    }
  };

  const downloadThumb = () => {
    if (!thumbCanvasRef.current) return;
    const a = document.createElement('a');
    a.href = thumbCanvasRef.current.toDataURL('image/jpeg', 0.92);
    a.download = `thumbnail-${Date.now()}.jpg`;
    a.click();
  };

  // ─── Studio: Beat Sequencer ────────────────────────────────────────────────
  const initAudio = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
      masterGainRef.current = audioCtxRef.current.createGain();
      masterGainRef.current.gain.value = 0.85;
      masterGainRef.current.connect(audioCtxRef.current.destination);
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const scheduleTick = useCallback(() => {
    const ctx = audioCtxRef.current;
    const dest = masterGainRef.current;
    if (!ctx || !dest) return;
    const secPerStep = 60.0 / (4 * bpmRef.current);
    const lookAhead = 0.1;
    while (nextTimeRef.current < ctx.currentTime + lookAhead) {
      const step = nextStepRef.current;
      for (let track = 0; track < 4; track++) {
        if (stepsRef.current[track][step]) {
          playDrum(ctx, track, nextTimeRef.current, dest);
        }
      }
      nextTimeRef.current += secPerStep;
      nextStepRef.current = (nextStepRef.current + 1) % 16;
    }
  }, []);

  const startVisual = useCallback(() => {
    const ctx = audioCtxRef.current!;
    let vStep = 0;
    let nextVTime = ctx.currentTime;
    const draw = () => {
      const secPerStep = 60.0 / (4 * bpmRef.current);
      if (ctx.currentTime >= nextVTime) {
        setCurrentStep(vStep);
        vStep = (vStep + 1) % 16;
        nextVTime += secPerStep;
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  const playBeat = () => {
    initAudio();
    const ctx = audioCtxRef.current!;
    nextTimeRef.current = ctx.currentTime + 0.05;
    nextStepRef.current = 0;
    schedulerRef.current = window.setInterval(scheduleTick, 25);
    startVisual();
    setIsPlaying(true);
  };

  const stopBeat = () => {
    if (schedulerRef.current) { clearInterval(schedulerRef.current); schedulerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setIsPlaying(false);
    setCurrentStep(-1);
  };

  const toggleBeat = () => { isPlaying ? stopBeat() : playBeat(); };

  const startRecording = () => {
    if (!audioCtxRef.current) initAudio();
    const ctx = audioCtxRef.current!;
    const dest = ctx.createMediaStreamDestination();
    masterGainRef.current!.connect(dest);
    const rec = new MediaRecorder(dest.stream);
    recordChunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `mara-beat-${Date.now()}.webm`; a.click();
      URL.revokeObjectURL(url);
      try { masterGainRef.current!.disconnect(dest); } catch {}
    };
    rec.start();
    mediaRecorderRef.current = rec;
    if (!isPlaying) playBeat();
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  const toggleStep = (track: number, step: number) => {
    setBeatSteps(prev => {
      const next = prev.map(r => [...r]);
      next[track][step] = !next[track][step];
      return next;
    });
  };

  const clearBeat = () => {
    stopBeat();
    setBeatSteps(Array(4).fill(null).map(() => Array(16).fill(false)));
  };

  useEffect(() => {
    return () => {
      stopBeat();
      audioCtxRef.current?.close();
    };
  }, []);

  // ─── Tabs config ──────────────────────────────────────────────────────────
  const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'dashboard', icon: <ChartBar size={15} />,      label: t('creatorExtra.tabDashboard') },
    { id: 'create',    icon: <Sparkle size={15} />,       label: t('creatorExtra.tabCreate') },
    { id: 'upload',    icon: <Upload size={15} />,        label: t('creatorExtra.tabUpload') },
    { id: 'articles',  icon: <Article size={15} />,       label: t('creatorExtra.tabArticles') },
    { id: 'analytics', icon: <TrendUp size={15} />,       label: t('creatorExtra.tabAnalytics') },
    { id: 'earnings',  icon: <CurrencyEur size={15} />,   label: t('creatorExtra.tabEarnings') },
    { id: 'studio',    icon: <PaintBrush size={15} />,    label: t('creatorExtra.tabStudio') },
    { id: 'content',   icon: <Folder size={15} />,        label: t('creatorExtra.tabContent') },
    { id: 'comments',  icon: <ChatCircle size={15} />,    label: t('creatorExtra.tabComments') },
    { id: 'profile',   icon: <UserCircle size={15} />,    label: t('creatorExtra.tabProfile') },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="creator-container">
      <div className="creator-header">
        <div className="creator-header-left">
          <h1 className="creator-title">CREATOR</h1>
          {creatorXP.xp > 0 && (
            <span className="creator-xp-badge">⚡ {formatNum(creatorXP.xp)} XP · Lv {creatorXP.level}</span>
          )}
        </div>
        <button onClick={onClose} className="creator-close-btn"><PhX size={18} /></button>
      </div>

      <div className="creator-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`creator-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="creator-tab-icon">{tab.icon}</span>
            <span className="creator-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="creator-content">
        {error && (
          <div className="creator-error">
            <span>⚠️ {error}</span>
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}
        {success && <div className="creator-success">✅ {success}</div>}

        {/* ═══════════════════ DASHBOARD ═══════════════════ */}
        {activeTab === 'dashboard' && (
          <>
            <div className="creator-welcome">
              <div className="creator-welcome-title">
                {t('creatorExtra.welcomeGreeting', { name: user?.name || 'Creator' })}
              </div>
              <div className="creator-welcome-text">
                <span className="creator-orange">Mara AI</span> — {t('creatorExtra.creatorPanelSub')}
              </div>
            </div>

            <div className="creator-stats">
              <div className="creator-stat-card">
                <div className="creator-stat-value">{formatNum(analytics.totalReels)}</div>
                <div className="creator-stat-label">{t('creator.totalReels')}</div>
              </div>
              <div className="creator-stat-card">
                <div className="creator-stat-value">{formatNum(analytics.totalViews)}</div>
                <div className="creator-stat-label">{t('creator.totalViews')}</div>
              </div>
              <div className="creator-stat-card">
                <div className="creator-stat-value">{formatNum(analytics.totalLikes)}</div>
                <div className="creator-stat-label">{t('creator.totalLikes')}</div>
              </div>
              <div className="creator-stat-card">
                <div className="creator-stat-value">{analytics.followers}</div>
                <div className="creator-stat-label">{t('creator.followers')}</div>
              </div>
              <div className="creator-stat-card creator-stat-xp">
                <div className="creator-stat-value">⚡ {formatNum(creatorXP.xp)}</div>
                <div className="creator-stat-label">{t('creatorExtra.xpCreatorLvl', { level: creatorXP.level })}</div>
              </div>
              <div className="creator-stat-card">
                <div className="creator-stat-value">{analytics.engagementRate.toFixed(1)}%</div>
                <div className="creator-stat-label">{t('creator.engagement')}</div>
              </div>
            </div>

            <div className="creator-xp-bar-wrap">
              <div className="creator-xp-bar-label">
                <span>{t('creatorExtra.xpProgressLabel', { current: creatorXP.xp % 1000, total: 1000 })}</span>
                <span>{t('creatorExtra.levelArrow', { from: creatorXP.level, to: creatorXP.level + 1 })}</span>
              </div>
              <div className="creator-xp-bar-track">
                <div className="creator-xp-bar-fill" style={{ width: `${(creatorXP.xp % 1000) / 10}%` }} />
              </div>
            </div>

            <div className="creator-actions-grid">
              {([
                { icon: <Sparkle size={22} />,     label: t('creatorExtra.createShare'),      tab: 'create' as Tab },
                { icon: <Upload size={22} />,       label: t('creatorExtra.tabUpload'),        tab: 'upload' as Tab },
                { icon: <PaintBrush size={22} />,   label: t('creatorExtra.tabStudio'),        tab: 'studio' as Tab },
                { icon: <Article size={22} />,      label: t('creatorExtra.tabArticles'),      tab: 'articles' as Tab },
                { icon: <TrendUp size={22} />,      label: t('creatorExtra.tabAnalytics'),     tab: 'analytics' as Tab },
                { icon: <CurrencyEur size={22} />,  label: t('creatorExtra.tabEarnings'),      tab: 'earnings' as Tab },
              ] as { icon: React.ReactNode; label: string; tab: Tab }[]).map(a => (
                <div key={a.tab} className="creator-action-card" onClick={() => setActiveTab(a.tab)}>
                  <div className="creator-action-icon">{a.icon}</div>
                  <div className="creator-action-label">{a.label}</div>
                </div>
              ))}
            </div>

            {videos.length > 0 && (
              <div className="creator-recent">
                <h3 className="creator-section-title">{t('creatorExtra.recentContent')}</h3>
                {videos.slice(0, 4).map(v => (
                  <div key={v.id} className="creator-feature-item" onClick={() => setActiveTab('content')}>
                    <div className="creator-feature-icon">🎬</div>
                    <div className="creator-feature-text">
                      <div className="creator-feature-name">{v.title}</div>
                      <div className="creator-feature-desc">👁️ {formatNum(v.views)} · ❤️ {formatNum(v.likes)} · {new Date(v.createdAt).toLocaleDateString(i18n.language)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════ CREATE & SHARE ═══════════════════ */}
        {activeTab === 'create' && (
          <div className="creator-upload-form">
            <h3 className="creator-section-title">{t('creatorExtra.createShare')}</h3>

            <div className="creator-type-selector">
              {(['reel', 'photo', 'article'] as const).map(type => (
                <button
                  key={type}
                  className={`creator-type-btn${createType === type ? ' active' : ''}`}
                  onClick={() => setCreateType(type)}
                >
                  {type === 'reel' ? '🎬 Reel' : type === 'photo' ? '🖼️ Photo' : '📝 Article'}
                </button>
              ))}
            </div>

            {/* Title (reel + article) */}
            {createType !== 'photo' && (
              <label className="creator-form-label">
                {t('creator.uploadTitle')}
                <input type="text" className="creator-form-input" maxLength={100}
                  value={createTitle} onChange={e => setCreateTitle(e.target.value)}
                  placeholder={createType === 'reel' ? t('creatorExtra.reelTitlePlaceholder') : t('creatorExtra.articleTitlePlaceholder')}
                />
              </label>
            )}

            {/* Reel: URL or file */}
            {createType === 'reel' && (
              <>
                <label className="creator-form-label">
                  {t('creatorExtra.videoFileLabel')}
                  <input type="url" className="creator-form-input"
                    value={createUrl} onChange={e => setCreateUrl(e.target.value)}
                    disabled={!!createFile}
                    placeholder={t('creatorExtra.videoUrlPlaceholder2')} />
                </label>
                <label className="creator-form-label">
                  {t('creatorExtra.attachFileLabel')}
                  <input ref={createFileRef} type="file" accept="video/*" className="creator-form-input"
                    onChange={e => {
                      const f = e.target.files?.[0] || null;
                      if (createFilePreview) URL.revokeObjectURL(createFilePreview);
                      setCreateFile(f);
                      setCreateFilePreview(f ? URL.createObjectURL(f) : '');
                    }} />
                </label>
                {createFilePreview && <video src={createFilePreview} controls style={{ maxWidth: '100%', borderRadius: 8, marginTop: 4 }} />}
              </>
            )}

            {/* Photo: image upload */}
            {createType === 'photo' && (
              <label className="creator-form-label">
                {t('creatorExtra.imageLabel')}
                <input ref={createFileRef} type="file" accept="image/*" className="creator-form-input"
                  onChange={e => {
                    const f = e.target.files?.[0] || null;
                    if (createFilePreview) URL.revokeObjectURL(createFilePreview);
                    setCreateFile(f);
                    setCreateFilePreview(f ? URL.createObjectURL(f) : '');
                  }} />
                {createFilePreview && <img src={createFilePreview} alt="preview" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8 }} />}
              </label>
            )}

            {/* Article type */}
            {createType === 'article' && (
              <div className="creator-form-label">
                {t('creatorExtra.articleTypeLabel')}
                <div className="creator-type-selector" style={{ marginTop: 6 }}>
                  {(['public', 'vip', 'paid'] as const).map(at => (
                    <button key={at} className={`creator-type-btn${articleType === at ? ' active' : ''}`}
                      onClick={() => setArticleType(at)}>
                      {at === 'public' ? '🌍 Public' : at === 'vip' ? '⭐ VIP' : '💎 Paid'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Content / caption */}
            <label className="creator-form-label">
              {createType === 'article' ? t('creatorExtra.articleContentLabel') : t('creatorExtra.captionLabel')}
              <textarea className="creator-form-textarea" rows={createType === 'article' ? 8 : 3}
                maxLength={createType === 'article' ? 50000 : 500}
                value={createContent} onChange={e => setCreateContent(e.target.value)}
                placeholder={createType === 'article' ? t('creatorExtra.articlePlaceholder') : t('creatorExtra.captionPlaceholder')} />
            </label>

            {/* Tags */}
            <label className="creator-form-label">
              {t('creatorExtra.tagsLabel2')}
              <input type="text" className="creator-form-input"
                value={createTags} onChange={e => setCreateTags(e.target.value)}
                placeholder={t('creatorExtra.tagsPlaceholder2')} />
            </label>

            {/* Share destinations */}
            <div className="creator-share-destinations">
              <h4 className="creator-share-title">{t('creatorExtra.shareDestinations')}</h4>
              <div className="creator-share-options">
                {createType === 'reel' && (
                  <label className="creator-checkbox-label">
                    <input type="checkbox" checked={shareToReels} onChange={e => setShareToReels(e.target.checked)} />
                    <span>{t('creatorExtra.shareToReelsLabel')}</span>
                  </label>
                )}
                <label className="creator-checkbox-label">
                  <input type="checkbox" checked={shareToYou} onChange={e => setShareToYou(e.target.checked)} />
                  <span>{t('creatorExtra.shareToYouLabel', { xp: createType === 'reel' && shareToReels ? 10 : 30 })}</span>
                </label>
              </div>
              <div className="creator-xp-preview">
                {t('creatorExtra.estimatedXP', { xp: estimatedXP() })}
              </div>
            </div>

            <div className="creator-button-group">
              <button className={`creator-button${creating ? ' disabled' : ''}`}
                onClick={handleCreate} disabled={creating}>
                {creating ? t('creatorExtra.publishingBtn') : t('creatorExtra.publishBtn')}
              </button>
              <button className="creator-button secondary" onClick={() => {
                setCreateTitle(''); setCreateContent(''); setCreateTags(''); setCreateUrl('');
                if (createFilePreview) URL.revokeObjectURL(createFilePreview);
                setCreateFile(null); setCreateFilePreview('');
                if (createFileRef.current) createFileRef.current.value = '';
              }}>{t('creatorExtra.resetBtn')}</button>
            </div>
          </div>
        )}

        {/* ═══════════════════ UPLOAD REEL ═══════════════════ */}
        {activeTab === 'upload' && (
          <div className="creator-upload-form">
            <h3 className="creator-section-title">{t('creatorExtra.uploadDirectTitle')}</h3>
            <div className="creator-welcome">
              <div className="creator-welcome-text">
                {postStatus.canPost
                  ? t('creatorExtra.canPostMoreStatus', { remaining: postStatus.maxDaily - postStatus.postsToday })
                  : t('creatorExtra.limitReachedStatus', { max: postStatus.maxDaily })}
              </div>
            </div>
            <label className="creator-form-label">
              {t('creatorExtra.reelTitleStar')}
              <input type="text" className="creator-form-input" maxLength={100}
                value={uploadTitle} onChange={e => setUploadTitle(e.target.value)}
                placeholder={t('creatorExtra.reelTitlePlaceholder')} />
            </label>
            <label className="creator-form-label">
              {t('creatorExtra.videoFileInput')}
              <input ref={videoFileRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="creator-form-input"
                onChange={e => {
                  const f = e.target.files?.[0] || null;
                  if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
                  setVideoFile(f); setVideoPreviewUrl(f ? URL.createObjectURL(f) : '');
                }} />
              {videoPreviewUrl && <video src={videoPreviewUrl} controls style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8 }} />}
            </label>
            <label className="creator-form-label">
              {t('creatorExtra.externalUrlLabel')}
              <input type="url" className="creator-form-input"
                value={uploadUrl} onChange={e => setUploadUrl(e.target.value)}
                disabled={!!videoFile} placeholder="https://..." />
            </label>
            <label className="creator-form-label">
              {t('creatorExtra.descriptionLabel')}
              <textarea className="creator-form-textarea" rows={3} maxLength={500}
                value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} placeholder={t('creatorExtra.captionPlaceholder')} />
            </label>
            <label className="creator-form-label">
              {t('creatorExtra.tagsLabel2')}
              <input type="text" className="creator-form-input"
                value={uploadTags} onChange={e => setUploadTags(e.target.value)} placeholder="tag1, tag2..." />
            </label>
            <div className="creator-button-group">
              <button className={`creator-button${(!postStatus.canPost || uploading) ? ' disabled' : ''}`}
                onClick={handleUpload} disabled={!postStatus.canPost || uploading}>
                {uploading ? t('creatorExtra.uploadingBtn') : t('creatorExtra.uploadReelBtn')}
              </button>
              <button className="creator-button secondary" onClick={() => {
                setUploadTitle(''); setUploadDesc(''); setUploadUrl(''); setUploadTags('');
                if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
                setVideoFile(null); setVideoPreviewUrl('');
                if (videoFileRef.current) videoFileRef.current.value = '';
              }}>{t('creatorExtra.resetBtn')}</button>
            </div>
          </div>
        )}

        {/* ═══════════════════ ARTICLES ═══════════════════ */}
        {activeTab === 'articles' && (
          <>
            <h3 className="creator-section-title">{t('creatorExtra.myArticlesTitle')}</h3>
            {loading ? <div className="creator-loading">{t('creator.loading')}</div> :
              articles.length === 0 ? (
                <div className="creator-empty">
                  <div>{t('creatorExtra.noArticlesYet')}</div>
                  <button className="creator-button" style={{ marginTop: 12 }}
                    onClick={() => window.location.href = '/writers-hub'}>
                    {t('creatorExtra.openWritersHub')}
                  </button>
                </div>
              ) : (
                <div className="creator-list">
                  {articles.map(art => (
                    <div key={art.id} className="creator-list-item">
                      <div className="creator-list-icon">
                        {art.type === 'paid' ? '💎' : art.type === 'vip' ? '⭐' : '🌍'}
                      </div>
                      <div className="creator-list-body">
                        <div className="creator-list-title">{art.title}</div>
                        <div className="creator-list-meta">
                          👁️ {formatNum(art.views || 0)} · ❤️ {formatNum(art.likes || 0)}
                          {art.authorShareCents ? ` · 💶 ${(art.authorShareCents / 100).toFixed(2)} EUR` : ''}
                          · {new Date(art.createdAt).toLocaleDateString(i18n.language)}
                        </div>
                      </div>
                      <a href="/writers-hub" className="creator-video-btn view" style={{ textDecoration: 'none' }}>{t('creatorExtra.editBtn')}</a>
                    </div>
                  ))}
                </div>
              )}
          </>
        )}

        {/* ═══════════════════ ANALYTICS ═══════════════════ */}
        {activeTab === 'analytics' && (
          <>
            <h3 className="creator-section-title">{t('creatorExtra.analyticsTitle')}</h3>
            <div className="creator-analytics-grid">
              {([
                { label: t('creator.totalReels'), value: formatNum(analytics.totalReels), icon: <FilmStrip size={22} /> },
                { label: t('creator.totalViews'), value: formatNum(analytics.totalViews), icon: <Eye size={22} /> },
                { label: t('creator.totalLikes'), value: formatNum(analytics.totalLikes), icon: <Heart size={22} /> },
                { label: t('creator.followers'),  value: formatNum(analytics.followers),  icon: <UsersThree size={22} /> },
                { label: t('creator.engagement'), value: `${analytics.engagementRate.toFixed(1)}%`, icon: <ChartBar size={22} /> },
                { label: t('creatorExtra.articlesStatLabel'), value: String(articles.length), icon: <Article size={22} /> },
              ] as { label: string; value: string; icon: React.ReactNode }[]).map(s => (
                <div key={s.label} className="creator-analytics-card">
                  <div className="creator-analytics-icon">{s.icon}</div>
                  <div className="creator-analytics-value">{s.value}</div>
                  <div className="creator-analytics-label">{s.label}</div>
                </div>
              ))}
            </div>
            {videos.length > 0 && (
              <>
                <h4 className="creator-section-subtitle">{t('creatorExtra.topContentTitle')}</h4>
                <div className="creator-top-content">
                  {[...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5).map((v, i) => {
                    const maxViews = videos.reduce((m, x) => Math.max(m, x.views || 0), 1);
                    return (
                      <div key={v.id} className="creator-top-item">
                        <span className="creator-top-rank">#{i + 1}</span>
                        <div className="creator-top-bar-wrap">
                          <div className="creator-top-title">{v.title}</div>
                          <div className="creator-top-bar">
                            <div className="creator-top-bar-fill" style={{ width: `${((v.views || 0) / maxViews) * 100}%` }} />
                          </div>
                        </div>
                        <span className="creator-top-views">{formatNum(v.views || 0)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ═══════════════════ EARNINGS ═══════════════════ */}
        {activeTab === 'earnings' && (() => {
          const days = getDaysUntilLaunch();
          const launched = days === 0;
          return (
            <>
              <h3 className="creator-section-title">{t('creatorExtra.earningsTitle')}</h3>
              <div className="creator-xp-card">
                <div className="creator-xp-card-label">{t('creatorExtra.xpEarnedLabel')}</div>
                <div className="creator-xp-card-value">⚡ {formatNum(creatorXP.xp)} XP</div>
                <div className="creator-xp-card-level">{t('creatorExtra.levelStreakInfo', { level: creatorXP.level, streak: creatorXP.streak })}</div>
                <div className="creator-xp-bar-track" style={{ marginTop: 12 }}>
                  <div className="creator-xp-bar-fill" style={{ width: `${(creatorXP.xp % 1000) / 10}%` }} />
                </div>
                <div className="creator-xp-bar-label" style={{ marginTop: 4 }}>
                  <span>{t('creatorExtra.xpForNextLevel', { current: creatorXP.xp % 1000, next: creatorXP.level + 1 })}</span>
                </div>
              </div>

              <div className="creator-earnings-xp-table">
                <h4 className="creator-section-subtitle">{t('creatorExtra.howToEarnTitle')}</h4>
                {[
                  { action: t('creatorExtra.xpActionReel'), xp: '+50 XP' },
                  { action: t('creatorExtra.xpActionShare'), xp: '+30 XP' },
                  { action: t('creatorExtra.xpActionBoth'), xp: '+60 XP' },
                  { action: t('creatorExtra.xpActionPublic'), xp: '+40 XP' },
                  { action: t('creatorExtra.xpActionPaid'), xp: '+80 XP' },
                ].map(row => (
                  <div key={row.action} className="creator-earnings-row">
                    <span className="creator-earnings-action">{row.action}</span>
                    <span className="creator-earnings-xp">{row.xp}</span>
                  </div>
                ))}
              </div>

              {!launched ? (
                <div className="creator-launch-lock">
                  <div className="creator-launch-icon"><Lock size={32} /></div>
                  <div className="creator-launch-title">{t('creatorExtra.monetizationDate', { date: '1 July 2026' })}</div>
                  <div className="creator-launch-countdown">
                    <div className="creator-countdown-box">
                      <div className="creator-countdown-num">{days}</div>
                      <div className="creator-countdown-unit">{t('creatorExtra.daysRemaining')}</div>
                    </div>
                  </div>
                  <div className="creator-launch-text">
                    {t('creatorExtra.keepCreating')}
                    <br />{t('creatorExtra.creatorSubscription')}
                  </div>
                  <div className="creator-earnings-preview">
                    <div className="creator-earnings-preview-item">
                      <span>{t('creatorExtra.estimatedEarnings')}</span><span className="creator-locked">€ —</span>
                    </div>
                    <div className="creator-earnings-preview-item">
                      <span>{t('creatorExtra.articlesSold')}</span><span className="creator-locked">— </span>
                    </div>
                    <div className="creator-earnings-preview-item">
                      <span>{t('creatorExtra.revenueShare')}</span><span className="creator-locked">70%</span>
                    </div>
                    <div className="creator-earnings-note">{t('creatorExtra.availableDate', { date: '01.07.2026' })}</div>
                  </div>
                </div>
              ) : (
                <div className="creator-earnings-live">
                  <div className="creator-section-subtitle">{t('creatorExtra.liveEarnings')}</div>
                </div>
              )}
            </>
          );
        })()}

        {/* ═══════════════════ STUDIO ═══════════════════ */}
        {activeTab === 'studio' && (
          <>
            <h3 className="creator-section-title">{t('creatorExtra.studioTitle')}</h3>
            <div className="creator-studio-tabs">
              {(['music', 'photo', 'video'] as StudioTab[]).map(st => (
                <button key={st}
                  className={`creator-studio-tab${studioTab === st ? ' active' : ''}`}
                  onClick={() => setStudioTab(st)}>
                  {st === 'music'
                    ? <><MusicNote size={14} /> {t('creatorExtra.musicCreatorTab')}</>
                    : st === 'photo'
                    ? <><PhImage size={14} /> {t('creatorExtra.photoEditorTab')}</>
                    : <><VideoCamera size={14} /> {t('creatorExtra.videoThumbTab')}</>
                  }
                </button>
              ))}
            </div>

            {/* ── Music Creator ── */}
            {studioTab === 'music' && (
              <div className="creator-music">
                <div className="creator-music-header">
                  <div className="creator-music-bpm">
                    <label>BPM: <strong>{bpm}</strong></label>
                    <input type="range" min={60} max={180} value={bpm}
                      onChange={e => setBpm(Number(e.target.value))}
                      disabled={isPlaying} className="creator-bpm-slider" />
                  </div>
                  <div className="creator-music-controls">
                    <button className={`creator-music-btn${isPlaying ? ' stop' : ' play'}`} onClick={toggleBeat}>
                      {isPlaying ? '⏹ Stop' : '▶ Play'}
                    </button>
                    <button className={`creator-music-btn${isRecording ? ' rec-stop' : ' rec'}`}
                      onClick={isRecording ? stopRecording : startRecording}>
                      {isRecording ? '⏺ Stop Rec' : '⏺ Record'}
                    </button>
                    <button className="creator-music-btn clear" onClick={clearBeat}>🗑 Clear</button>
                  </div>
                </div>

                <div className="creator-sequencer">
                  {TRACK_NAMES.map((name, track) => (
                    <div key={track} className="creator-seq-row">
                      <div className="creator-seq-label" style={{ color: TRACK_COLORS[track] }}>{name}</div>
                      <div className="creator-seq-steps">
                        {Array(16).fill(null).map((_, step) => (
                          <button
                            key={step}
                            className={`creator-seq-step${beatSteps[track][step] ? ' on' : ''}${currentStep === step && isPlaying ? ' current' : ''}${step % 4 === 0 ? ' beat' : ''}`}
                            style={beatSteps[track][step] ? { background: TRACK_COLORS[track], borderColor: TRACK_COLORS[track] } : {}}
                            onClick={() => toggleStep(track, step)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="creator-music-hint">
                  {t('creatorExtra.musicHint')}
                </div>
              </div>
            )}

            {/* ── Photo Editor ── */}
            {studioTab === 'photo' && (
              <div className="creator-photo-editor">
                <label className="creator-form-label">
                  {t('creatorExtra.uploadImageLabel')}
                  <input type="file" accept="image/*" className="creator-form-input"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (photoPreview) URL.revokeObjectURL(photoPreview);
                      const url = URL.createObjectURL(f);
                      setPhotoPreview(url);
                      const img = new Image();
                      img.onload = () => {
                        photoImgRef.current = img;
                        applyPhotoFilters();
                      };
                      img.src = url;
                    }} />
                </label>

                {photoPreview && (
                  <>
                    <div className="creator-filter-controls">
                      {[
                        { label: 'Brightness', value: photoBrightness, set: setPhotoBrightness, min: 0, max: 200 },
                        { label: 'Contrast', value: photoContrast, set: setPhotoContrast, min: 0, max: 200 },
                        { label: 'Saturation', value: photoSaturation, set: setPhotoSaturation, min: 0, max: 200 },
                        { label: 'Sepia', value: photoSepia, set: setPhotoSepia, min: 0, max: 100 },
                        { label: 'Grayscale', value: photoGrayscale, set: setPhotoGrayscale, min: 0, max: 100 },
                      ].map(ctrl => (
                        <div key={ctrl.label} className="creator-filter-row">
                          <span>{ctrl.label}: {ctrl.value}</span>
                          <input type="range" min={ctrl.min} max={ctrl.max} value={ctrl.value}
                            onChange={e => { ctrl.set(Number(e.target.value)); }}
                            className="creator-filter-slider" />
                        </div>
                      ))}
                    </div>
                    <label className="creator-form-label" style={{ marginTop: 8 }}>
                      {t('creatorExtra.textOverlayLabel')}
                      <input type="text" className="creator-form-input" value={photoText}
                        onChange={e => setPhotoText(e.target.value)} placeholder={t('creatorExtra.textOverlayPlaceholder')} />
                    </label>
                    <button className="creator-button" style={{ marginTop: 8 }} onClick={applyPhotoFilters}>{t('creatorExtra.applyBtn')}</button>
                    <canvas ref={photoCanvasRef} className="creator-canvas-preview" />
                    <button className="creator-button" style={{ marginTop: 8 }} onClick={downloadPhoto}>
                      {t('creatorExtra.downloadPngBtn')}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ── Video Thumbnail Extractor ── */}
            {studioTab === 'video' && (
              <div className="creator-video-editor">
                <label className="creator-form-label">
                  {t('creatorExtra.uploadVideoThumbLabel')}
                  <input type="file" accept="video/*" className="creator-form-input"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (thumbVideoUrl) URL.revokeObjectURL(thumbVideoUrl);
                      setThumbVideoUrl(URL.createObjectURL(f));
                    }} />
                </label>
                {thumbVideoUrl && (
                  <>
                    <video
                      ref={thumbVideoRef}
                      src={thumbVideoUrl}
                      controls
                      style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8 }}
                    />
                    <label className="creator-form-label" style={{ marginTop: 8 }}>
                      {t('creatorExtra.thumbTextLabel')}
                      <input type="text" className="creator-form-input" value={thumbText}
                        onChange={e => setThumbText(e.target.value)} placeholder={t('creatorExtra.thumbTextPlaceholder')} />
                    </label>
                    <div className="creator-button-group" style={{ marginTop: 8 }}>
                      <button className="creator-button secondary" onClick={captureThumb}>{t('creatorExtra.captureFrameBtn')}</button>
                      <button className="creator-button" onClick={downloadThumb}>{t('creatorExtra.downloadJpgBtn')}</button>
                    </div>
                    <canvas ref={thumbCanvasRef} className="creator-canvas-preview" />
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════ CONTENT MANAGER ═══════════════════ */}
        {activeTab === 'content' && (
          <>
            <h3 className="creator-section-title">{t('creatorExtra.contentManagerTitle')}</h3>
            {loading ? <div className="creator-loading">{t('creator.loading')}</div> :
              videos.length === 0 && articles.length === 0 ? (
                <div className="creator-empty">{t('creatorExtra.noContentYet')}</div>
              ) : (
                <div className="creator-list">
                  {videos.map(v => (
                    <div key={`v-${v.id}`} className="creator-list-item">
                      <div className="creator-list-icon">🎬</div>
                      <div className="creator-list-body">
                        <div className="creator-list-title">{v.title}</div>
                        <div className="creator-list-meta">
                          👁️ {formatNum(v.views)} · ❤️ {formatNum(v.likes)} · {new Date(v.createdAt).toLocaleDateString(i18n.language)}
                        </div>
                      </div>
                      <div className="creator-video-actions">
                        {v.url && <a href={v.url} target="_blank" rel="noopener noreferrer" className="creator-video-btn view">{t('creatorExtra.viewBtn')}</a>}
                        {deleteId === v.id ? (
                          <div className="creator-delete-confirm">
                            <span>{t('creatorExtra.confirmDeleteMsg')}</span>
                            <button className="creator-video-btn delete" onClick={() => handleDelete(v.id)}>{t('creatorExtra.confirmDeleteYes')}</button>
                            <button className="creator-video-btn" onClick={() => setDeleteId(null)}>{t('creatorExtra.confirmDeleteNo')}</button>
                          </div>
                        ) : (
                          <button className="creator-video-btn delete" onClick={() => setDeleteId(v.id)}>{t('creatorExtra.deleteVideoBtn')}</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {articles.map(art => (
                    <div key={`a-${art.id}`} className="creator-list-item">
                      <div className="creator-list-icon">{art.type === 'paid' ? '💎' : art.type === 'vip' ? '⭐' : '📝'}</div>
                      <div className="creator-list-body">
                        <div className="creator-list-title">{art.title}</div>
                        <div className="creator-list-meta">
                          {art.type} · 👁️ {formatNum(art.views || 0)} · {new Date(art.createdAt).toLocaleDateString(i18n.language)}
                        </div>
                      </div>
                      <a href="/writers-hub" className="creator-video-btn view" style={{ textDecoration: 'none' }}>{t('creatorExtra.editBtn')}</a>
                    </div>
                  ))}
                </div>
              )}
          </>
        )}

        {/* ═══════════════════ COMMENTS ═══════════════════ */}
        {activeTab === 'comments' && (
          <>
            <h3 className="creator-section-title">{t('creatorExtra.commentsTitle')}</h3>
            {loading ? <div className="creator-loading">{t('creator.loading')}</div> :
              comments.length === 0 ? (
                <div className="creator-empty">{t('creatorExtra.noCommentsYet')}</div>
              ) : (
                <div className="creator-list">
                  {comments.map(c => (
                    <div key={c.id} className="creator-comment-item">
                      <div className="creator-comment-header">
                        <span className="creator-comment-user">{c.userName || t('reels.defaultCreator')}</span>
                        <span className="creator-comment-video">{t('creatorExtra.commentedOn', { title: c.videoTitle })}</span>
                        <span className="creator-comment-date">{new Date(c.createdAt).toLocaleDateString(i18n.language)}</span>
                      </div>
                      <div className="creator-comment-text">{c.content}</div>
                    </div>
                  ))}
                </div>
              )}
          </>
        )}

        {/* ═══════════════════ PROFILE ═══════════════════ */}
        {activeTab === 'profile' && (
          <div className="creator-upload-form">
            <h3 className="creator-section-title">{t('creatorExtra.creatorProfileTitle')}</h3>
            {[
              { label: t('creatorExtra.displayNameLabel'), key: 'displayName' as keyof ProfileData, placeholder: t('creatorExtra.displayNamePlaceholder') },
              { label: t('creatorExtra.bioLabel'), key: 'bio' as keyof ProfileData, placeholder: t('creatorExtra.bioPlaceholder2') },
              { label: t('creatorExtra.locationLabel'), key: 'location' as keyof ProfileData, placeholder: t('creatorExtra.locationPlaceholder2') },
              { label: t('creatorExtra.websiteLabel'), key: 'website' as keyof ProfileData, placeholder: t('creatorExtra.websitePlaceholder2') },
            ].map(field => (
              <label key={field.key} className="creator-form-label">
                {field.label}
                {field.key === 'bio' ? (
                  <textarea className="creator-form-textarea" rows={3}
                    value={profile[field.key]} placeholder={field.placeholder}
                    onChange={e => setProfile(p => ({ ...p, [field.key]: e.target.value }))} />
                ) : (
                  <input type="text" className="creator-form-input"
                    value={profile[field.key]} placeholder={field.placeholder}
                    onChange={e => setProfile(p => ({ ...p, [field.key]: e.target.value }))} />
                )}
              </label>
            ))}
            <div className="creator-profile-link">
              <span>{t('creatorExtra.publicLinkLabel')} </span>
              <a href="/you" style={{ color: '#ff6b00' }}>{t('creatorExtra.profileLinkText')}</a>
            </div>
            <button className={`creator-button${profileSaving ? ' disabled' : ''}`}
              onClick={handleProfileSave} disabled={profileSaving} style={{ marginTop: 8 }}>
              {profileSaving ? t('creatorExtra.savingProfileBtn') : t('creatorExtra.saveProfileBtn')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

