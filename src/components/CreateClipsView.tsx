import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Video,
  Layers,
  Clock,
  Smartphone,
  Type,
  Globe,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCw,
  UploadCloud,
  FileVideo,
  X,
  ArrowRight,
  Cookie,
  Key,
  HelpCircle,
  Check,
} from 'lucide-react';
import { apiClient } from '../services/api';
import { ClipItem, ProjectItem } from '../types';

interface CreateClipsViewProps {
  onClipsGenerated: (project: ProjectItem, clips: ClipItem[]) => void;
}

export const CreateClipsView: React.FC<CreateClipsViewProps> = ({
  onClipsGenerated,
}) => {
  const [sourceMode, setSourceMode] = useState<'youtube' | 'upload'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clipsCount, setClipsCount] = useState<number>(15);
  const [durationSeconds, setDurationSeconds] = useState<number>(14);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [platformPresets, setPlatformPresets] = useState<string[]>([
    'Instagram Reels',
    'YouTube Shorts',
    'Facebook Reels',
  ]);
  const [captionStyle, setCaptionStyle] = useState<'minimal' | 'bold' | 'dynamic' | 'highlight'>('dynamic');
  const [language, setLanguage] = useState<string>('English');
  const [hasConfirmedRights, setHasConfirmedRights] = useState<boolean>(true);

  // Cookie management state
  const [showCookieModal, setShowCookieModal] = useState<boolean>(false);
  const [cookieText, setCookieText] = useState<string>('');
  const [cookieStatus, setCookieStatus] = useState<{
    hasCookies: boolean;
    validCookieLines: number;
    lastModified: string | null;
  } | null>(null);
  const [cookieSaveMsg, setCookieSaveMsg] = useState<string>('');
  const [isSavingCookies, setIsSavingCookies] = useState<boolean>(false);

  useEffect(() => {
    apiClient.getYouTubeCookiesStatus().then(setCookieStatus).catch(() => {});
  }, []);

  const handleSaveCookies = async () => {
    if (!cookieText.trim()) return;
    setIsSavingCookies(true);
    setCookieSaveMsg('');
    try {
      await apiClient.saveYouTubeCookies(cookieText);
      setCookieSaveMsg('Cookies saved successfully. YouTube downloads will now use authenticated credentials.');
      const updated = await apiClient.getYouTubeCookiesStatus();
      setCookieStatus(updated);
      setTimeout(() => {
        setShowCookieModal(false);
        setCookieSaveMsg('');
        setCookieText('');
      }, 1500);
    } catch (err: any) {
      setCookieSaveMsg(`Error: ${err.message}`);
    } finally {
      setIsSavingCookies(false);
    }
  };

  const handleRemoveCookies = async () => {
    try {
      await apiClient.removeYouTubeCookies();
      setCookieStatus({ hasCookies: false, validCookieLines: 0, lastModified: null });
      setCookieSaveMsg('Cookies removed.');
      setTimeout(() => setCookieSaveMsg(''), 1500);
    } catch (err: any) {
      setCookieSaveMsg(`Error: ${err.message}`);
    }
  };

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // 9 Canonical Pipeline Steps
  const analysisSteps = [
    'Validating URL & checking source availability...',
    'Downloading source video & preparing stream...',
    'Extracting audio stream with high-fidelity codec...',
    'Transcribing audio with word-level timestamps...',
    'Analyzing viral moments with Gemini multimodal intelligence...',
    'Selecting top 10–15 clip candidates by retention velocity...',
    'Cropping vertical 9:16 video with face/speaker centering...',
    'Burning in animated styled captions & watermark...',
    'Finalizing MP4 clips & generating downloadable renders...',
  ];

  const presetExamples = [
    {
      title: 'High Performance & Mindset Talk',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    },
    {
      title: 'AI Supercycles & Tech Revolution',
      url: 'https://www.youtube.com/watch?v=kXYiU_JCYtU',
    },
    {
      title: 'Startup Scaling & Founder Tactics',
      url: 'https://www.youtube.com/watch?v=3JZ_D3ELwOQ',
    },
  ];

  const handleTogglePlatform = (p: string) => {
    if (platformPresets.includes(p)) {
      if (platformPresets.length > 1) {
        setPlatformPresets(platformPresets.filter((item) => item !== p));
      }
    } else {
      setPlatformPresets([...platformPresets, p]);
    }
  };

  const handleFileChange = (file?: File | null) => {
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) {
      setSelectedFile(file);
      setErrorMessage('');
    } else {
      setErrorMessage('Only MP4, MOV, and WebM video files are supported.');
    }
  };

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();

    if (sourceMode === 'youtube' && !youtubeUrl.trim()) {
      setErrorMessage('Please enter a valid public YouTube URL.');
      return;
    }

    if (sourceMode === 'upload' && !selectedFile) {
      setErrorMessage('Please select an MP4, MOV, or WebM video file to upload.');
      return;
    }

    if (!hasConfirmedRights) {
      setErrorMessage('You must confirm content rights permission before analyzing this video.');
      return;
    }

    setErrorMessage('');
    setIsProcessing(true);
    setProgressPercent(11);
    setCurrentStepIndex(0);

    const interval = setInterval(() => {
      setProgressPercent((prev) => {
        if (prev >= 92) return prev;
        const next = prev + Math.floor(Math.random() * 8 + 4);
        const stepIdx = Math.min(
          analysisSteps.length - 1,
          Math.floor((next / 100) * analysisSteps.length)
        );
        setCurrentStepIndex(stepIdx);
        return next;
      });
    }, 550);

    try {
      let response;
      if (sourceMode === 'upload' && selectedFile) {
        const formData = new FormData();
        formData.append('videoFile', selectedFile);
        formData.append('clipsCount', String(clipsCount));
        formData.append('durationSeconds', String(durationSeconds));
        formData.append('aspectRatio', aspectRatio);
        formData.append('captionStyle', captionStyle);
        formData.append('language', language);
        formData.append('hasUserConfirmedRights', String(hasConfirmedRights));

        response = await apiClient.uploadAndAnalyzeVideo(formData);
      } else {
        response = await apiClient.analyzeVideo({
          youtubeUrl: youtubeUrl.trim(),
          clipsCount,
          durationSeconds,
          aspectRatio,
          captionStyle,
          language,
          hasUserConfirmedRights: hasConfirmedRights,
        });
      }

      clearInterval(interval);
      setProgressPercent(100);
      setCurrentStepIndex(analysisSteps.length - 1);

      setTimeout(() => {
        setIsProcessing(false);
        onClipsGenerated(response.project, response.clips);
      }, 700);
    } catch (err: unknown) {
      clearInterval(interval);
      setIsProcessing(false);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "We couldn't process this video. Please verify the source and content rights."
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in pb-12">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-violet-400" />
            <span>Create Viral Clips</span>
          </h1>
          <span className="px-3 py-1 rounded-full text-xs font-bold border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
            Production Pipeline Active
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Paste a public YouTube link. ClipForge AI analyzes audio, transcript, and visual topics to generate 10–15 short vertical clips (13–15 seconds).
        </p>
      </div>

      {/* Processing Screen Overlay / Active State */}
      {isProcessing ? (
        <div className="p-8 sm:p-12 rounded-2xl bg-[#111420] border border-violet-500/40 shadow-2xl text-center space-y-6">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-500/40 items-center justify-center relative">
            <RotateCw className="w-8 h-8 text-violet-400 animate-spin" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500" />
            </span>
          </div>

          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">
              Real Video Processing Pipeline
            </h3>
            <p className="text-sm text-violet-300 font-medium mt-1 transition-all">
              {analysisSteps[currentStepIndex]}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="max-w-md mx-auto space-y-2">
            <div className="w-full bg-[#1b1f30] rounded-full h-2.5 overflow-hidden p-0.5">
              <div
                className="bg-gradient-to-r from-violet-600 via-indigo-500 to-blue-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 font-mono">
              <span>Step {currentStepIndex + 1} of {analysisSteps.length}</span>
              <span>{progressPercent}% Complete</span>
            </div>
          </div>

          {/* Steps List */}
          <div className="max-w-md mx-auto text-left space-y-1.5 pt-2">
            {analysisSteps.map((step, idx) => {
              const isDone = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-2 text-xs transition-colors ${
                    isDone
                      ? 'text-emerald-400 font-medium'
                      : isCurrent
                      ? 'text-violet-300 font-bold'
                      : 'text-slate-600'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  ) : isCurrent ? (
                    <RotateCw className="w-3.5 h-3.5 shrink-0 text-violet-400 animate-spin" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" />
                  )}
                  <span className="truncate">{step}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <form onSubmit={handleStartAnalysis} className="space-y-6">
          {/* Source Selection & Input Card */}
          <div className="p-6 rounded-2xl bg-[#111420] border border-[#212437] space-y-5">
            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-2 p-1 rounded-xl bg-[#0b0d14] border border-[#1f2337] w-fit">
              <button
                type="button"
                onClick={() => {
                  setSourceMode('youtube');
                  setErrorMessage('');
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  sourceMode === 'youtube'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Video className="w-3.5 h-3.5 text-red-400" />
                <span>YouTube Link</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceMode('upload');
                  setErrorMessage('');
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  sourceMode === 'upload'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5 text-violet-300" />
                <span>Direct Video Upload</span>
                <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Reliable
                </span>
              </button>
            </div>

            {sourceMode === 'youtube' ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                      Public YouTube Video URL
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCookieModal(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors bg-[#181d2e] hover:bg-[#232940] text-slate-300 border border-[#282f48] cursor-pointer"
                    >
                      <Cookie className="w-3.5 h-3.5 text-amber-400" />
                      <span>{cookieStatus?.hasCookies ? 'YouTube Cookies Active' : 'Setup YouTube Cookies'}</span>
                      {cookieStatus?.hasCookies && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm" />
                      )}
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <div className="absolute left-3.5 pointer-events-none text-slate-500">
                      <Video className="w-4 h-4 text-red-500" />
                    </div>
                    <input
                      type="text"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0b0d14] border border-[#23273c] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
                    />
                  </div>
                </div>

                {/* Quick Preset Example Links */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] text-slate-500 font-medium">Quick Examples:</span>
                  {presetExamples.map((ex, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setYoutubeUrl(ex.url)}
                      className="px-2.5 py-1 rounded-lg bg-[#161a29] hover:bg-[#1f2438] text-[11px] font-medium text-slate-300 border border-[#24293f] transition-colors cursor-pointer"
                    >
                      {ex.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Source Video File (MP4, MOV, WebM)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    className="hidden"
                    onChange={(e) => handleFileChange(e.target.files?.[0])}
                  />

                  {selectedFile ? (
                    <div className="flex items-center justify-between p-4 rounded-xl bg-[#0b0d14] border border-violet-500/40">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
                          <FileVideo className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white truncate max-w-sm">
                            {selectedFile.name}
                          </div>
                          <div className="text-xs text-slate-400">
                            {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • Ready for processing
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFileChange(null)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        handleFileChange(e.dataTransfer.files?.[0]);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                        isDragging
                          ? 'border-violet-500 bg-violet-500/10'
                          : 'border-[#282d45] hover:border-violet-500/50 bg-[#0b0d14]'
                      }`}
                    >
                      <UploadCloud className="w-8 h-8 mx-auto text-violet-400 mb-2" />
                      <div className="text-sm font-medium text-white mb-1">
                        Click to select or drag and drop video file
                      </div>
                      <div className="text-xs text-slate-500">
                        Supports MP4, MOV, and WebM up to 500MB
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error Display with Direct Upload Fallback CTA */}
            {errorMessage && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div className="space-y-1 flex-1">
                    <div className="font-semibold text-rose-200">
                      {errorMessage.toLowerCase().includes('verification') || errorMessage.toLowerCase().includes('bot')
                        ? 'YouTube Bot Verification Required'
                        : 'Source Acquisition Notice'}
                    </div>
                    <p className="leading-relaxed">{errorMessage}</p>
                  </div>
                </div>
                {sourceMode === 'youtube' && (
                  <div className="pt-2.5 border-t border-rose-500/20 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-rose-300/80">
                      Bypass YouTube server checks immediately:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCookieModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181d2e] hover:bg-[#232940] text-slate-200 border border-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        <Cookie className="w-3.5 h-3.5 text-amber-400" />
                        <span>Add cookies.txt</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSourceMode('upload');
                          setErrorMessage('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition-colors cursor-pointer shadow-sm"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>Switch to Direct Upload</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Target Clips Count (10-15) */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-violet-400" />
                  <span>Clips To Generate</span>
                </label>
                <span className="px-2 py-0.5 rounded-md bg-violet-600/20 text-violet-300 font-bold text-xs font-mono">
                  {clipsCount} Clips
                </span>
              </div>

              <input
                type="range"
                min={10}
                max={15}
                step={1}
                value={clipsCount}
                onChange={(e) => setClipsCount(Number(e.target.value))}
                className="w-full accent-violet-600 cursor-pointer"
              />

              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span>10 clips</span>
                <span>12 clips</span>
                <span>15 clips</span>
              </div>
            </div>

            {/* Clip Duration (13–15 Seconds Optimized) */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span>Clip Duration</span>
                </label>
                <span className="px-2 py-0.5 rounded-md bg-indigo-600/20 text-indigo-300 font-bold text-xs font-mono">
                  {durationSeconds} Seconds
                </span>
              </div>

              <input
                type="range"
                min={13}
                max={15}
                step={1}
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />

              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span>13s (High-loop)</span>
                <span>14s (Balanced)</span>
                <span>15s (Max Hook)</span>
              </div>
            </div>

            {/* Subtitle / Caption Style */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Type className="w-4 h-4 text-pink-400" />
                <span>Subtitle Style</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'dynamic', name: 'Dynamic Bold', desc: 'Active word pop' },
                  { id: 'bold', name: 'Punchy', desc: 'Heavy uppercase' },
                  { id: 'highlight', name: 'Highlight', desc: 'Yellow contrast' },
                  { id: 'minimal', name: 'Clean Minimal', desc: 'Understated' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setCaptionStyle(st.id as any)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      captionStyle === st.id
                        ? 'bg-violet-600/20 border-violet-500/50 text-white'
                        : 'bg-[#151826] border-[#222538] text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold">{st.name}</div>
                    <div className="text-[10px] text-slate-500">{st.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Platform Presets */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Optimized Formats</span>
              </label>

              <div className="grid grid-cols-3 gap-2">
                {['Instagram Reels', 'YouTube Shorts', 'Facebook Reels'].map((p) => {
                  const active = platformPresets.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleTogglePlatform(p)}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        active
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold'
                          : 'bg-[#151826] border-[#222538] text-slate-400 hover:text-white font-medium'
                      }`}
                    >
                      <span className="text-[11px] block">{p}</span>
                      <span className="text-[9px] text-slate-500">9:16 Vertical</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Copyright & Authorization Confirmation */}
          <div className="p-4 rounded-2xl bg-[#111420] border border-[#212437] flex items-start gap-3">
            <input
              type="checkbox"
              id="rightsConfirmation"
              checked={hasConfirmedRights}
              onChange={(e) => setHasConfirmedRights(e.target.checked)}
              className="mt-1 w-4 h-4 accent-violet-600 rounded cursor-pointer"
            />
            <label
              htmlFor="rightsConfirmation"
              className="text-xs text-slate-300 leading-relaxed cursor-pointer"
            >
              <strong className="text-white">Content Rights Confirmation:</strong> I confirm that I own
              or have explicit permission to process and repurpose this video content. ClipForge AI
              respects intellectual property and platform policies.
            </label>
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-sm font-extrabold text-white shadow-xl shadow-violet-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{sourceMode === 'upload' ? `Upload & Generate ${clipsCount} Viral Clips` : `Generate ${clipsCount} Viral Short Clips`}</span>
          </button>
        </form>
      )}

      {/* YouTube Cookies Modal */}
      {showCookieModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#121624] border border-[#262c45] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Cookie className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">YouTube Session Cookies</h3>
                  <p className="text-[11px] text-slate-400">Authenticate server requests to bypass YouTube bot detection</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCookieModal(false);
                  setCookieSaveMsg('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#0b0e18] border border-[#1f243b] text-xs text-slate-300 space-y-1.5 leading-relaxed">
              <div className="font-semibold text-slate-200">How to export YouTube cookies:</div>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px]">
                <li>Use a browser extension such as <strong className="text-slate-200">Get cookies.txt LOCALLY</strong>.</li>
                <li>While logged into YouTube in your browser, export your cookies file.</li>
                <li>Copy and paste the Netscape formatted text below.</li>
              </ol>
            </div>

            {cookieStatus?.hasCookies && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Active cookies loaded ({cookieStatus.validCookieLines} directives)</span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCookies}
                  className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-semibold border border-rose-500/30 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Paste cookies.txt contents:
              </label>
              <textarea
                value={cookieText}
                onChange={(e) => setCookieText(e.target.value)}
                placeholder="# Netscape HTTP Cookie File&#10;.youtube.com&#9;TRUE&#9;/&#9;TRUE&#9;1780000000&#9;VISITOR_INFO1_LIVE&#9;..."
                rows={6}
                className="w-full p-3 rounded-xl bg-[#090b12] border border-[#22273e] text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 resize-none"
              />
            </div>

            {cookieSaveMsg && (
              <div className={`p-2.5 rounded-lg text-xs font-medium ${
                cookieSaveMsg.startsWith('Error')
                  ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                  : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
              }`}>
                {cookieSaveMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCookieModal(false);
                  setCookieSaveMsg('');
                }}
                className="px-4 py-2 rounded-xl bg-[#161a2b] hover:bg-[#1f243c] text-xs font-semibold text-slate-300 border border-[#252b45] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingCookies || !cookieText.trim()}
                onClick={handleSaveCookies}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-bold text-white shadow-md shadow-violet-600/30 transition-all cursor-pointer"
              >
                {isSavingCookies ? 'Saving...' : 'Save YouTube Cookies'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
