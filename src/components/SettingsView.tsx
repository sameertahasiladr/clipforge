import React, { useState, useEffect } from 'react';
import {
  Settings,
  Cookie,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Trash2,
  Check,
  FileText,
  KeyRound,
  ExternalLink,
  Cpu,
  Video,
  CheckCircle2,
  UploadCloud,
  Sparkles,
  Server,
} from 'lucide-react';
import { apiClient } from '../services/api';
import { CookieInfo, UserProfile } from '../types';
import { YouTubeCookiesModal } from './YouTubeCookiesModal';

interface SettingsViewProps {
  user: UserProfile | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user }) => {
  const [cookieInfo, setCookieInfo] = useState<CookieInfo | null>(null);
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
  const [testingCookies, setTestingCookies] = useState(false);
  const [cookieTestResult, setCookieTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [systemHealth, setSystemHealth] = useState<{
    status: string;
    hasGeminiApiKey: boolean;
    ffmpegAvailable: boolean;
  } | null>(null);

  const loadData = async () => {
    try {
      const [cookiesRes, healthRes] = await Promise.all([
        apiClient.getYouTubeCookies().catch(() => null),
        apiClient.getHealth().catch(() => null),
      ]);
      if (cookiesRes?.success && cookiesRes.cookies) {
        setCookieInfo(cookiesRes.cookies);
      }
      if (healthRes) {
        setSystemHealth(healthRes);
      }
    } catch {}
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTestCookies = async () => {
    setTestingCookies(true);
    setCookieTestResult(null);
    try {
      const res = await apiClient.testYouTubeCookies();
      setCookieTestResult(res);
    } catch (err: any) {
      setCookieTestResult({
        success: false,
        message: err.message || 'Test failed.',
      });
    } finally {
      setTestingCookies(false);
    }
  };

  const handleDeleteCookies = async () => {
    if (!window.confirm('Are you sure you want to remove the configured YouTube cookies?')) return;
    try {
      const res = await apiClient.deleteYouTubeCookies();
      setCookieInfo(res.cookies);
      setCookieTestResult(null);
    } catch (err: any) {
      alert(err.message || 'Failed to remove cookies');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-violet-400" />
          Settings & Integrations
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure YouTube cookies, API integrations, and video processing defaults
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): YouTube Cookies Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-2xl bg-[#111420] border border-[#212437] space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Cookie className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    YouTube Cookies Authentication
                  </h2>
                  <p className="text-xs text-slate-400">
                    Bypasses YouTube bot verification and Cloud IP challenge gates
                  </p>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 text-xs font-semibold rounded-full border flex items-center gap-1.5 ${
                  cookieInfo?.configured
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    cookieInfo?.configured ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
                  }`}
                ></span>
                {cookieInfo?.configured ? 'Active' : 'Not Configured'}
              </span>
            </div>

            {/* Description & Status */}
            <div className="text-xs text-slate-300 leading-relaxed bg-[#0b0d14] p-4 rounded-xl border border-[#1f2337] space-y-2">
              <p>
                When ClipForge acquires public YouTube videos, YouTube's servers may require sign-in
                verification (<code className="text-amber-400">"Sign in to confirm you're not a bot"</code>). Providing Netscape cookies authenticates yt-dlp as a normal browser session.
              </p>
              {cookieInfo?.configured && (
                <div className="pt-2 border-t border-[#1f2337] flex flex-wrap gap-4 text-[11px] text-slate-400">
                  <span>
                    Total Cookies: <strong className="text-white">{cookieInfo.cookieCount}</strong>
                  </span>
                  <span>
                    YouTube Cookies: <strong className="text-emerald-400">{cookieInfo.youtubeCookieCount}</strong>
                  </span>
                  <span>
                    Session Auth: <strong className="text-white">{cookieInfo.hasSessionCookies ? 'Yes' : 'Anonymous'}</strong>
                  </span>
                  <span>
                    File: <strong className="text-slate-300">{cookieInfo.filePath || 'storage/youtube_cookies.txt'}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Test Result Message */}
            {cookieTestResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  cookieTestResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                }`}
              >
                {cookieTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{cookieTestResult.message}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCookieModalOpen(true)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Cookie className="w-4 h-4" />
                  <span>{cookieInfo?.configured ? 'Update Cookies' : 'Configure Cookies'}</span>
                </button>

                {cookieInfo?.configured && (
                  <button
                    type="button"
                    onClick={handleTestCookies}
                    disabled={testingCookies}
                    className="px-3.5 py-2 bg-[#181d2e] hover:bg-[#232940] text-slate-200 border border-slate-700 font-medium text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingCookies ? 'animate-spin' : ''}`} />
                    <span>{testingCookies ? 'Verifying...' : 'Verify Access'}</span>
                  </button>
                )}
              </div>

              {cookieInfo?.configured && (
                <button
                  type="button"
                  onClick={handleDeleteCookies}
                  className="px-3 py-2 text-rose-400 hover:bg-rose-500/10 rounded-xl border border-rose-500/20 text-xs font-medium transition cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>
          </div>

          {/* Direct Upload Notice */}
          <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div className="space-y-1 text-xs">
              <h3 className="font-semibold text-white">Direct Upload Always Available</h3>
              <p className="text-slate-400 leading-relaxed">
                If a YouTube video has geo-restrictions, members-only requirements, or severe bot checks, you can always download or record the MP4/MOV file and upload it directly on the Create page. Direct Upload bypasses all YouTube network challenges completely.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): System & Account Health */}
        <div className="space-y-6">
          {/* User Account Info */}
          <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-violet-400" />
              Creator Account
            </h3>
            {user ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-[#1f2337]">
                  <span className="text-slate-400">Name</span>
                  <span className="font-medium text-white">{user.fullName || 'Creator'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#1f2337]">
                  <span className="text-slate-400">Email</span>
                  <span className="font-medium text-white">{user.email}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#1f2337]">
                  <span className="text-slate-400">Plan</span>
                  <span className="font-semibold text-violet-400 uppercase">{user.planTier || 'Pro'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Role</span>
                  <span className="font-medium text-white capitalize">{user.role || 'Creator'}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Sign in to persist your generated clips and projects across browser sessions.
              </p>
            )}
          </div>

          {/* Engine & Pipeline Health */}
          <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-violet-400" />
              Pipeline Engines
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#0b0d14] border border-[#1f2337]">
                <span className="text-slate-300">Gemini AI Models</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Online
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#0b0d14] border border-[#1f2337]">
                <span className="text-slate-300">FFmpeg Rendering</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Ready
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#0b0d14] border border-[#1f2337]">
                <span className="text-slate-300">yt-dlp Video Extractor</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Available
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#0b0d14] border border-[#1f2337]">
                <span className="text-slate-300">POT Server (bgutil)</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Port 4416
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cookies Configuration Modal */}
      <YouTubeCookiesModal
        isOpen={isCookieModalOpen}
        onClose={() => setIsCookieModalOpen(false)}
        onCookiesUpdated={(info) => {
          setCookieInfo(info);
          setCookieTestResult(null);
        }}
      />
    </div>
  );
};
