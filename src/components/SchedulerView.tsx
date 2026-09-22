import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Send,
  RotateCw,
  XCircle,
  Play,
  CheckCircle2,
  AlertCircle,
  Instagram,
  Youtube,
  Facebook,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { PublishingJob, ClipItem } from '../types';
import { apiClient } from '../services/api';

interface SchedulerViewProps {
  jobs: PublishingJob[];
  clips: ClipItem[];
  isDemoMode?: boolean;
  onPreviewClip: (clip: ClipItem) => void;
  onRefreshJobs: () => void;
}

export const SchedulerView: React.FC<SchedulerViewProps> = ({
  jobs,
  clips,
  isDemoMode = true,
  onPreviewClip,
  onRefreshJobs,
}) => {
  const [activeTab, setActiveTab] = useState<'calendar' | 'queue'>('queue');
  const [statusFilter, setStatusFilter] = useState<'all' | 'QUEUED' | 'PUBLISHED' | 'FAILED'>('all');
  const [actionSuccess, setActionSuccess] = useState('');

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'instagram':
        return <Instagram className="w-4 h-4 text-pink-400" />;
      case 'youtube':
        return <Youtube className="w-4 h-4 text-red-500" />;
      case 'facebook':
        return <Facebook className="w-4 h-4 text-blue-400" />;
      default:
        return <Send className="w-4 h-4 text-violet-400" />;
    }
  };

  const filteredJobs = jobs.filter((j) => {
    if (statusFilter === 'all') return true;
    return j.status === statusFilter;
  });

  const handleRetryJob = async (jobId: string) => {
    try {
      await apiClient.retryPublishingJob(jobId);
      setActionSuccess('Publishing job queued for immediate retry.');
      onRefreshJobs();
      setTimeout(() => setActionSuccess(''), 3000);
    } catch {
      onRefreshJobs();
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await apiClient.cancelPublishingJob(jobId);
      setActionSuccess('Job successfully cancelled.');
      onRefreshJobs();
      setTimeout(() => setActionSuccess(''), 3000);
    } catch {
      onRefreshJobs();
    }
  };

  // Display status badges according to user intent
  const renderStatusBadge = (job: PublishingJob) => {
    if (job.isDemo) {
      if (job.status === 'PUBLISHED') {
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Demo Published
          </span>
        );
      }
      if (job.status === 'UPLOADING' || job.status === 'PROCESSING') {
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
            ● Demo Processing
          </span>
        );
      }
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
          Demo Queued
        </span>
      );
    }

    // Production States
    switch (job.status) {
      case 'PUBLISHED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Published
          </span>
        );
      case 'UPLOADING':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 animate-pulse">
            ● Uploading
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
            ● Processing
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Failed
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/10 text-violet-300 border border-violet-500/30">
            Queued
          </span>
        );
    }
  };

  const daysInMonth = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <div className="space-y-6 animate-in fade-in pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-violet-400" />
            <span>Publishing Queue & Scheduler</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Autonomous server-side worker automatically processes video rendering and platform uploads.
          </p>
        </div>

        {/* View Switcher: Queue vs Calendar */}
        <div className="flex items-center gap-2 p-1 rounded-xl bg-[#141724] border border-[#23273c]">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'queue'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Queue List ({filteredJobs.length})
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Calendar Matrix
          </button>
        </div>
      </div>

      {/* Action Toast */}
      {actionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-[#111420] border border-[#212437] text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 font-medium">Filter Status:</span>
          {(['all', 'QUEUED', 'PUBLISHED', 'FAILED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-violet-600 text-white'
                  : 'bg-[#181c2c] text-slate-400 hover:text-white'
              }`}
            >
              {st === 'all' ? 'All Jobs' : st}
            </button>
          ))}
        </div>

        <button
          onClick={onRefreshJobs}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <RotateCw className="w-3 h-3" />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Content based on Tab */}
      {activeTab === 'queue' ? (
        <div className="space-y-3">
          {filteredJobs.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-[#111420] border border-[#212437] text-slate-400 space-y-2">
              <Calendar className="w-8 h-8 text-slate-500 mx-auto" />
              <h3 className="text-sm font-bold text-white">No publishing jobs in queue</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Select clips from Generated Clips and click "Publish Multi-Platform" to dispatch posts.
              </p>
            </div>
          ) : (
            filteredJobs.map((job) => {
              const matchingClip = clips.find((c) => c.id === job.clipId);
              return (
                <div
                  key={job.id}
                  className="p-4 rounded-xl bg-[#111420] border border-[#212437] hover:border-violet-500/40 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Thumbnail */}
                    <div
                      onClick={() => matchingClip && onPreviewClip(matchingClip)}
                      className="relative w-14 h-14 rounded-xl bg-black overflow-hidden shrink-0 cursor-pointer group"
                    >
                      <img
                        src={
                          matchingClip?.thumbnailUrl ||
                          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200'
                        }
                        alt={job.clipTitle}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-4 h-4 text-white fill-white" />
                      </div>
                    </div>

                    {/* Details */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 rounded bg-[#181c2c] border border-[#252a3f]">
                          {getPlatformIcon(job.platform)}
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                          {job.platform} Reel / Short
                        </span>
                        {renderStatusBadge(job)}
                      </div>

                      <h4 className="text-xs font-semibold text-white truncate max-w-md">
                        {job.clipTitle}
                      </h4>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>
                            {job.scheduledAt
                              ? new Date(job.scheduledAt).toLocaleString()
                              : 'Immediate Queue'}
                          </span>
                        </span>
                        {job.errorMessage && (
                          <span className="text-rose-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>{job.errorMessage}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0 text-xs">
                    {matchingClip && (
                      <button
                        onClick={() => onPreviewClip(matchingClip)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#181c2c] hover:bg-[#22273c] text-slate-300 hover:text-white transition-colors cursor-pointer"
                      >
                        Preview
                      </button>
                    )}

                    {job.externalPostUrl && (
                      <a
                        href={job.externalPostUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>View Post</span>
                      </a>
                    )}

                    {job.status === 'QUEUED' && (
                      <button
                        onClick={() => handleCancelJob(job.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#1f2336] transition-colors cursor-pointer"
                        title="Cancel job"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}

                    {job.status === 'FAILED' && (
                      <button
                        onClick={() => handleRetryJob(job.id)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Calendar View Matrix */
        <div className="rounded-2xl bg-[#111420] border border-[#212437] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">September 2026</h3>
            <div className="flex items-center gap-1">
              <button className="p-1 rounded bg-[#181c2c] text-slate-300 hover:text-white">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="p-1 rounded bg-[#181c2c] text-slate-300 hover:text-white">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-500 pb-2 border-b border-[#1f2233]">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {daysInMonth.map((day) => {
              const hasEvents = day >= 21 && day <= 24;
              return (
                <div
                  key={day}
                  className={`min-h-[70px] p-1.5 rounded-xl border flex flex-col justify-between ${
                    day === 22
                      ? 'bg-violet-950/20 border-violet-500/50'
                      : 'bg-[#151826] border-[#222538]'
                  }`}
                >
                  <span
                    className={`text-[11px] font-mono font-bold ${
                      day === 22 ? 'text-violet-400' : 'text-slate-400'
                    }`}
                  >
                    {day}
                  </span>

                  {hasEvents && (
                    <div className="mt-1 space-y-1">
                      <div className="px-1 py-0.5 rounded bg-violet-600/30 text-[9px] font-bold text-violet-300 truncate">
                        2x Reels
                      </div>
                      <div className="px-1 py-0.5 rounded bg-red-600/30 text-[9px] font-bold text-red-300 truncate">
                        1x Short
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
