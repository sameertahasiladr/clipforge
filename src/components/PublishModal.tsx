import React, { useState } from 'react';
import {
  X,
  Send,
  Calendar,
  Clock,
  Instagram,
  Youtube,
  Facebook,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { ClipItem, SocialAccount } from '../types';
import { apiClient } from '../services/api';

interface PublishModalProps {
  clips: ClipItem[];
  socialAccounts: SocialAccount[];
  isDemoMode?: boolean;
  onClose: () => void;
  onSuccess: (scheduledCount: number) => void;
  onConnectAccount: () => void;
}

export const PublishModal: React.FC<PublishModalProps> = ({
  clips,
  socialAccounts,
  isDemoMode = true,
  onClose,
  onSuccess,
  onConnectAccount,
}) => {
  const firstClip = clips[0] || ({} as Partial<ClipItem>);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    'instagram',
    'youtube',
    'facebook',
  ]);
  const [caption, setCaption] = useState(firstClip.suggestedCaption || firstClip.title || '');
  const [hashtags, setHashtags] = useState((firstClip.hashtags || []).join(' '));
  const [scheduleType, setScheduleType] = useState<'now' | 'schedule' | 'draft'>('now');
  const [scheduledDate, setScheduledDate] = useState('2026-09-23');
  const [scheduledTime, setScheduledTime] = useState('14:30');
  const [timezone, setTimezone] = useState('America/Los_Angeles (PST)');
  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (clips.length === 0) return null;

  const togglePlatform = (p: string) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter((item) => item !== p));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  const handleAction = async () => {
    setIsPublishing(true);
    setErrorMsg('');

    try {
      const scheduledIso = `${scheduledDate}T${scheduledTime}:00Z`;
      const mode = isDemoMode ? 'demo' : 'production';

      for (const c of clips) {
        await apiClient.publishClips({
          clipId: c.id,
          clipTitle: c.title,
          caption: caption || c.suggestedCaption || c.hook,
          hashtags: hashtags.split(' ').filter(Boolean),
          platforms: selectedPlatforms,
          publishMode: scheduleType === 'schedule' ? 'scheduled' : 'immediate',
          scheduledTime: scheduleType === 'schedule' ? scheduledIso : undefined,
          mode,
        });
      }

      setIsPublishing(false);
      onSuccess(clips.length * selectedPlatforms.length);
      onClose();
    } catch (err: any) {
      setIsPublishing(false);
      setErrorMsg(err.message || 'Failed to submit publishing jobs.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl rounded-2xl bg-[#111420] border border-[#23273c] shadow-2xl p-6 text-slate-100 flex flex-col space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#202336]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-violet-400" />
                <span>Publish & Schedule Clips ({clips.length})</span>
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  isDemoMode
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                }`}
              >
                {isDemoMode ? 'Demo Mode' : 'Production Mode'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Broadcast directly to Instagram Reels, Facebook Reels, and YouTube Shorts.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1e30] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Selected Clips Summary Badge */}
        <div className="p-3 rounded-xl bg-[#161928] border border-[#23273c] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">Target Clips:</span>
            <span className="text-violet-300">
              {clips.length === 1
                ? `Clip #${clips[0].clipNumber}: "${clips[0].title}"`
                : `${clips.length} selected clips batch`}
            </span>
          </div>
          <span className="text-emerald-400 font-bold">100% 9:16 Vertical</span>
        </div>

        {/* Target Platforms */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Target Social Channels
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { id: 'instagram', name: 'Instagram Reels', icon: <Instagram className="w-4 h-4 text-pink-400" /> },
              { id: 'youtube', name: 'YouTube Shorts', icon: <Youtube className="w-4 h-4 text-red-500" /> },
              { id: 'facebook', name: 'Facebook Reels', icon: <Facebook className="w-4 h-4 text-blue-400" /> },
            ].map((p) => {
              const active = selectedPlatforms.includes(p.id);
              const account = socialAccounts.find((a) => a.platform === p.id);
              const isConnected = Boolean(account && account.isConnected);

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? 'bg-violet-600/20 text-white border-violet-500/60 shadow-sm'
                      : 'bg-[#151826] text-slate-400 border-[#23273c] hover:text-white'
                  }`}
                >
                  {p.icon}
                  <span className="text-xs font-semibold">{p.name}</span>
                  <span
                    className={`text-[10px] flex items-center gap-0.5 ${
                      isConnected ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    ● {isConnected ? (isDemoMode ? 'Demo Ready' : 'Connected') : 'Not Connected'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Caption & Hashtags */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Synchronized Caption
            </label>
            <textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0d0f17] border border-[#23273c] text-xs text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Viral Hashtags
            </label>
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0d0f17] border border-[#23273c] text-xs text-white font-mono focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        {/* Publishing Mode Selection: Publish Now vs Schedule vs Draft */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Distribution Schedule
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'now', label: 'Publish Now', desc: 'Instant queue processing' },
              { id: 'schedule', label: 'Schedule Post', desc: 'Pick date & time' },
              { id: 'draft', label: 'Save Draft', desc: 'Store in queue' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setScheduleType(m.id as any)}
                className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  scheduleType === m.id
                    ? 'bg-violet-600/20 text-violet-300 border-violet-500/60 shadow-sm'
                    : 'bg-[#151826] text-slate-400 border-[#23273c] hover:text-white'
                }`}
              >
                <span className="block text-xs font-bold">{m.label}</span>
                <span className="text-[10px] text-slate-500">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date & Time Picker if Schedule */}
        {scheduleType === 'schedule' && (
          <div className="p-3.5 rounded-xl bg-[#141724] border border-[#23273c] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-violet-400" />
                <span>Date</span>
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#0d0f17] border border-[#25283b] text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Time</span>
              </label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#0d0f17] border border-[#25283b] text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-[#0d0f17] border border-[#25283b] text-xs text-white"
              >
                <option value="America/Los_Angeles (PST)">America/Los_Angeles (PST)</option>
                <option value="America/New_York (EST)">America/New_York (EST)</option>
                <option value="Europe/London (GMT)">Europe/London (GMT)</option>
                <option value="Asia/Kolkata (IST)">Asia/Kolkata (IST)</option>
              </select>
            </div>
          </div>
        )}

        {/* Security & Official API Notice */}
        <div className="p-3 rounded-xl bg-violet-950/20 border border-violet-800/30 flex items-start gap-2.5 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            {isDemoMode
              ? 'Demo Mode: Multi-platform publishing will be simulated with honest Demo badges in the scheduler.'
              : 'Production Mode: Posts will be uploaded to official Instagram, Facebook, and YouTube APIs via background workers.'}
          </span>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#202336]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            disabled={isPublishing}
            onClick={handleAction}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-violet-600/30 transition-all cursor-pointer flex items-center gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {isPublishing
                ? 'Submitting to Queue...'
                : scheduleType === 'now'
                ? `Publish ${clips.length} Clips Now`
                : scheduleType === 'schedule'
                ? `Schedule ${clips.length} Clips`
                : 'Save as Drafts'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
