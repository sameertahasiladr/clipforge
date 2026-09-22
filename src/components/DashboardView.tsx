import React from 'react';
import {
  Sparkles,
  Video,
  Film,
  Send,
  Eye,
  TrendingUp,
  ArrowRight,
  Play,
  Calendar,
  Clock,
  Instagram,
  Youtube,
  Facebook,
  ExternalLink,
  PlusCircle,
} from 'lucide-react';
import { ClipItem, ProjectItem, UserProfile } from '../types';

interface DashboardViewProps {
  user: UserProfile;
  projects: ProjectItem[];
  clips: ClipItem[];
  onNavigate: (tab: any) => void;
  onPreviewClip: (clip: ClipItem) => void;
  onQuickAnalyze: (url: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  projects,
  clips,
  onNavigate,
  onPreviewClip,
  onQuickAnalyze,
}) => {
  const [quickUrl, setQuickUrl] = React.useState('');

  const stats = [
    { label: 'Videos Processed', value: '14', change: '+3 this week', icon: <Video className="w-4 h-4 text-violet-400" /> },
    { label: 'Clips Generated', value: '148', change: '100% 9:16 vertical', icon: <Film className="w-4 h-4 text-indigo-400" /> },
    { label: 'Clips Published', value: '68', change: 'Multi-platform live', icon: <Send className="w-4 h-4 text-blue-400" /> },
    { label: 'Total Views', value: '1.42M', change: '+34.2% MoM', icon: <Eye className="w-4 h-4 text-emerald-400" /> },
    { label: 'Average Engagement', value: '10.2%', change: 'Top 5% creator tier', icon: <TrendingUp className="w-4 h-4 text-amber-400" /> },
  ];

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickUrl.trim()) {
      onQuickAnalyze(quickUrl.trim());
    } else {
      onNavigate('create');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Welcome & AI Recommendation Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Good morning, {user.fullName.split(' ')[0]}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Your viral video command center is online. 15 new clips generated today.
          </p>
        </div>

        <button
          onClick={() => onNavigate('create')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/25 transition-all cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>New Video Project</span>
        </button>
      </div>

      {/* AI Recommendation Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-950/40 via-indigo-950/30 to-[#121522] border border-violet-800/40 shadow-sm flex items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-violet-400" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-violet-300 uppercase tracking-wider text-[10px]">
              AI Strategic Recommendation
            </span>
            <p className="text-slate-200 mt-0.5">
              "Your clips with provocative questions in the first 3 seconds received <span className="text-emerald-400 font-bold">42% higher engagement</span> this week across Instagram and YouTube Shorts."
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigate('analytics')}
          className="shrink-0 text-xs font-semibold text-violet-400 hover:text-violet-300 flex items-center gap-1"
        >
          <span>View Insights</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick Paste Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#111420] border border-[#23273c]">
        <span className="text-xs font-semibold text-slate-300 block mb-2">
          Fast-Track Video Processing
        </span>
        <form onSubmit={handleQuickSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={quickUrl}
            onChange={(e) => setQuickUrl(e.target.value)}
            placeholder="Paste public YouTube URL (e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ)"
            className="grow px-4 py-2.5 rounded-xl bg-[#0d0f17] border border-[#25283b] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
          />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-bold text-white transition-colors cursor-pointer shrink-0 flex items-center justify-center gap-2"
          >
            <Video className="w-4 h-4" />
            <span>Analyze Video</span>
          </button>
        </form>
      </div>

      {/* 5 Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {stats.map((st, i) => (
          <div
            key={i}
            className="p-4 rounded-xl bg-[#111420] border border-[#212437] hover:border-violet-500/30 transition-colors"
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-medium">{st.label}</span>
              <div className="p-1 rounded bg-[#181c2c]">{st.icon}</div>
            </div>
            <div className="text-2xl font-extrabold text-white tracking-tight">{st.value}</div>
            <div className="text-[10px] text-slate-400 mt-1 font-medium">{st.change}</div>
          </div>
        ))}
      </div>

      {/* 2-Column: Recent Projects & Recent Generated Clips */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Projects (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl bg-[#111420] border border-[#212437] p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1e2235]">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Video className="w-4 h-4 text-violet-400" />
              <span>Recent Source Projects</span>
            </h3>
            <button
              onClick={() => onNavigate('projects')}
              className="text-xs text-violet-400 hover:underline font-medium"
            >
              View all
            </button>
          </div>

          <div className="space-y-3">
            {projects.slice(0, 3).map((proj) => (
              <div
                key={proj.id}
                onClick={() => onNavigate('clips')}
                className="p-3 rounded-xl bg-[#151826] border border-[#23273c] hover:border-violet-500/40 transition-all cursor-pointer group flex items-center gap-3"
              >
                <img
                  src={proj.thumbnailUrl}
                  alt={proj.title}
                  className="w-16 h-12 rounded-lg object-cover shrink-0 ring-1 ring-white/10"
                />
                <div className="grow min-w-0">
                  <h4 className="text-xs font-semibold text-slate-200 group-hover:text-violet-300 truncate transition-colors">
                    {proj.title}
                  </h4>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                    <span>{proj.clipsCount} clips</span>
                    <span>•</span>
                    <span className="text-emerald-400">{proj.publishedCount} published</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-violet-400 transition-colors shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Generated Clips (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl bg-[#111420] border border-[#212437] p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1e2235]">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-indigo-400" />
              <span>Top Viral Clips Prepared</span>
            </h3>
            <button
              onClick={() => onNavigate('clips')}
              className="text-xs text-violet-400 hover:underline font-medium"
            >
              Review all clips
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {clips.slice(0, 4).map((clip) => (
              <div
                key={clip.id}
                className="p-3 rounded-xl bg-[#151826] border border-[#23273c] hover:border-violet-500/40 transition-all flex flex-col justify-between"
              >
                <div className="flex items-start gap-2.5">
                  <div
                    onClick={() => onPreviewClip(clip)}
                    className="relative w-14 h-20 rounded-lg bg-black shrink-0 overflow-hidden group cursor-pointer"
                  >
                    <img
                      src={clip.thumbnailUrl}
                      alt={clip.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="w-5 h-5 text-white fill-white" />
                    </div>
                  </div>

                  <div className="grow min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold text-violet-400 bg-violet-950/60 px-1.5 py-0.5 rounded">
                        #{clip.clipNumber} • {clip.durationSeconds.toFixed(1)}s
                      </span>
                      <span className="text-[10px] font-bold text-emerald-400">
                        {clip.aiViralScore} Score
                      </span>
                    </div>
                    <h4 className="text-xs font-semibold text-slate-100 truncate">{clip.title}</h4>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 italic">
                      "{clip.hook}"
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#1e2235] text-[11px]">
                  <span
                    className={`capitalize font-medium ${
                      clip.status === 'published'
                        ? 'text-emerald-400'
                        : clip.status === 'scheduled'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}
                  >
                    ● {clip.status}
                  </span>

                  <button
                    onClick={() => onPreviewClip(clip)}
                    className="text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1"
                  >
                    Preview
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
