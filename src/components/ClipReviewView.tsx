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
  onDeleteMultipleClips?: (clipIds: string[]) => void;
  onPublishClips: (clips: ClipItem[]) => void;
}

export const ClipReviewView: React.FC<ClipReviewViewProps> = ({
  clips,
  onPreviewClip,
  onEditClip,
  onRegenerateCaption,
  onDeleteClip,
  onDeleteMultipleClips,
  onPublishClips,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0);
  const [renderingClipIds, setRenderingClipIds] = useState<Record<string, number>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');

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

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    if (onDeleteMultipleClips) {
      onDeleteMultipleClips(selectedIds);
    } else {
      selectedIds.forEach((id) => onDeleteClip(id));
    }
    setSelectedIds([]);
    setDeleteConfirmOpen(false);
    setToastMessage(`Deleted ${count} selected clip${count === 1 ? '' : 's'}.`);
    setTimeout(() => setToastMessage(''), 3500);
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
            Short 13–15 second vertical moments scored for retention and ready for multi-platform dispatch.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={selectAll}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#151826] hover:bg-[#1d2133] text-slate-300 border border-[#23273c] transition-colors cursor-pointer min-h-[40px]"
          >
            {selectedIds.length === filteredClips.length && filteredClips.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-violet-400 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-slate-500 shrink-0" />
            )}
            <span className="whitespace-nowrap">Select All ({selectedIds.length}/{filteredClips.length})</span>
          </button>

          {selectedIds.length > 0 && (
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#151826] hover:bg-[#1d2133] text-slate-400 hover:text-white border border-[#23273c] transition-colors cursor-pointer min-h-[40px]"
            >
              Deselect All
            </button>
          )}

          {/* Delete Selected Multi-Clips Button & Inline Confirmation */}
          {selectedIds.length > 0 && (
            deleteConfirmOpen ? (
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-rose-950/60 border border-rose-500/50 animate-in fade-in">
                <span className="text-xs text-rose-200 font-semibold px-2 whitespace-nowrap">
                  Delete {selectedIds.length}?
                </span>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-sm min-h-[36px]"
                >
                  Yes, Delete All
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer min-h-[36px]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition-all cursor-pointer shadow-sm min-h-[40px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap">Delete ({selectedIds.length})</span>
              </button>
            )
          )}

          <button
            disabled={selectedIds.length === 0}
            onClick={() => onPublishClips(selectedClips)}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-md shadow-violet-600/25 transition-all cursor-pointer min-h-[40px]"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Publish Multi-Platform ({selectedIds.length})</span>
          </button>
        </div>
      </div>

      {/* Success Notification Toast */}
      {toastMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Filter / Score Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-[#111420] border border-[#212437] text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Min AI Score:</span>
          </div>
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0c0e18] border border-[#1d2030]">
            {[0, 85, 90, 93].map((score) => (
              <button
                key={score}
                onClick={() => setMinScoreFilter(score)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer min-h-[28px] ${
                  minScoreFilter === score
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c2c]'
                }`}
              >
                {score === 0 ? 'All' : `${score}+`}
              </button>
            ))}
          </div>
        </div>

        <span className="text-slate-500 text-[11px]">
          Showing {filteredClips.length} of {clips.length} clips
        </span>
      </div>

      {/* Empty State */}
      {filteredClips.length === 0 && (
        <div className="py-16 text-center rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
          <Film className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Clips Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {clips.length === 0
              ? 'No clips have been generated yet. Head over to "Create Clips" to generate your first batch.'
              : 'No clips match your AI Viral Score filter. Try selecting "All".'}
          </p>
        </div>
      )}

      {/* Grid of Generated Clips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {filteredClips.map((clip) => {
          const isSelected = selectedIds.includes(clip.id);
          const renderProgress = renderingClipIds[clip.id];
          const isRendering = typeof renderProgress === 'number';

          return (
            <div
              key={clip.id}
              className={`rounded-2xl bg-[#111420] border transition-all flex flex-col justify-between overflow-hidden group ${
                isSelected
                  ? 'border-violet-500 ring-2 ring-violet-500/60 shadow-lg shadow-violet-950/40 bg-violet-950/10'
                  : 'border-[#212437] hover:border-violet-500/40'
              }`}
            >
              {/* Card Header & Preview */}
              <div className="p-3.5 sm:p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSelect(clip.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-violet-600/30 text-violet-300 border border-violet-500/60'
                          : 'bg-[#151826] text-slate-400 border border-[#23273c] hover:text-white hover:border-slate-500'
                      }`}
                      title={isSelected ? 'Deselect clip' : 'Select clip for multi-delete'}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-violet-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-500" />
                      )}
                      <span className="text-[11px]">{isSelected ? 'Selected' : 'Select'}</span>
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
                  className="relative aspect-[9/12] w-full max-h-56 rounded-xl bg-[#0c0e17] overflow-hidden cursor-pointer group/thumb flex items-center justify-center"
                >
                  <img
                    src={clip.thumbnailUrl}
                    alt=""
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                    className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                  />

                  {/* Sleek Fallback Background Layer */}
                  <div className="absolute inset-0 bg-gradient-to-b from-[#181c2d] to-[#0c0e17] -z-10 flex flex-col items-center justify-center p-3 text-center pointer-events-none">
                    <Film className="w-8 h-8 text-violet-500/30 mb-1" />
                    <span className="text-[11px] font-semibold text-slate-400 line-clamp-1">{clip.title}</span>
                  </div>

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/30 group-hover/thumb:bg-black/15 flex items-center justify-center transition-all">
                    <div className="w-11 h-11 rounded-full bg-violet-600/90 text-white flex items-center justify-center shadow-lg group-hover/thumb:scale-110 transition-transform">
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </div>
                  </div>

                  {/* Duration Badge */}
                  <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[10px] font-mono text-white flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-300" />
                    <span>{clip.durationSeconds.toFixed(1)}s</span>
                  </div>

                  {/* Format Badge */}
                  <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[10px] font-mono text-slate-300">
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
              <div className="p-3 bg-[#0d0f17] border-t border-[#1f2233] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <button
                    onClick={() => onPreviewClip(clip)}
                    title="Watch preview"
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1d2d] transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onEditClip(clip)}
                    title="Video editor"
                    className="p-2 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-[#1a1d2d] transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onRegenerateCaption(clip)}
                    title="Regenerate caption"
                    className="p-2 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-[#1a1d2d] transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                  >
                    <Wand2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleTriggerRender(clip)}
                    title="Render High-Res MP4"
                    className="p-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-[#1a1d2d] transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                  >
                    <Layers className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDownload(clip)}
                    title="Download MP4"
                    className="p-2 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-[#1a1d2d] transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteClip(clip.id)}
                    title="Delete clip"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#1a1d2d] transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={() => onPublishClips([clip])}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer min-h-[36px] ml-auto"
                >
                  <Send className="w-3 h-3" />
                  <span>Publish</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Bulk Selection Action Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[94%] sm:w-[90%] bg-[#121524]/95 backdrop-blur-xl border-2 border-violet-500/60 rounded-2xl p-3 shadow-2xl shadow-black/80 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-bottom-5">
          <div className="flex items-center justify-between w-full sm:w-auto gap-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-violet-600 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                {selectedIds.length}
              </span>
              <span className="text-xs font-bold text-white whitespace-nowrap">
                {selectedIds.length === 1 ? '1 clip selected' : `${selectedIds.length} clips selected`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer px-1 py-1"
            >
              Deselect All
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {deleteConfirmOpen ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs font-bold text-rose-300 whitespace-nowrap">Delete {selectedIds.length}?</span>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md cursor-pointer min-h-[40px]"
                >
                  Yes, Delete All
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer min-h-[40px]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition-all cursor-pointer shadow-lg shadow-rose-950/50 min-h-[40px]"
              >
                <Trash2 className="w-4 h-4" />
                <span className="whitespace-nowrap">Delete ({selectedIds.length})</span>
              </button>
            )}

            {!deleteConfirmOpen && (
              <button
                type="button"
                onClick={() => onPublishClips(selectedClips)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors cursor-pointer min-h-[40px]"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Publish</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
