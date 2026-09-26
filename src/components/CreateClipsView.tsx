import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Video,
  Layers,
  Clock,
  Smartphone,
  Type,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  UploadCloud,
  FileVideo,
  X,
  ArrowRight,
  Check,
  Search,
  Compass,
  ExternalLink,
  Eye,
  Loader2,
  Tv,
  Cookie,
} from 'lucide-react';
import { apiClient } from '../services/api';
import { ClipItem, ProjectItem, YouTubeSearchResult, ProcessingJobStatus, CookieInfo } from '../types';
import { YouTubeCookiesModal } from './YouTubeCookiesModal';

interface CreateClipsViewProps {
  onClipsGenerated: (project: ProjectItem, clips: ClipItem[]) => void;
}

export const CreateClipsView: React.FC<CreateClipsViewProps> = ({
  onClipsGenerated,
}) => {
  const [sourceMode, setSourceMode] = useState<'search' | 'youtube' | 'upload'>('search');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // YouTube Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [selectedSearchVideo, setSelectedSearchVideo] = useState<YouTubeSearchResult | null>(null);
  const [searchApiUsed, setSearchApiUsed] = useState<string>('');
  const [hasSearched, setHasSearched] = useState(false);
  const [searchNotice, setSearchNotice] = useState<string>('');

  const [clipsCount, setClipsCount] = useState<number>(5);
  const [clipsCountInput, setClipsCountInput] = useState<string>('5');
  const [durationSeconds, setDurationSeconds] = useState<number>(30);
  const [quality, setQuality] = useState<'1080p' | '720p'>('1080p');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [platformPresets, setPlatformPresets] = useState<string[]>([
    'Instagram Reels',
    'YouTube Shorts',
    'Facebook Reels',
  ]);
  const [captionStyle, setCaptionStyle] = useState<'minimal' | 'bold' | 'dynamic' | 'highlight' | 'none'>('none');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>('English');
  const [hasConfirmedRights, setHasConfirmedRights] = useState<boolean>(true);

  // YouTube Cookies State
  const [isCookiesModalOpen, setIsCookiesModalOpen] = useState<boolean>(false);
  const [cookieInfo, setCookieInfo] = useState<CookieInfo | null>(null);

  useEffect(() => {
    apiClient.getYouTubeCookies().then((res) => {
      if (res?.success && res.cookies) {
        setCookieInfo(res.cookies);
      }
    }).catch(() => {});
  }, []);

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // 9 Canonical Pipeline Steps: Video acquired once -> local audio extraction -> Gemini transcription -> FFmpeg cuts
  const analysisSteps = [
    'Validating public video URL...',
    'Checking video accessibility...',
    'Acquiring source video once (source.mp4)...',
    'Verifying video streams with FFprobe...',
    'Extracting dialogue track locally with FFmpeg...',
    'Transcribing speech with word-level timestamps...',
    'Analyzing viral hooks & retention velocity with Gemini...',
    'Rendering vertical 9:16 clips from acquired source video...',
    'Finalizing clean HD MP4 renders without subtitles...',
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

  const keywordChips = [
    'AI & Tech Talks',
    'Podcasts',
    'Startup Tactics',
    'Interviews',
    'Fitness & Health',
    'TEDx Talks',
  ];

  const channelChips = [
    { label: '@TEDx', query: '@TEDx' },
    { label: '@hubermanlab', query: '@hubermanlab' },
    { label: '@lexfridman', query: '@lexfridman' },
    { label: '@TED', query: '@TED' },
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

  // Perform search via YouTube Data API
  const handleExecuteSearch = async (queryOverride?: string) => {
    const q = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    if (!q) {
      setSearchNotice('Please enter keywords or a channel URL/handle.');
      return;
    }

    // If query is a direct video link, auto-select it
    if (q.includes('youtube.com/watch') || q.includes('youtu.be/')) {
      setYoutubeUrl(q);
      setSourceMode('youtube');
      return;
    }

    setIsSearching(true);
    setSearchNotice('');
    setErrorMessage('');
    setHasSearched(true);

    try {
      const data = await apiClient.searchYouTube(q, 12);
      setSearchResults(data.results || []);
      setSearchApiUsed(data.apiUsed || '');
      if (!data.results || data.results.length === 0) {
        setSearchNotice(`No videos found for "${q}". Try another keyword or channel.`);
      }
    } catch (err: any) {
      console.warn('Search error:', err);
      setSearchNotice(err.message || 'Failed to search YouTube. Please check network.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectVideo = (video: YouTubeSearchResult) => {
    setSelectedSearchVideo(video);
    setYoutubeUrl(video.url);
    setErrorMessage('');
    setErrorCode(null);
  };

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();

    let targetUrl = youtubeUrl.trim();

    if (sourceMode === 'search') {
      if (!targetUrl && selectedSearchVideo) {
        targetUrl = selectedSearchVideo.url;
      }
      if (!targetUrl) {
        setErrorMessage('Please select a video from the search results below or enter a URL.');
        return;
      }
    } else if (sourceMode === 'youtube') {
      if (!targetUrl) {
        setErrorMessage('Please enter a valid public YouTube URL.');
        return;
      }
    } else if (sourceMode === 'upload') {
      if (!selectedFile) {
        setErrorMessage('Please select an MP4, MOV, or WebM video file to upload.');
        return;
      }
    }

    if (!hasConfirmedRights) {
      setErrorMessage('You must confirm content rights permission before analyzing this video.');
      return;
    }

    setErrorMessage('');
    setErrorCode(null);
    setIsProcessing(true);
    setProgressPercent(10);
    setCurrentStepIndex(0);
    setStatusMessage('Initiating video processing pipeline...');

    const handleProgressUpdate = (job: ProcessingJobStatus) => {
      if (typeof job.stepIndex === 'number') {
        setCurrentStepIndex(Math.min(analysisSteps.length - 1, job.stepIndex));
      }
      if (job.statusMessage) {
        setStatusMessage(job.statusMessage);
      }
      if (typeof job.progressPercent === 'number') {
        setProgressPercent(job.progressPercent);
      } else if (job.totalSteps > 0) {
        let pct = Math.round(((job.stepIndex + 1) / job.totalSteps) * 100);
        if ((job.state === 'RENDERING' || job.state === 'CLIPS_RENDERING') && job.totalClipsToRender > 0) {
          const renderFraction = Math.min(1, job.renderedClipsCount / job.totalClipsToRender);
          pct = Math.round(75 + renderFraction * 23);
        }
        setProgressPercent(Math.min(99, Math.max(10, pct)));
      }
    };

    try {
      let response;
      const finalCaptionStyle = subtitlesEnabled ? captionStyle : 'none';
      if (sourceMode === 'upload' && selectedFile) {
        const formData = new FormData();
        formData.append('videoFile', selectedFile);
        formData.append('clipsCount', String(clipsCount));
        formData.append('durationSeconds', String(durationSeconds));
        formData.append('aspectRatio', aspectRatio);
        formData.append('captionStyle', finalCaptionStyle);
        formData.append('language', language);
        formData.append('quality', quality);
        formData.append('hasUserConfirmedRights', String(hasConfirmedRights));

        response = await apiClient.uploadAndAnalyzeVideo(formData, handleProgressUpdate);
      } else {
        response = await apiClient.analyzeVideo(
          {
            youtubeUrl: targetUrl,
            clipsCount,
            durationSeconds,
            aspectRatio,
            captionStyle: finalCaptionStyle,
            language,
            quality,
            hasUserConfirmedRights: hasConfirmedRights,
          },
          handleProgressUpdate
        );
      }

      setProgressPercent(100);
      setCurrentStepIndex(analysisSteps.length - 1);
      setStatusMessage('Completed! Loading generated viral clips...');

      setTimeout(() => {
        setIsProcessing(false);
        onClipsGenerated(response.project, response.clips);
      }, 500);
    } catch (err: any) {
      setIsProcessing(false);
      setErrorCode(err?.code || null);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "We couldn't process this video. Please verify the source and content rights."
      );
    }
  };

  const formatViewCount = (count?: number) => {
    if (!count) return null;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K views`;
    return `${count} views`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in pb-12">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-violet-400" />
            <span>Create Viral Clips</span>
          </h1>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-violet-500/10 text-violet-300 border-violet-500/30 items-center gap-1.5">
              <Tv className="w-3 h-3 text-violet-400" />
              <span>YouTube Data API</span>
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-bold border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
              Pipeline Active
            </span>
          </div>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Search videos with YouTube Data API, paste a link, or upload directly. ClipForge AI extracts audio, transcribes speech, and renders 10–15 vertical short clips.
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
              {statusMessage || analysisSteps[currentStepIndex]}
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
          <div className="p-4 sm:p-6 rounded-2xl bg-[#111420] border border-[#212437] space-y-5">
            {/* Mode Switcher Tabs & YouTube Cookies */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1 sm:gap-2 p-1 rounded-xl bg-[#0b0d14] border border-[#1f2337] w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('search');
                    setErrorMessage('');
                  }}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer min-h-[38px] ${
                    sourceMode === 'search'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Search className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                  <span className="truncate">Search</span>
                  <span className="hidden xs:inline-block px-1.5 py-0.5 text-[9px] uppercase font-bold rounded bg-violet-400/20 text-violet-200">
                    API
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('youtube');
                    setErrorMessage('');
                  }}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer min-h-[38px] ${
                    sourceMode === 'youtube'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Video className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="truncate">Paste Link</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('upload');
                    setErrorMessage('');
                  }}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer min-h-[38px] ${
                    sourceMode === 'upload'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                  <span className="truncate">Upload</span>
                  <span className="hidden xs:inline-block px-1.5 py-0.5 text-[9px] uppercase font-bold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Direct
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsCookiesModalOpen(true)}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer min-h-[38px] w-full sm:w-auto ${
                  cookieInfo?.configured
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                    : 'bg-[#0b0d14] border-[#1f2337] text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
                title="Configure YouTube Cookies to prevent bot verification and rate limit blocks"
              >
                <Cookie className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>YouTube Cookies</span>
                {cookieInfo?.configured ? (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                    Setup
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1: Search YouTube directly via YouTube Data API */}
            {sourceMode === 'search' && (
              <div className="space-y-4">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                      Search YouTube by Keywords or Channel
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Supports keywords & channel handles (e.g. @TEDx)
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1 flex items-center min-w-0">
                      <div className="absolute left-3.5 pointer-events-none text-slate-500">
                        <Search className="w-4 h-4 text-violet-400" />
                      </div>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleExecuteSearch();
                          }
                        }}
                        placeholder="Search keywords (e.g., 'AI podcast') or handle (@hubermanlab)..."
                        className="w-full pl-10 pr-9 py-3 rounded-xl bg-[#0b0d14] border border-[#23273c] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 p-1 rounded-md text-slate-500 hover:text-slate-300"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isSearching}
                      onClick={() => handleExecuteSearch()}
                      className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm shrink-0 min-h-[44px]"
                    >
                      {isSearching ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Searching...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4" />
                          <span>Search</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Popular Keyword & Channel Suggestions */}
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 font-medium mr-1 flex items-center gap-1">
                      <Compass className="w-3 h-3 text-slate-400" />
                      <span>Topics:</span>
                    </span>
                    {keywordChips.map((chip, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setSearchQuery(chip);
                          handleExecuteSearch(chip);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#161a29] hover:bg-[#1f2438] text-[11px] font-medium text-slate-300 border border-[#24293f] transition-colors cursor-pointer"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 font-medium mr-1 flex items-center gap-1">
                      <Tv className="w-3 h-3 text-slate-400" />
                      <span>Channels:</span>
                    </span>
                    {channelChips.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setSearchQuery(c.query);
                          handleExecuteSearch(c.query);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#151b2e] hover:bg-[#1f2946] text-[11px] font-semibold text-violet-300 border border-violet-500/20 transition-colors cursor-pointer"
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Video Preview Banner */}
                {selectedSearchVideo && (
                  <div className="p-4 rounded-xl bg-violet-950/30 border border-violet-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="relative w-24 h-14 rounded-lg overflow-hidden bg-black shrink-0 border border-violet-500/30">
                        <img
                          src={selectedSearchVideo.thumbnailUrl}
                          alt={selectedSearchVideo.title}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">
                          {selectedSearchVideo.durationFormatted}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Selected for AI Clipping</span>
                        </div>
                        <h4 className="text-sm font-semibold text-white truncate max-w-md mt-0.5">
                          {selectedSearchVideo.title}
                        </h4>
                        <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{selectedSearchVideo.channelTitle}</span>
                          {selectedSearchVideo.viewCount && (
                            <>
                              <span>•</span>
                              <span>{formatViewCount(selectedSearchVideo.viewCount)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSearchVideo(null);
                          setYoutubeUrl('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#161a29] hover:bg-[#20263b] text-slate-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                )}

                {/* Search Notice / Empty / Error */}
                {searchNotice && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>{searchNotice}</span>
                  </div>
                )}

                {/* Search Results Grid */}
                {searchResults.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">
                        Search Results ({searchResults.length} videos found)
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {searchApiUsed === 'youtube_data_api_v3'
                          ? 'via YouTube Data API v3'
                          : 'via YouTube Indexing'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
                      {searchResults.map((video) => {
                        const isSelected =
                          selectedSearchVideo?.id === video.id || youtubeUrl === video.url;
                        return (
                          <div
                            key={video.id}
                            onClick={() => handleSelectVideo(video)}
                            className={`group p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? 'bg-violet-900/30 border-violet-500 shadow-md ring-1 ring-violet-500'
                                : 'bg-[#0e111d] hover:bg-[#15192b] border-[#1f243b] hover:border-violet-500/50'
                            }`}
                          >
                            <div className="space-y-2">
                              {/* Thumbnail */}
                              <div className="relative aspect-video rounded-lg overflow-hidden bg-black/60">
                                <img
                                  src={video.thumbnailUrl}
                                  alt={video.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  loading="lazy"
                                />
                                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-[10px] font-mono text-white">
                                  {video.durationFormatted}
                                </span>
                                {isSelected && (
                                  <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-violet-600 border border-white flex items-center justify-center text-white shadow-md">
                                    <Check className="w-3.5 h-3.5" />
                                  </div>
                                )}
                              </div>

                              {/* Title & Channel */}
                              <div>
                                <h4
                                  className="text-xs font-bold text-white line-clamp-2 group-hover:text-violet-200 transition-colors leading-snug"
                                  title={video.title}
                                >
                                  {video.title}
                                </h4>
                                <div className="text-[11px] text-slate-400 mt-1 truncate">
                                  {video.channelTitle}
                                </div>
                                {video.viewCount !== undefined && (
                                  <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                                    <Eye className="w-3 h-3" />
                                    <span>{formatViewCount(video.viewCount)}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Select Action */}
                            <div className="pt-2 mt-2 border-t border-[#1e233b] flex items-center justify-between">
                              <span
                                className={`text-[11px] font-semibold ${
                                  isSelected ? 'text-violet-300 font-bold' : 'text-slate-400'
                                }`}
                              >
                                {isSelected ? 'Selected' : 'Use Video'}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isSelected
                                    ? 'bg-violet-600 text-white'
                                    : 'bg-[#1b2034] text-slate-300 group-hover:bg-violet-600 group-hover:text-white transition-colors'
                                }`}
                              >
                                {isSelected ? 'Ready' : 'Select'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Direct YouTube URL Input */}
            {sourceMode === 'youtube' && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                      Public YouTube Video URL
                    </label>
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
            )}

            {/* TAB 3: Direct Video File Upload */}
            {sourceMode === 'upload' && (
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

            {/* Error Display with Try Again and Switch to Direct Upload */}
            {errorMessage && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div className="space-y-1 flex-1">
                    <div className="font-semibold text-rose-200">
                      {errorCode === 'YOUTUBE_VERIFICATION_REQUIRED' ||
                      errorMessage.toLowerCase().includes('not allowing') ||
                      errorMessage.toLowerCase().includes('verification') ||
                      errorMessage.toLowerCase().includes('challenge') ||
                      errorMessage.toLowerCase().includes('bot')
                        ? "YouTube is currently not allowing ClipForge's server to retrieve this video."
                        : errorCode === 'URL_INVALID'
                        ? 'Invalid YouTube URL'
                        : 'Source Acquisition Notice'}
                    </div>
                    <p className="leading-relaxed">
                      {errorCode === 'YOUTUBE_VERIFICATION_REQUIRED' ||
                      errorMessage.toLowerCase().includes('not allowing') ||
                      errorMessage.toLowerCase().includes('verification') ||
                      errorMessage.toLowerCase().includes('challenge') ||
                      errorMessage.toLowerCase().includes('bot')
                        ? "We couldn't access the source from the processing server. You can try again, search for another video, or upload the video directly."
                        : errorMessage}
                    </p>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-rose-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-[11px] text-rose-300/80">
                    Options to proceed:
                  </span>
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setIsCookiesModalOpen(true)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold text-xs transition-colors cursor-pointer min-h-[38px] flex-1 sm:flex-initial"
                    >
                      <Cookie className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{cookieInfo?.configured ? 'Update Cookies' : 'Add Cookies'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleStartAnalysis(e)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#181d2e] hover:bg-[#232940] text-slate-200 border border-slate-700 font-semibold text-xs transition-colors cursor-pointer min-h-[38px] flex-1 sm:flex-initial"
                    >
                      <RotateCw className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Try Again</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSourceMode('search');
                        setErrorMessage('');
                        setErrorCode(null);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#181d2e] hover:bg-[#232940] text-violet-300 border border-violet-500/30 font-semibold text-xs transition-colors cursor-pointer min-h-[38px] flex-1 sm:flex-initial"
                    >
                      <Search className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      <span>Search Others</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSourceMode('upload');
                        setErrorMessage('');
                        setErrorCode(null);
                        setTimeout(() => fileInputRef.current?.click(), 100);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition-colors cursor-pointer shadow-sm min-h-[38px] w-full sm:w-auto"
                    >
                      <UploadCloud className="w-3.5 h-3.5 shrink-0" />
                      <span>Direct Upload</span>
                      <ArrowRight className="w-3 h-3 shrink-0" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Target Clips Count — Editable Number & Slider */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-violet-400" />
                  <span>Clips To Generate</span>
                </label>
                <div className="flex items-center gap-1.5 bg-[#0b0e1b] border border-violet-500/40 rounded-lg px-2.5 py-1 shadow-inner">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={clipsCountInput}
                    onChange={(e) => {
                      const str = e.target.value;
                      setClipsCountInput(str);
                      const val = parseInt(str, 10);
                      if (!isNaN(val) && val >= 1) {
                        setClipsCount(Math.min(30, Math.max(1, val)));
                      }
                    }}
                    onBlur={() => {
                      const val = parseInt(clipsCountInput, 10);
                      if (isNaN(val) || val < 1) {
                        setClipsCount(5);
                        setClipsCountInput('5');
                      } else {
                        const clamped = Math.min(30, Math.max(1, val));
                        setClipsCount(clamped);
                        setClipsCountInput(String(clamped));
                      }
                    }}
                    className="w-12 bg-transparent text-white font-mono font-bold text-center text-sm focus:outline-none"
                  />
                  <span className="text-xs text-violet-300 font-bold">Clips</span>
                </div>
              </div>

              <input
                type="range"
                min={1}
                max={30}
                step={1}
                value={clipsCount}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setClipsCount(val);
                  setClipsCountInput(String(val));
                }}
                className="w-full accent-violet-600 cursor-pointer"
              />

              <div className="flex flex-wrap gap-1.5 pt-1">
                {[1, 3, 5, 8, 10, 15].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setClipsCount(n);
                      setClipsCountInput(String(n));
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer ${
                      clipsCount === n
                        ? 'bg-violet-600 text-white border-violet-500'
                        : 'bg-[#151826] text-slate-400 border-[#222538] hover:text-white'
                    }`}
                  >
                    {n} clips
                  </button>
                ))}
              </div>
            </div>

            {/* Clip Duration — Editable Seconds & Slider */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span>Clip Duration</span>
                </label>
                <div className="flex items-center gap-1.5 bg-[#0b0e1b] border border-indigo-500/40 rounded-lg px-2.5 py-1 shadow-inner">
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={durationSeconds}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setDurationSeconds(Math.min(180, Math.max(5, val)));
                    }}
                    className="w-12 bg-transparent text-white font-mono font-bold text-center text-sm focus:outline-none"
                  />
                  <span className="text-xs text-indigo-300 font-bold">Sec</span>
                </div>
              </div>

              <input
                type="range"
                min={5}
                max={180}
                step={1}
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />

              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { sec: 15, label: '15s (Shorts)' },
                  { sec: 30, label: '30s (Reels)' },
                  { sec: 60, label: '60s (Story)' },
                  { sec: 90, label: '90s (Long)' },
                ].map((item) => (
                  <button
                    key={item.sec}
                    type="button"
                    onClick={() => setDurationSeconds(item.sec)}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      durationSeconds === item.sec
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-[#151826] text-slate-400 border-[#222538] hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Video Quality (1080p vs 720p HD) */}
            <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Video className="w-4 h-4 text-cyan-400" />
                <span>Video Quality</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setQuality('1080p')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    quality === '1080p'
                      ? 'bg-cyan-500/20 border-cyan-500/60 text-white shadow-sm'
                      : 'bg-[#151826] border-[#222538] text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">1080p Full HD</span>
                    {quality === '1080p' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Highest crisp clarity (Recommended)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuality('720p')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    quality === '720p'
                      ? 'bg-cyan-500/20 border-cyan-500/60 text-white shadow-sm'
                      : 'bg-[#151826] border-[#222538] text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">720p HD</span>
                    {quality === '720p' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">High definition, faster download</span>
                </button>
              </div>
            </div>

            {/* Platform Presets */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Optimized Formats</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {['Instagram Reels', 'YouTube Shorts', 'Facebook Reels'].map((p) => {
                  const active = platformPresets.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleTogglePlatform(p)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer min-h-[44px] flex flex-col items-center justify-center ${
                        active
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold'
                          : 'bg-[#151826] border-[#222538] text-slate-400 hover:text-white font-medium'
                      }`}
                    >
                      <span className="text-[11px] block leading-tight">{p}</span>
                      <span className="text-[9px] text-slate-500 mt-0.5">9:16 Vertical</span>
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
              className="mt-1 w-4 h-4 accent-violet-600 rounded cursor-pointer shrink-0"
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
            className="w-full py-3.5 sm:py-4 px-4 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-xs sm:text-sm font-extrabold text-white shadow-xl shadow-violet-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[48px] text-center"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {sourceMode === 'upload'
                ? `Upload & Generate ${clipsCount} Viral Clips`
                : selectedSearchVideo
                ? `Clip "${selectedSearchVideo.title.slice(0, 24)}..." (${clipsCount} Clips)`
                : `Generate ${clipsCount} Viral Short Clips`}
            </span>
          </button>
        </form>
      )}

      {/* YouTube Cookies Configuration Modal */}
      <YouTubeCookiesModal
        isOpen={isCookiesModalOpen}
        onClose={() => setIsCookiesModalOpen(false)}
        onCookiesUpdated={(info) => setCookieInfo(info)}
      />
    </div>
  );
};
