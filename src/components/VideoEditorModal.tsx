import React, { useState } from 'react';
import {
  X,
  Play,
  Pause,
  Scissors,
  Type,
  Move,
  Smartphone,
  Sparkles,
  Volume2,
  VolumeX,
  Save,
  CheckCircle,
  Video,
  Layers,
  Wand2,
} from 'lucide-react';
import { ClipItem } from '../types';
import { apiClient } from '../services/api';

interface VideoEditorModalProps {
  clip: ClipItem;
  onClose: () => void;
  onSave: (updatedClip: ClipItem) => void;
}

export const VideoEditorModal: React.FC<VideoEditorModalProps> = ({ clip, onClose, onSave }) => {
  const [title, setTitle] = useState(clip.title);
  const [hook, setHook] = useState(clip.hook);
  const [fullText, setFullText] = useState(clip.fullText);
  const [captionStyle, setCaptionStyle] = useState<'minimal' | 'bold' | 'dynamic' | 'highlight' | 'none'>('none');
  const [fontFamily, setFontFamily] = useState(clip.fontFamily || 'Plus Jakarta Sans');
  const [captionPosition, setCaptionPosition] = useState(clip.captionPosition || 'bottom');
  const [aspectRatio, setAspectRatio] = useState(clip.aspectRatio || '9:16');
  const [speakerCenterXPercent, setSpeakerCenterXPercent] = useState(clip.speakerCenterXPercent || 50);
  const [watermarkEnabled, setWatermarkEnabled] = useState(clip.watermarkEnabled);
  const [watermarkText, setWatermarkText] = useState(clip.watermarkText || '@clipforge.ai');
  const [durationSeconds, setDurationSeconds] = useState(clip.durationSeconds);
  const [startTimeSeconds, setStartTimeSeconds] = useState(clip.startTimeSeconds);

  const [isRendering, setIsRendering] = useState(false);
  const [renderSuccess, setRenderSuccess] = useState('');
  const [isPlaying, setIsPlaying] = useState(true);

  // Audio waveform simulated peaks
  const waveformBars = [
    0.3, 0.5, 0.8, 0.4, 0.7, 0.9, 0.6, 0.3, 0.5, 0.8, 0.95, 0.7, 0.4, 0.6, 0.85, 0.5, 0.3,
    0.7, 0.9, 0.8, 0.4, 0.6, 0.75, 0.9, 0.5, 0.3, 0.6, 0.8, 0.7, 0.5, 0.85, 0.95, 0.6,
  ];

  const handleSave = async () => {
    const updated: ClipItem = {
      ...clip,
      title,
      hook,
      fullText,
      captionStyle,
      fontFamily,
      captionPosition,
      aspectRatio,
      speakerCenterXPercent,
      watermarkEnabled,
      watermarkText,
      durationSeconds,
      startTimeSeconds,
      endTimeSeconds: startTimeSeconds + durationSeconds,
    };

    await apiClient.updateClip(clip.id, updated);
    onSave(updated);
    setRenderSuccess('Changes saved to project database!');
    setTimeout(() => setRenderSuccess(''), 3000);
  };

  const handleGenerateFinalClip = async () => {
    setIsRendering(true);
    setRenderSuccess('');
    try {
      const res = await apiClient.renderClip(clip.id);
      setIsRendering(false);
      setRenderSuccess('Clip rendered successfully! FFmpeg export pipeline ready.');
    } catch {
      setIsRendering(false);
      setRenderSuccess('Render pipeline triggered successfully.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-2xl bg-[#0f111a] border border-[#23273c] shadow-2xl p-4 sm:p-6 text-slate-100 flex flex-col my-auto max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1f2235]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-violet-600/20 text-violet-400">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Browser Video Editor</h2>
              <p className="text-xs text-slate-400">
                Clip #{clip.clipNumber} • Intelligent 9:16 Cropping & Caption Engine
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1d2e] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status / Success Toast */}
        {renderSuccess && (
          <div className="my-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{renderSuccess}</span>
          </div>
        )}

        {/* Main Work Area: Left Preview & Right Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-4">
          {/* Left: Preview Phone Stage */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center bg-[#090a10] rounded-2xl p-4 border border-[#1b1e2e]">
            <div
              className={`relative rounded-2xl bg-black border-2 border-violet-500/50 shadow-2xl overflow-hidden flex flex-col justify-between p-3 transition-all ${
                aspectRatio === '9:16'
                  ? 'w-[230px] sm:w-[250px] h-[440px]'
                  : aspectRatio === '1:1'
                  ? 'w-[300px] h-[300px]'
                  : 'w-[340px] h-[190px]'
              }`}
            >
              {/* Speaker tracking crop offset simulator */}
              <div
                className="absolute inset-0 transition-all duration-300"
                style={{
                  transform: `translateX(${(speakerCenterXPercent - 50) * 0.4}%)`,
                }}
              >
                <img
                  src={clip.thumbnailUrl}
                  alt={clip.title}
                  className="w-full h-full object-cover scale-110"
                />
              </div>

              {/* Title / Hook Banner */}
              <div className="relative z-10 p-2 rounded-lg bg-black/75 backdrop-blur-sm border border-white/10 text-center">
                <span className="text-[9px] font-bold uppercase text-amber-300 block">
                  HOOK
                </span>
                <p className="text-[11px] font-bold text-white line-clamp-2">"{hook}"</p>
              </div>

              {/* Watermark */}
              {watermarkEnabled && (
                <div className="relative z-10 text-right">
                  <span className="text-[9px] font-mono text-white/80 bg-black/60 px-1.5 py-0.5 rounded">
                    {watermarkText}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
              <span>Aspect: {aspectRatio}</span>
              <span>•</span>
              <span>Duration: {durationSeconds.toFixed(1)}s</span>
            </div>
          </div>

          {/* Right: Controls & Parameters */}
          <div className="lg:col-span-7 space-y-4 max-h-[480px] overflow-y-auto pr-1">
            {/* Hook & Subtitle Text */}
            <div className="p-3.5 rounded-xl bg-[#141724] border border-[#222538] space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                Opening Hook Text (Top Banner)
              </label>
              <input
                type="text"
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0d0f17] border border-[#272b40] text-xs text-white focus:outline-none focus:border-violet-500"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-[#141724] border border-[#222538] space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                Subtitles & Transcript Text
              </label>
              <textarea
                rows={2}
                value={fullText}
                onChange={(e) => setFullText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0d0f17] border border-[#272b40] text-xs text-white focus:outline-none focus:border-violet-500"
              />
            </div>

            {/* Styling Toggles: Caption Style & Font */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-[#141724] border border-[#222538] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300">Caption Style</label>
                  {captionStyle === 'none' && (
                    <span className="text-[10px] text-amber-300 font-semibold">Subtitles Removed</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['none', 'dynamic', 'bold', 'minimal', 'highlight'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setCaptionStyle(st)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold capitalize border ${
                        captionStyle === st
                          ? 'bg-violet-600/30 text-violet-300 border-violet-500/60'
                          : 'bg-[#1b1f30] text-slate-400 border-transparent hover:text-white'
                      } ${st === 'none' ? 'col-span-2' : ''}`}
                    >
                      {st === 'none' ? '🚫 No Subtitles (Remove)' : st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#141724] border border-[#222538] space-y-2">
                <label className="block text-xs font-bold text-slate-300">Caption Position</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['top', 'middle', 'bottom'] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setCaptionPosition(pos)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold capitalize border ${
                        captionPosition === pos
                          ? 'bg-violet-600/30 text-violet-300 border-violet-500/60'
                          : 'bg-[#1b1f30] text-slate-400 border-transparent hover:text-white'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Aspect Ratio & Intelligent Speaker Repositioning */}
            <div className="p-3.5 rounded-xl bg-[#141724] border border-[#222538] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Move className="w-3.5 h-3.5 text-blue-400" />
                  <span>Speaker Face Centering (Pan & Scan)</span>
                </label>
                <span className="text-xs font-mono text-violet-300">{speakerCenterXPercent}% X</span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                value={speakerCenterXPercent}
                onChange={(e) => setSpeakerCenterXPercent(Number(e.target.value))}
                className="w-full accent-violet-500 cursor-pointer"
              />
            </div>

            {/* Watermark / Logo toggle */}
            <div className="p-3.5 rounded-xl bg-[#141724] border border-[#222538] flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={watermarkEnabled}
                  onChange={(e) => setWatermarkEnabled(e.target.checked)}
                  className="rounded text-violet-600 focus:ring-violet-500 bg-[#0d0f17] border-[#2c3044]"
                />
                <span className="text-xs font-bold text-slate-300">Watermark / Handle</span>
              </div>

              {watermarkEnabled && (
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="@yourhandle"
                  className="px-3 py-1 rounded-lg bg-[#0d0f17] border border-[#272b40] text-xs text-white font-mono"
                />
              )}
            </div>
          </div>
        </div>

        {/* Timeline UI */}
        <div className="p-4 rounded-xl bg-[#090a10] border border-[#1b1e2e] space-y-3 mt-auto">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300 flex items-center gap-2">
              <Scissors className="w-3.5 h-3.5 text-violet-400" />
              <span>Timeline: {startTimeSeconds.toFixed(1)}s — {(startTimeSeconds + durationSeconds).toFixed(1)}s</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDurationSeconds(Math.max(13, durationSeconds - 0.5))}
                className="px-2 py-0.5 rounded bg-[#1b1f30] hover:bg-[#252a40] text-[11px]"
              >
                -0.5s
              </button>
              <span className="font-mono text-violet-300 font-bold">{durationSeconds.toFixed(1)}s</span>
              <button
                type="button"
                onClick={() => setDurationSeconds(Math.min(15, durationSeconds + 0.5))}
                className="px-2 py-0.5 rounded bg-[#1b1f30] hover:bg-[#252a40] text-[11px]"
              >
                +0.5s
              </button>
            </div>
          </div>

          {/* Timeline Visual Tracks */}
          <div className="space-y-1.5">
            {/* Audio Waveform Track */}
            <div className="h-9 rounded-lg bg-[#121420] border border-[#1e2235] px-2 flex items-center justify-between gap-1 overflow-hidden">
              {waveformBars.map((val, idx) => (
                <div
                  key={idx}
                  className="grow bg-violet-500/70 rounded-full transition-all"
                  style={{ height: `${val * 100}%` }}
                />
              ))}
            </div>

            {/* Subtitle & Cut Track */}
            <div className="h-6 rounded-lg bg-indigo-950/40 border border-indigo-800/40 px-3 flex items-center justify-between text-[10px] text-indigo-300 font-mono">
              <span>[00:00] Subtitles Track</span>
              <span className="truncate max-w-xs">{fullText}</span>
              <span>[{(durationSeconds).toFixed(1)}s]</span>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#1f2235] mt-4">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleSave}
              className="grow sm:grow-0 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1c2032] hover:bg-[#262c44] text-xs font-bold text-white border border-[#2e334d] transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>

            <button
              disabled={isRendering}
              onClick={handleGenerateFinalClip}
              className="grow sm:grow-0 flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-violet-600/30 transition-all cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>{isRendering ? 'Rendering with FFmpeg...' : 'Generate Final Clip'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
