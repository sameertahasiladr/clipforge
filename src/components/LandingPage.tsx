import React from 'react';
import {
  Sparkles,
  Play,
  ArrowRight,
  Flame,
  CheckCircle2,
  Video,
  Layers,
  Wand2,
  Scissors,
  Share2,
  Calendar,
  BarChart3,
  ShieldCheck,
  TrendingUp,
  Clock,
  Instagram,
  Facebook,
  Youtube,
} from 'lucide-react';

interface LandingPageProps {
  onStartCreating: () => void;
  onOpenDemo: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStartCreating, onOpenDemo }) => {
  const features = [
    {
      icon: <Flame className="w-5 h-5 text-amber-400" />,
      title: '1. AI Viral Clip Detection',
      desc: 'Our multimodal engine ranks moments using 10 retention vectors: opening curiosity, emotional peaks, information density, and audience resonance.',
    },
    {
      icon: <Scissors className="w-5 h-5 text-violet-400" />,
      title: '2. Automatic 9:16 Conversion',
      desc: 'Intelligent active-speaker face tracking crops horizontal 16:9 YouTube videos into flawless 9:16 vertical shorts with zero manual keyframing.',
    },
    {
      icon: <Wand2 className="w-5 h-5 text-indigo-400" />,
      title: '3. AI Animated Captions',
      desc: 'Dynamic karaoke-style word highlighting with customized fonts, colors, and preset styles to boost 3-second completion rates.',
    },
    {
      icon: <Sparkles className="w-5 h-5 text-pink-400" />,
      title: '4. Smart Hook Generation',
      desc: 'Generates provocative opening hooks, contextual banners, short titles, and engaging call-to-actions powered by Gemini.',
    },
    {
      icon: <Layers className="w-5 h-5 text-cyan-400" />,
      title: '5. Face & Scene Detection',
      desc: 'Continuous scene boundary recognition ensures clips never cut off mid-thought or mid-sentence for seamless standalone meaning.',
    },
    {
      icon: <Share2 className="w-5 h-5 text-blue-400" />,
      title: '6. Multi-Platform Publishing',
      desc: 'One-click direct publishing to Instagram Reels, Facebook Reels, and YouTube Shorts via official authenticated OAuth APIs.',
    },
    {
      icon: <Calendar className="w-5 h-5 text-emerald-400" />,
      title: '7. Publishing & Scheduling',
      desc: 'Visual multi-timezone content calendar lets you schedule 10–15 clips across days or weeks for automated consistency.',
    },
    {
      icon: <BarChart3 className="w-5 h-5 text-purple-400" />,
      title: '8. Performance Analytics',
      desc: 'Deep analytics track aggregated views, likes, shares, and watch time with AI retention observations derived from performance.',
    },
  ];

  const workflowSteps = [
    { step: '01', title: 'YouTube URL', desc: 'Paste any public interview, podcast, or presentation.' },
    { step: '02', title: 'AI Analysis', desc: 'Gemini examines transcript, speaker emotion, and narrative peaks.' },
    { step: '03', title: 'Viral Moment Detection', desc: 'Scored 0–100 using mathematical retention heuristics.' },
    { step: '04', title: '10–15 Clips', desc: 'Formatted into 13–15 second vertical shorts with subtitles.' },
    { step: '05', title: 'Review & Edit', desc: 'Fine-tune crop, edit captions, or reposition active speaker in-browser.' },
    { step: '06', title: 'Schedule & Publish', desc: 'Broadcast directly to Instagram, Facebook, and YouTube Shorts.' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0b10] text-slate-100 flex flex-col">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-violet-600/15 via-indigo-600/10 to-transparent blur-3xl pointer-events-none" />

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
        {/* Subtle pill tag */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#161928] border border-violet-500/30 text-xs font-semibold text-violet-300 mb-8 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span>Next-Gen AI Video Shortening & Multi-Platform Automation</span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.1]">
          Turn Long Videos Into <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-blue-400">
            Viral Shorts With AI
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Paste a YouTube video and let AI discover, edit and prepare the best short-form clips for
          Instagram, Facebook and YouTube.
        </p>

        {/* Call to action buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onStartCreating}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white shadow-xl shadow-violet-600/25 transition-all transform hover:-translate-y-0.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Create Clips</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenDemo}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm bg-[#151824] hover:bg-[#1c2030] text-slate-200 border border-[#272b40] transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 text-violet-400 fill-violet-400" />
            <span>Watch Demo</span>
          </button>
        </div>

        {/* Rights Notice Callout */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Only upload or process content you own or have permission to use.</span>
        </div>
      </section>

      {/* Interactive Mockup Dashboard Preview */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="rounded-2xl border border-[#25283d] bg-[#0f111c] shadow-2xl p-4 sm:p-6 overflow-hidden relative">
          <div className="flex items-center justify-between pb-4 border-b border-[#202438] text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500/80" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="ml-2 font-mono text-slate-400">clipforge.ai/dashboard</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] bg-violet-600/20 text-violet-300 border border-violet-500/30">
                Gemini 3.8 Flash Engine
              </span>
            </div>
          </div>

          {/* Inner Dashboard Mockup Grid */}
          <div className="pt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left simulated player */}
            <div className="lg:col-span-4 flex flex-col items-center">
              <div className="w-56 h-[380px] rounded-2xl bg-gradient-to-b from-slate-900 via-violet-950/40 to-black border-2 border-violet-500/40 shadow-xl overflow-hidden relative flex flex-col justify-between p-4 group">
                <div className="absolute inset-0 bg-radial-at-t from-violet-900/30 to-transparent opacity-70" />
                <div className="relative z-10 flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-600/90 text-white">
                    CLIP #01 • 14.4s
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/90 text-white flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> 94 Score
                  </span>
                </div>

                {/* Subtitle karaoke simulated banner */}
                <div className="relative z-10 text-center bg-black/65 backdrop-blur-sm p-3 rounded-xl border border-white/10">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    "NOBODY TELLS YOU THIS..."
                  </p>
                  <p className="text-[11px] text-white font-medium mt-1">
                    The top 1% never relied on <span className="text-violet-400 font-extrabold underline">motivation</span>.
                  </p>
                </div>

                <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-300">
                  <span>@clipforge.ai</span>
                  <div className="flex gap-2 text-white">
                    <Instagram className="w-4 h-4" />
                    <Youtube className="w-4 h-4" />
                    <Facebook className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>

            {/* Right analysis preview breakdown */}
            <div className="lg:col-span-8 flex flex-col justify-between space-y-4">
              <div>
                <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">
                  Analysis Pipeline Active
                </span>
                <h3 className="text-xl font-bold text-white mt-1">
                  The Psychology of High Performance & Master Strategy
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Source: https://www.youtube.com/watch?v=dQw4w9WgXcQ • 57 min video • 15 clips generated
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-[#141724] border border-[#23273a]">
                  <span className="text-[10px] text-slate-400 uppercase">Clips Generated</span>
                  <p className="text-lg font-bold text-white">15</p>
                  <span className="text-[10px] text-emerald-400">100% 9:16 ready</span>
                </div>
                <div className="p-3 rounded-xl bg-[#141724] border border-[#23273a]">
                  <span className="text-[10px] text-slate-400 uppercase">Avg Viral Score</span>
                  <p className="text-lg font-bold text-violet-400">92/100</p>
                  <span className="text-[10px] text-slate-400">Top 5% bracket</span>
                </div>
                <div className="p-3 rounded-xl bg-[#141724] border border-[#23273a]">
                  <span className="text-[10px] text-slate-400 uppercase">Avg Duration</span>
                  <p className="text-lg font-bold text-white">14.2s</p>
                  <span className="text-[10px] text-slate-400">Optimal loop length</span>
                </div>
                <div className="p-3 rounded-xl bg-[#141724] border border-[#23273a]">
                  <span className="text-[10px] text-slate-400 uppercase">Platforms</span>
                  <div className="flex gap-2 mt-1 text-slate-300">
                    <Instagram className="w-4 h-4 text-pink-400" />
                    <Youtube className="w-4 h-4 text-red-500" />
                    <Facebook className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-[10px] text-slate-400">One-click sync</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-violet-950/20 border border-violet-800/30 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-violet-200">AI Viral Moment Insight</p>
                  <p className="text-slate-300 text-[11px] mt-0.5">
                    "Clip #01 exhibits a 94/100 viral score because the rhetorical contradiction in seconds 1–3
                    creates immediate narrative tension, paired with high-contrast dynamic keyword subtitles."
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={onStartCreating}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                >
                  Try With Your Video
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="py-16 bg-[#0d0f18] border-y border-[#1c1f2e]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-400">
              End-To-End Automation Pipeline
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white mt-2">
              From Raw YouTube Video to Multi-Platform Reach
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflowSteps.map((w, idx) => (
              <div
                key={idx}
                className="p-5 rounded-xl bg-[#121522] border border-[#212437] hover:border-violet-500/40 transition-colors relative"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-bold text-violet-400 bg-violet-950/40 px-2 py-0.5 rounded border border-violet-800/40">
                    STEP {w.step}
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-slate-500" />
                </div>
                <h4 className="text-base font-bold text-white">{w.title}</h4>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8 Core Features Grid */}
      <section className="py-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-violet-400">
            Enterprise Architecture
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white mt-2">
            Engineered for Creators & Media Agencies
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Every feature is calibrated around high retention, automated smart cropping, and official publishing APIs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((feat, idx) => (
            <div
              key={idx}
              className="p-5 rounded-xl bg-[#111420] border border-[#202336] hover:border-violet-500/30 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-[#1a1e30] flex items-center justify-center mb-4">
                  {feat.icon}
                </div>
                <h3 className="text-sm font-bold text-white">{feat.title}</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">{feat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer & Copyright Disclaimer */}
      <footer className="mt-auto border-t border-[#1c1f2e] bg-[#0a0b10] py-8 text-xs text-slate-400">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-bold text-slate-200">ClipForge AI</span> © 2026. All rights reserved.
          </div>

          <div className="flex items-center gap-6">
            <span className="text-[11px] text-slate-400">
              Only upload or process content you own or have permission to use.
            </span>
            <a href="#terms" className="hover:text-slate-200 transition-colors">
              Terms of Service
            </a>
            <a href="#privacy" className="hover:text-slate-200 transition-colors">
              Privacy Policy
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
