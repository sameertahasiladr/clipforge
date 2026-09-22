import React, { useState } from 'react';
import { X, Sparkles, Wand2, Copy, Check, ArrowRight } from 'lucide-react';
import { ClipItem } from '../types';
import { apiClient } from '../services/api';

interface AiCaptionModalProps {
  clip: ClipItem;
  onClose: () => void;
  onApply: (updated: {
    title: string;
    hook: string;
    suggestedCaption: string;
    description: string;
    hashtags: string[];
    callToAction: string;
  }) => void;
}

export const AiCaptionModal: React.FC<AiCaptionModalProps> = ({ clip, onClose, onApply }) => {
  const [tone, setTone] = useState<'hype' | 'professional' | 'question' | 'storyteller'>('hype');
  const [platform, setPlatform] = useState<'instagram' | 'youtube' | 'facebook'>('instagram');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [title, setTitle] = useState(clip.title);
  const [hook, setHook] = useState(clip.hook);
  const [caption, setCaption] = useState(clip.suggestedCaption);
  const [description, setDescription] = useState(clip.description);
  const [hashtags, setHashtags] = useState<string[]>(clip.hashtags);
  const [cta, setCta] = useState(clip.callToAction || 'Follow for daily breakdowns.');

  const handleRegenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await apiClient.regenerateCaption({
        clipTitle: clip.title,
        hook: clip.hook,
        tone,
        platform,
      });

      if (res.data) {
        setTitle(res.data.title || title);
        setHook(res.data.hook || hook);
        setCaption(res.data.caption || caption);
        setDescription(res.data.description || description);
        if (res.data.hashtags) setHashtags(res.data.hashtags);
        if (res.data.callToAction) setCta(res.data.callToAction);
      }
    } catch {
      // Fallback update
      setHook(`Why 99% fail before starting: ${clip.hook}`);
      setCaption(`One mental shift rewrites your execution timeline. Save this.`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyAll = () => {
    const fullText = `${title}\n\n${hook}\n\n${caption}\n\n${cta}\n\n${hashtags.join(' ')}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    onApply({
      title,
      hook,
      suggestedCaption: caption,
      description,
      hashtags,
      callToAction: cta,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl rounded-2xl bg-[#111420] border border-[#23273c] shadow-2xl p-6 text-slate-100 flex flex-col space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#202336]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">AI Caption & Hook Generator</h2>
              <p className="text-xs text-slate-400">Powered by Gemini 3.8 Flash</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1e30] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tone & Platform Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Tone Archetype</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['hype', 'professional', 'question', 'storyteller'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`py-1.5 px-2 rounded-lg capitalize border font-medium transition-colors ${
                    tone === t
                      ? 'bg-violet-600/20 text-violet-300 border-violet-500/50'
                      : 'bg-[#161928] text-slate-400 border-transparent hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Target Platform</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['instagram', 'youtube', 'facebook'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`py-1.5 px-1 text-center rounded-lg capitalize border font-medium truncate transition-colors ${
                    platform === p
                      ? 'bg-violet-600/20 text-violet-300 border-violet-500/50'
                      : 'bg-[#161928] text-slate-400 border-transparent hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isGenerating}
          className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-bold text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-violet-600/20"
        >
          <Wand2 className="w-4 h-4" />
          <span>{isGenerating ? 'Gemini Generating New Hooks & Captions...' : 'Regenerate With Gemini'}</span>
        </button>

        {/* Results Area */}
        <div className="space-y-3 pt-2">
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              Short Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0d0f17] border border-[#23273c] text-xs text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-amber-400 mb-1">
              3-Second Hook
            </label>
            <input
              type="text"
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0d0f17] border border-[#23273c] text-xs text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              Suggested Caption
            </label>
            <textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0d0f17] border border-[#23273c] text-xs text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              Call To Action (CTA)
            </label>
            <input
              type="text"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0d0f17] border border-[#23273c] text-xs text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-indigo-400 mb-1">
              Hashtags
            </label>
            <input
              type="text"
              value={hashtags.join(' ')}
              onChange={(e) => setHashtags(e.target.value.split(/\s+/).filter(Boolean))}
              className="w-full px-3 py-2 rounded-xl bg-[#0d0f17] border border-[#23273c] text-xs text-white font-mono focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-[#202336] text-xs">
          <button
            type="button"
            onClick={handleCopyAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#161928] hover:bg-[#202438] text-slate-300 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied All!' : 'Copy to Clipboard'}</span>
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-colors cursor-pointer"
          >
            <span>Apply to Clip</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
