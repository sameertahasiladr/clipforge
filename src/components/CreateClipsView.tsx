import React, { useState } from 'react';
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
} from 'lucide-react';
import { apiClient } from '../services/api';
import { ClipItem, ProjectItem } from '../types';

interface CreateClipsViewProps {
  isDemoMode?: boolean;
  onClipsGenerated: (project: ProjectItem, clips: ClipItem[]) => void;
}

export const CreateClipsView: React.FC<CreateClipsViewProps> = ({
  isDemoMode = true,
  onClipsGenerated,
}) => {
  const [youtubeUrl, setYoutubeUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
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

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;

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
      const response = await apiClient.analyzeVideo({
        youtubeUrl: youtubeUrl.trim(),
        clipsCount,
        durationSeconds,
        aspectRatio,
        captionStyle,
        language,
        hasUserConfirmedRights: hasConfirmedRights,
        mode: isDemoMode ? 'demo' : 'production',
      });

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
          : "We couldn't process this video. Please verify that the video is public and that you have permission to use its content."
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
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold border ${
              isDemoMode
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            }`}
          >
            {isDemoMode ? 'Demo Mode Active' : 'Production Pipeline Active'}
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
          {/* YouTube URL Input Card */}
          <div className="p-6 rounded-2xl bg-[#111420] border border-[#212437] space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Public YouTube Video URL
              </label>
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
                  required
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

            {/* Error Display */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
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
              or have explicit permission to process and repurpose this public YouTube video. ClipForge AI
              respects intellectual property and platform policies.
            </label>
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-sm font-extrabold text-white shadow-xl shadow-violet-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate {clipsCount} Viral Short Clips</span>
          </button>
        </form>
      )}
    </div>
  );
};
