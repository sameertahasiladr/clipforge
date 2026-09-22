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
  onClipsGenerated: (project: ProjectItem, clips: ClipItem[]) => void;
}

export const CreateClipsView: React.FC<CreateClipsViewProps> = ({ onClipsGenerated }) => {
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

  const analysisSteps = [
    'Fetching public video metadata...',
    'Extracting audio & speech transcript...',
    'Detecting scene transitions & camera cuts...',
    'Detecting active speakers & face coordinates...',
    'Analyzing speech cadence & rhetorical emphasis...',
    'Identifying high-retention narrative moments...',
    'Extracting 3-second opening hook triggers...',
    'Detecting emotional peaks & tone inflection...',
    'Detecting high information density clusters...',
    'Computing AI Viral Potential Score (0–100)...',
    'Generating 9:16 vertical clips with animated subtitles...',
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
    setProgressPercent(8);
    setCurrentStepIndex(0);

    // Simulate animated step progression for rich UX while calling backend API
    const interval = setInterval(() => {
      setProgressPercent((prev) => {
        if (prev >= 92) return prev;
        const next = prev + Math.floor(Math.random() * 9 + 4);
        const stepIdx = Math.min(
          analysisSteps.length - 1,
          Math.floor((next / 100) * analysisSteps.length)
        );
        setCurrentStepIndex(stepIdx);
        return next;
      });
    }, 450);

    try {
      const response = await apiClient.analyzeVideo({
        youtubeUrl: youtubeUrl.trim(),
        clipsCount,
        durationSeconds,
        aspectRatio,
        captionStyle,
        language,
        hasUserConfirmedRights: hasConfirmedRights,
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
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <Sparkles className="w-6 h-6 text-violet-400" />
          <span>Create Viral Clips</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Paste a public YouTube link. ClipForge AI extracts 10–15 short 9:16 clips scored for maximum retention.
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
              AI Video Pipeline In Progress
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

          {/* Disclaimer on AI Scoring */}
          <div className="p-3.5 rounded-xl bg-[#161a29] border border-[#23273c] max-w-lg mx-auto text-left flex items-start gap-2.5 text-xs text-slate-400">
            <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <span>
              <strong className="text-slate-200">AI Viral Potential Score (0–100):</strong> Ranks clips
              using opening curiosity, emotional intensity, information density, and audience shareability.
              (Note: internal retention score, not a guaranteed virality promise).
            </span>
          </div>
        </div>
      ) : (
        <form onSubmit={handleStartAnalysis} className="space-y-6">
          {/* YouTube URL Input Card */}
          <div className="p-6 rounded-2xl bg-[#111420] border border-[#212437] space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Paste a public YouTube URL
              </label>
              <div className="relative">
                <Video className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="url"
                  required
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=example"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0d0f17] border border-[#25283b] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
                />
              </div>
            </div>

            {/* Quick preset examples */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-slate-500 font-medium">Or try preset:</span>
              {presetExamples.map((ex, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setYoutubeUrl(ex.url)}
                  className="px-2.5 py-1 rounded-lg bg-[#181c2c] hover:bg-[#202538] text-violet-300 border border-[#262b40] transition-colors"
                >
                  {ex.title}
                </button>
              ))}
            </div>

            {/* Copyright Rights Confirmation */}
            <div className="pt-2 border-t border-[#1e2235]">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasConfirmedRights}
                  onChange={(e) => setHasConfirmedRights(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-violet-600 focus:ring-violet-500 bg-[#0d0f17] border-[#2c3044]"
                />
                <span className="text-xs text-slate-300 leading-snug">
                  <strong>Content Rights Confirmation:</strong> Only upload or process content you own
                  or have permission to use. ClipForge AI enforces respectful copyright compliance.
                </span>
              </label>
            </div>
          </div>

          {/* Configuration Settings Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Number of Clips */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <label className="block text-xs font-bold text-slate-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-400" />
                <span>Number of Generated Clips</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[10, 12, 15].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setClipsCount(num)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                      clipsCount === num
                        ? 'bg-violet-600/20 text-violet-300 border-violet-500/50 shadow-sm'
                        : 'bg-[#151826] text-slate-400 border-[#23273c] hover:text-white'
                    }`}
                  >
                    {num} Clips
                  </button>
                ))}
              </div>
            </div>

            {/* Clip Duration */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <label className="block text-xs font-bold text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>Target Clip Duration</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[13, 14, 15].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setDurationSeconds(sec)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                      durationSeconds === sec
                        ? 'bg-violet-600/20 text-violet-300 border-violet-500/50 shadow-sm'
                        : 'bg-[#151826] text-slate-400 border-[#23273c] hover:text-white'
                    }`}
                  >
                    {sec} seconds
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <label className="block text-xs font-bold text-slate-300 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-400" />
                <span>Aspect Ratio</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['9:16', '1:1', '16:9'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                      aspectRatio === ratio
                        ? 'bg-violet-600/20 text-violet-300 border-violet-500/50 shadow-sm'
                        : 'bg-[#151826] text-slate-400 border-[#23273c] hover:text-white'
                    }`}
                  >
                    {ratio} {ratio === '9:16' ? '(Vertical)' : ratio === '1:1' ? '(Square)' : '(Landscape)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Platform Presets */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <label className="block text-xs font-bold text-slate-300">
                Optimized Platform Presets
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['Instagram Reels', 'YouTube Shorts', 'Facebook Reels'].map((plat) => (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => handleTogglePlatform(plat)}
                    className={`py-2 px-1 text-center rounded-xl text-[11px] font-semibold border transition-all truncate ${
                      platformPresets.includes(plat)
                        ? 'bg-violet-600/20 text-violet-300 border-violet-500/50 shadow-sm'
                        : 'bg-[#151826] text-slate-400 border-[#23273c] hover:text-white'
                    }`}
                  >
                    {plat}
                  </button>
                ))}
              </div>
            </div>

            {/* Caption Style */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <label className="block text-xs font-bold text-slate-300 flex items-center gap-2">
                <Type className="w-4 h-4 text-pink-400" />
                <span>Caption Style</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['minimal', 'bold', 'dynamic', 'highlight'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setCaptionStyle(st)}
                    className={`py-2 rounded-xl text-xs font-semibold capitalize border transition-all ${
                      captionStyle === st
                        ? 'bg-violet-600/20 text-violet-300 border-violet-500/50 shadow-sm'
                        : 'bg-[#151826] text-slate-400 border-[#23273c] hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <label className="block text-xs font-bold text-slate-300 flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>Audio Language</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {['English', 'Hindi', 'Hinglish', 'Auto Detect'].map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                      language === lang
                        ? 'bg-violet-600/20 text-violet-300 border-violet-500/50 shadow-sm'
                        : 'bg-[#151826] text-slate-400 border-[#23273c] hover:text-white'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Primary Action Button */}
          <div className="flex items-center justify-end">
            <button
              type="submit"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white shadow-xl shadow-violet-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Analyze Video & Generate Clips</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
