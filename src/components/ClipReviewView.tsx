import React, { useState } from 'react';
import {
  Film,
  Play,
  Edit3,
  Wand2,
  Download,
  Trash2,
  Send,
  CheckSquare,
  Square,
  TrendingUp,
  Clock,
  Sparkles,
  Filter,
  RotateCw,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { ClipItem } from '../types';
import { apiClient } from '../services/api';

interface ClipReviewViewProps {
  clips: ClipItem[];
  onPreviewClip: (clip: ClipItem) => void;
  onEditClip: (clip: ClipItem) => void;
  onRegenerateCaption: (clip: ClipItem) => void;
  onDeleteClip: (clipId: string) => void;
  onPublishClips: (clips: ClipItem[]) => void;
}

export const ClipReviewView: React.FC<ClipReviewViewProps> = ({
  clips,
  onPreviewClip,
  onEditClip,
  onRegenerateCaption,
  onDeleteClip,
  onPublishClips,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0);
  const [renderingClipIds, setRenderingClipIds] = useState<Record<string, number>>({});

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    if (selectedIds.length === filteredClips.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredClips.map((c) => c.id));
    }
  };

  const handleTriggerRender = async (clip: ClipItem) => {
    setRenderingClipIds((prev) => ({ ...prev, [clip.id]: 15 }));

    try {
      await apiClient.renderClip(clip.id);

      // Poll status
      const interval = setInterval(async () => {
        const status = await apiClient.getRenderStatus(clip.id);
        setRenderingClipIds((prev) => ({
          ...prev,
          [clip.id]: status.progressPercent || 80,
        }));

        if (status.status === 'completed' || status.progressPercent >= 100) {
          clearInterval(interval);
          clip.renderStatus = 'completed';
          if (status.videoUrl) clip.videoUrl = status.videoUrl;
          setTimeout(() => {
            setRenderingClipIds((prev) => {
              const updated = { ...prev };
              delete updated[clip.id];
              return updated;
            });
          }, 600);
        }
      }, 750);
    } catch {
      setRenderingClipIds((prev) => {
        const updated = { ...prev };
        delete updated[clip.id];
        return updated;
      });
    }
  };

  const handleDownload = (clip: ClipItem) => {
    const link = document.createElement('a');
    link.href = clip.videoUrl;
    link.download = `clipforge_${clip.clipNumber}_${clip.title.replace(/\s+/g, '_')}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredClips = clips.filter((c) => c.aiViralScore >= minScoreFilter);
  const selectedClips = clips.filter((c) => selectedIds.includes(c.id));

  return (
    <div className="space-y-6 animate-in fade-in pb-16">
      {/* Top Header & Batch Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Film className="w-6 h-6 text-violet-400" />
            <span>Generated Viral Clips ({clips.length})</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Short 13–15 second vertical moments scored for retention, burned with captions, and ready for multi-platform dispatch.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={selectAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#151826] hover:bg-[#1d2133] text-slate-300 border border-[#23273c] transition-colors cursor-pointer"
          >
            {selectedIds.length === filteredClips.length && filteredClips.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-violet-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-500" />
            )}
            <span>Select All ({selectedIds.length}/{filteredClips.length})</span>
          </button>

          <button
            disabled={selectedIds.length === 0}
            onClick={() => onPublishClips(selectedClips)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-md shadow-violet-600/25 transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Publish Multi-Platform ({selectedIds.length})</span>
          </button>
        </div>
      </div>

      {/* Filter / Score Bar */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-[#111420] border border-[#212437] text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 font-medium">Filter by Min AI Score:</span>
          {[0, 85, 90, 93].map((score) => (
            <button
              key={score}
              onClick={() => setMinScoreFilter(score)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                minScoreFilter === score
                  ? 'bg-violet-600 text-white'
                  : 'bg-[#181c2c] text-slate-400 hover:text-white'
              }`}
            >
              {score === 0 ? 'All' : `${score}+`}
            </button>
          ))}
        </div>

        <span className="text-slate-500 text-[11px]">
          Showing {filteredClips.length} of {clips.length} clips
        </span>
      </div>

      {/* Grid of Generated Clips */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredClips.map((clip) => {
          const isSelected = selectedIds.includes(clip.id);
          const renderProgress = renderingClipIds[clip.id];
          const isRendering = typeof renderProgress === 'number';

          return (
            <div
              key={clip.id}
              className={`rounded-2xl bg-[#111420] border transition-all flex flex-col justify-between overflow-hidden group ${
                isSelected
                  ? 'border-violet-500 ring-1 ring-violet-500/50 shadow-lg shadow-violet-950/30'
                  : 'border-[#212437] hover:border-violet-500/40'
              }`}
            >
              {/* Card Header & Preview */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSelect(clip.id)}
                      className="text-slate-400 hover:text-violet-400 transition-colors cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-violet-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-500" />
                      )}
                    </button>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-violet-950/60 text-violet-300 border border-violet-800/40">
                      Clip #{clip.clipNumber}
                    </span>
                  </div>

                  {/* AI Viral Score Pill */}
                  <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>{clip.aiViralScore}/100</span>
                  </div>
                </div>

                {/* 9:16 Video Thumbnail Box */}
                <div
                  onClick={() => onPreviewClip(clip)}
                  className="relative aspect-[9/12] w-full max-h-56 rounded-xl bg-black overflow-hidden cursor-pointer group/thumb"
                >
                  <img
                    src={clip.thumbnailUrl}
                    alt={clip.title}
                    className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                  />

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/35 group-hover/thumb:bg-black/20 flex items-center justify-center transition-all">
                    <div className="w-11 h-11 rounded-full bg-violet-600/90 text-white flex items-center justify-center shadow-lg group-hover/thumb:scale-110 transition-transform">
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </div>
                  </div>

                  {/* Duration Badge */}
                  <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[10px] font-mono text-white flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-300" />
                    <span>{clip.durationSeconds.toFixed(1)}s</span>
                  </div>

                  {/* Format Badge */}
                  <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[10px] font-mono text-slate-300">
                    {clip.aspectRatio}
                  </div>
                </div>

                {/* Title & Hook */}
                <div>
                  <h3 className="text-sm font-bold text-white group-hover:text-violet-300 transition-colors line-clamp-1">
                    {clip.title}
                  </h3>
                  <div className="mt-1.5 p-2 rounded-lg bg-[#161928] border border-[#23273c]">
                    <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider block">
                      3-Second Opening Hook:
                    </span>
                    <p className="text-xs text-slate-200 italic line-clamp-2 mt-0.5">
                      "{clip.hook}"
                    </p>
                  </div>
                </div>

                {/* AI Score Breakdown Mini-grid */}
                <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px] text-center font-mono">
                  <div className="p-1 rounded bg-[#161928] border border-[#222538] text-slate-300">
                    <span className="text-slate-500 block text-[9px]">Hook</span>
                    <span className="text-violet-300 font-bold">{Math.round(clip.aiViralScore * 0.98)}%</span>
                  </div>
                  <div className="p-1 rounded bg-[#161928] border border-[#222538] text-slate-300">
                    <span className="text-slate-500 block text-[9px]">Pacing</span>
                    <span className="text-indigo-300 font-bold">96%</span>
                  </div>
                  <div className="p-1 rounded bg-[#161928] border border-[#222538] text-slate-300">
                    <span className="text-slate-500 block text-[9px]">Shares</span>
                    <span className="text-emerald-300 font-bold">91%</span>
                  </div>
                </div>

                {/* Render Progress if active */}
                {isRendering && (
                  <div className="p-2 rounded-xl bg-violet-950/40 border border-violet-700/50 space-y-1">
                    <div className="flex justify-between text-[11px] text-violet-300">
                      <span className="flex items-center gap-1 font-semibold">
                        <RotateCw className="w-3 h-3 animate-spin" /> FFmpeg Rendering...
                      </span>
                      <span className="font-mono">{renderProgress}%</span>
                    </div>
                    <div className="w-full bg-[#1c1f31] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-violet-500 h-full rounded-full transition-all"
                        style={{ width: `${renderProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="p-3 bg-[#0d0f17] border-t border-[#1f2233] flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onPreviewClip(clip)}
                    title="Watch preview"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1d2d] transition-colors cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onEditClip(clip)}
                    title="Video editor"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-[#1a1d2d] transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onRegenerateCaption(clip)}
                    title="Regenerate caption"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-[#1a1d2d] transition-colors cursor-pointer"
                  >
                    <Wand2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleTriggerRender(clip)}
                    title="Render High-Res MP4"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-[#1a1d2d] transition-colors cursor-pointer"
                  >
                    <Layers className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDownload(clip)}
                    title="Download MP4"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-[#1a1d2d] transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteClip(clip.id)}
                    title="Delete clip"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#1a1d2d] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => onPublishClips([clip])}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>Publish</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
