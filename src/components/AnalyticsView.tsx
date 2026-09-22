import React from 'react';
import {
  BarChart3,
  TrendingUp,
  Eye,
  Heart,
  Share2,
  MessageCircle,
  Clock,
  Sparkles,
  Instagram,
  Youtube,
  Facebook,
  Award,
  ArrowUpRight,
} from 'lucide-react';
import { AnalyticsSummary, ClipItem } from '../types';

interface AnalyticsViewProps {
  analytics: AnalyticsSummary;
  topClips: ClipItem[];
  onPreviewClip: (clip: ClipItem) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  analytics,
  topClips,
  onPreviewClip,
}) => {
  const metricCards = [
    { label: 'Total Views', value: '1.42M', change: '+34.2%', icon: <Eye className="w-4 h-4 text-violet-400" /> },
    { label: 'Total Likes', value: '182.4K', change: '+22.8%', icon: <Heart className="w-4 h-4 text-pink-400" /> },
    { label: 'Total Shares', value: '48.3K', change: '+41.5%', icon: <Share2 className="w-4 h-4 text-blue-400" /> },
    { label: 'Total Comments', value: '12.8K', change: '+18.1%', icon: <MessageCircle className="w-4 h-4 text-emerald-400" /> },
    { label: 'Avg Watch Time', value: '11.8s', change: '84% retention', icon: <Clock className="w-4 h-4 text-amber-400" /> },
    { label: 'Completion Rate', value: '78.4%', change: 'Top 3% percentile', icon: <TrendingUp className="w-4 h-4 text-cyan-400" /> },
  ];

  const platformDistribution = [
    {
      name: 'Instagram Reels',
      views: '740,000',
      percent: 52,
      color: 'bg-pink-500',
      icon: <Instagram className="w-4 h-4 text-pink-400" />,
    },
    {
      name: 'YouTube Shorts',
      views: '460,000',
      percent: 32,
      color: 'bg-red-500',
      icon: <Youtube className="w-4 h-4 text-red-500" />,
    },
    {
      name: 'Facebook Reels',
      views: '220,000',
      percent: 16,
      color: 'bg-blue-500',
      icon: <Facebook className="w-4 h-4 text-blue-400" />,
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in pb-16">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-violet-400" />
          <span>Analytics & Retention Insights</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Track cross-platform audience growth, loop completion rates, and AI-driven algorithmic suggestions.
        </p>
      </div>

      {/* 6 Key Performance Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {metricCards.map((m, idx) => (
          <div
            key={idx}
            className="p-4 rounded-xl bg-[#111420] border border-[#212437] hover:border-violet-500/30 transition-colors"
          >
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-medium">{m.label}</span>
              <div className="p-1 rounded bg-[#181c2c]">{m.icon}</div>
            </div>
            <div className="text-xl font-extrabold text-white">{m.value}</div>
            <div className="text-[10px] text-emerald-400 font-semibold mt-1 flex items-center gap-0.5">
              <ArrowUpRight className="w-3 h-3" />
              <span>{m.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* AI Performance Observations Callout Grid */}
      <div className="rounded-2xl bg-gradient-to-r from-violet-950/30 via-indigo-950/20 to-[#121522] border border-violet-800/40 p-5 space-y-3">
        <div className="flex items-center gap-2 text-violet-300 font-bold text-xs uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span>AI Algorithmic Observations Derived from Performance</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {analytics.aiObservations.map((obs: string, idx: number) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-[#131625]/80 border border-[#23273c] text-xs text-slate-200 flex items-start gap-2.5"
            >
              <div className="w-5 h-5 rounded-md bg-violet-600/30 text-violet-300 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                0{idx + 1}
              </div>
              <p className="leading-relaxed">{obs}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 2-Column: Platform Distribution & Top Performing Clips */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Platform Share (5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl bg-[#111420] border border-[#212437] p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Share2 className="w-4 h-4 text-blue-400" />
            <span>Platform View Distribution</span>
          </h3>

          <div className="space-y-4 pt-2">
            {platformDistribution.map((plat, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-medium text-slate-200">
                    {plat.icon}
                    <span>{plat.name}</span>
                  </span>
                  <span className="font-mono text-slate-400">
                    {plat.views} ({plat.percent}%)
                  </span>
                </div>
                <div className="w-full bg-[#191d2d] h-2 rounded-full overflow-hidden">
                  <div
                    className={`${plat.color} h-full rounded-full transition-all duration-500`}
                    style={{ width: `${plat.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-[#151826] border border-[#23273c] text-xs text-slate-400">
            Instagram Reels currently leads with <strong className="text-white">52% of total reach</strong>, driven by rapid audio remix recommendations.
          </div>
        </div>

        {/* Top Performing Clips (7 Cols) */}
        <div className="lg:col-span-7 rounded-2xl bg-[#111420] border border-[#212437] p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <span>Top Performing Viral Clips</span>
          </h3>

          <div className="space-y-3">
            {topClips.slice(0, 3).map((c, idx) => (
              <div
                key={c.id}
                onClick={() => onPreviewClip(c)}
                className="p-3.5 rounded-xl bg-[#151826] border border-[#23273c] hover:border-violet-500/40 transition-all cursor-pointer flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                    #{idx + 1}
                  </div>
                  <img
                    src={c.thumbnailUrl}
                    alt={c.title}
                    className="w-12 h-16 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-white truncate">{c.title}</h4>
                    <p className="text-[11px] text-slate-400 italic line-clamp-1 mt-0.5">
                      "{c.hook}"
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-violet-400 mt-1">
                      <span>Viral Score: {c.aiViralScore}/100</span>
                      <span>•</span>
                      <span>Duration: {c.durationSeconds.toFixed(1)}s</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-white">
                    {idx === 0 ? '420.5K' : idx === 1 ? '290.1K' : '185.3K'}
                  </div>
                  <div className="text-[10px] text-slate-400">Total Views</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
