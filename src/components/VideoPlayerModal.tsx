import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  Shield,
  Layers,
  Share2,
} from 'lucide-react';
import { ClipItem } from '../types';

interface VideoPlayerModalProps {
  clip: ClipItem;
  onClose: () => void;
  onOpenEditor?: (clip: ClipItem) => void;
  onOpenPublish?: (clip: ClipItem) => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  clip,
  onClose,
  onOpenEditor,
  onOpenPublish,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [showSafeZone, setShowSafeZone] = useState<boolean>(false);
  const [showHookBanner, setShowHookBanner] = useState<boolean>(true);

  const duration = clip.durationSeconds || 14.4;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Time ticker simulation if real video is loading/looping
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            return 0; // loop
          }
          return parseFloat((prev + 0.1).toFixed(2));
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration]);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
    }
  };

  // Words breakdown for dynamic caption highlight
  const words = clip.fullText.split(/\s+/);
  const activeWordIndex = Math.min(
    words.length - 1,
    Math.floor((currentTime / duration) * words.length)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative flex flex-col md:flex-row items-center max-w-4xl w-full gap-6">
        {/* Close Button Top Right */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 sm:top-2 sm:-right-12 p-2 rounded-full bg-[#181c2c] hover:bg-[#252a40] text-slate-300 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 9:16 Vertical Phone Mockup Container */}
        <div className="relative w-[300px] sm:w-[330px] h-[580px] sm:h-[620px] rounded-[36px] bg-black border-4 border-[#2c3046] shadow-2xl overflow-hidden flex flex-col justify-between shrink-0 ring-1 ring-violet-500/20">
          {/* Top Speaker / Dynamic Island bar */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-4 rounded-full bg-black/80 z-30" />

          {/* Background Video / Scene Layer */}
          <div className="absolute inset-0 z-0">
            <video
              ref={videoRef}
              src={clip.videoUrl}
              autoPlay
              muted={isMuted}
              loop
              playsInline
              className="w-full h-full object-cover"
              onError={(e) => {
                // Graceful fallback if cloud video is offline
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            {/* Fallback image layer */}
            <img
              src={clip.thumbnailUrl}
              alt={clip.title}
              className="absolute inset-0 w-full h-full object-cover -z-10 brightness-95"
            />
          </div>

          {/* Safe Margins Overlay (Simulates Instagram/TikTok/Shorts UI buttons) */}
          {showSafeZone && (
            <div className="absolute inset-0 z-20 pointer-events-none border-2 border-dashed border-yellow-400/60 p-4 flex flex-col justify-between">
              <div className="bg-yellow-400/20 text-yellow-300 text-[10px] font-mono px-2 py-0.5 rounded self-center">
                SAFE ZONE BOUNDARY (9:16)
              </div>
              {/* Right side icons safe area indicator */}
              <div className="self-end space-y-4 text-white/50 text-[10px] text-right pr-1">
                <div className="w-8 h-8 rounded-full bg-white/20 border border-white/40 flex items-center justify-center">❤</div>
                <div className="w-8 h-8 rounded-full bg-white/20 border border-white/40 flex items-center justify-center">💬</div>
                <div className="w-8 h-8 rounded-full bg-white/20 border border-white/40 flex items-center justify-center">↗</div>
              </div>
              <div className="bg-yellow-400/20 text-yellow-300 text-[9px] font-mono px-2 py-0.5 rounded text-center">
                Bottom Navigation Bar Danger Zone
              </div>
            </div>
          )}

          {/* Top Header Overlay inside player */}
          <div className="relative z-10 p-4 pt-7 flex items-center justify-between">
            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-violet-600/90 text-white shadow-md">
              CLIP #{clip.clipNumber} • {duration.toFixed(1)}s
            </span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/90 text-white shadow-md">
              AI Score: {clip.aiViralScore}/100
            </span>
          </div>

          {/* Top Hook Banner (If enabled) */}
          {showHookBanner && (
            <div className="relative z-10 mx-3 p-2.5 rounded-xl bg-black/75 backdrop-blur-md border border-white/15 text-center shadow-lg animate-in slide-in-from-top-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 block">
                VIRAL HOOK:
              </span>
              <p className="text-xs font-bold text-white mt-0.5 leading-snug">
                "{clip.hook}"
              </p>
            </div>
          )}

          {/* Center Play/Pause tap target */}
          <div
            onClick={togglePlay}
            className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer"
          >
            {!isPlaying && (
              <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white shadow-2xl">
                <Play className="w-6 h-6 fill-white ml-0.5" />
              </div>
            )}
          </div>

          {/* Dynamic Captions Area */}
          <div
            className={`relative z-10 p-4 ${
              clip.captionPosition === 'top'
                ? 'mb-auto'
                : clip.captionPosition === 'middle'
                ? 'my-auto'
                : 'mt-auto pb-6'
            }`}
          >
            <div
              className={`p-3 rounded-xl text-center backdrop-blur-md ${
                clip.captionStyle === 'bold'
                  ? 'bg-black/80 border-2 border-violet-500/60'
                  : clip.captionStyle === 'minimal'
                  ? 'bg-black/50 border border-white/10'
                  : 'bg-black/75 border border-white/20'
              }`}
            >
              <p className="text-xs font-bold leading-relaxed text-white">
                {words.map((w, idx) => {
                  const isActive = idx === activeWordIndex;
                  return (
                    <span
                      key={idx}
                      className={`inline-block mr-1 transition-all ${
                        isActive
                          ? 'text-yellow-300 scale-110 underline decoration-violet-400 font-extrabold'
                          : 'text-slate-200'
                      }`}
                    >
                      {w}
                    </span>
                  );
                })}
              </p>
            </div>

            {/* Watermark */}
            {clip.watermarkEnabled && (
              <div className="text-center mt-2">
                <span className="text-[10px] text-white/70 font-mono tracking-wider bg-black/40 px-2 py-0.5 rounded">
                  {clip.watermarkText}
                </span>
              </div>
            )}
          </div>

          {/* Bottom Video Progress Scrubbing Line */}
          <div className="relative z-10 w-full bg-white/20 h-1">
            <div
              className="bg-violet-500 h-full transition-all"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>
        </div>

        {/* Right Details & Controls Sidebar */}
        <div className="grow max-w-md w-full bg-[#111420] border border-[#212437] rounded-2xl p-5 space-y-4 text-slate-200">
          <div className="border-b border-[#202336] pb-3">
            <span className="text-[11px] font-bold text-violet-400 uppercase tracking-wider">
              Vertical 9:16 Preview Player
            </span>
            <h3 className="text-lg font-bold text-white mt-0.5">{clip.title}</h3>
            <p className="text-xs text-slate-400 mt-1">{clip.description}</p>
          </div>

          {/* Player Controls */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#151826] border border-[#23273c]">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="p-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
              </button>
              <button
                onClick={() => setCurrentTime(0)}
                className="p-2 rounded-lg bg-[#1e2235] hover:bg-[#282d46] text-slate-300 transition-colors"
                title="Restart"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-lg bg-[#1e2235] hover:bg-[#282d46] text-slate-300 transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            <span className="font-mono text-xs text-violet-300">
              {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
            </span>
          </div>

          {/* Preview Toggles */}
          <div className="space-y-2 text-xs">
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#151826] border border-[#23273c] cursor-pointer">
              <span className="flex items-center gap-2 text-slate-300 font-medium">
                <Shield className="w-4 h-4 text-yellow-400" />
                <span>Platform Safe Zones Overlay</span>
              </span>
              <input
                type="checkbox"
                checked={showSafeZone}
                onChange={(e) => setShowSafeZone(e.target.checked)}
                className="rounded text-violet-600 focus:ring-violet-500 bg-[#0d0f17] border-[#2c3044]"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#151826] border border-[#23273c] cursor-pointer">
              <span className="flex items-center gap-2 text-slate-300 font-medium">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span>Show Opening Hook Banner</span>
              </span>
              <input
                type="checkbox"
                checked={showHookBanner}
                onChange={(e) => setShowHookBanner(e.target.checked)}
                className="rounded text-violet-600 focus:ring-violet-500 bg-[#0d0f17] border-[#2c3044]"
              />
            </label>
          </div>

          {/* Suggested Caption */}
          <div className="p-3 rounded-xl bg-[#151826] border border-[#23273c] space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Suggested Caption & Hashtags
            </span>
            <p className="text-xs text-slate-300 italic">{clip.suggestedCaption}</p>
            <div className="flex flex-wrap gap-1 text-[11px] text-indigo-400 font-mono">
              {clip.hashtags.map((h, i) => (
                <span key={i}>{h}</span>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 pt-2">
            {onOpenEditor && (
              <button
                onClick={() => {
                  onClose();
                  onOpenEditor(clip);
                }}
                className="grow py-2.5 rounded-xl bg-[#1c2032] hover:bg-[#252b42] text-xs font-semibold text-white border border-[#2d324b] transition-colors"
              >
                Open in Editor
              </button>
            )}
            {onOpenPublish && (
              <button
                onClick={() => {
                  onClose();
                  onOpenPublish(clip);
                }}
                className="grow py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-bold text-white transition-colors"
              >
                Publish Clip
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
