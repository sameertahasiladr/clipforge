import React, { useState, useEffect } from 'react';
import {
  Cookie,
  X,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  Trash2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  FileText,
  KeyRound,
  Check,
  Copy,
} from 'lucide-react';
import { apiClient } from '../services/api';
import { CookieInfo } from '../types';

interface YouTubeCookiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCookiesUpdated?: (info: CookieInfo) => void;
}

export const YouTubeCookiesModal: React.FC<YouTubeCookiesModalProps> = ({
  isOpen,
  onClose,
  onCookiesUpdated,
}) => {
  const [cookieInfo, setCookieInfo] = useState<CookieInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [rawText, setRawText] = useState('');
  const [activeTab, setActiveTab] = useState<'paste' | 'upload' | 'guide'>('paste');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
  } | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await apiClient.getYouTubeCookies();
      if (res.success && res.cookies) {
        setCookieInfo(res.cookies);
        onCookiesUpdated?.(res.cookies);
      }
    } catch {
      // silent fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setTestResult(null);
      setStatusNotice(null);
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!rawText.trim()) {
      setStatusNotice({ type: 'error', message: 'Please paste your Netscape cookie text first.' });
      return;
    }

    setSaving(true);
    setStatusNotice(null);
    try {
      const res = await apiClient.saveYouTubeCookies(rawText);
      setCookieInfo(res.cookies);
      onCookiesUpdated?.(res.cookies);
      setStatusNotice({ type: 'success', message: 'YouTube cookies saved successfully!' });
      setRawText('');
      // Run auto test
      handleTest();
    } catch (err: any) {
      setStatusNotice({ type: 'error', message: err.message || 'Failed to save cookies.' });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        setActiveTab('paste');
      }
    };
    reader.readAsText(file);
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to remove the configured YouTube cookies?')) return;

    setSaving(true);
    try {
      const res = await apiClient.deleteYouTubeCookies();
      setCookieInfo(res.cookies);
      onCookiesUpdated?.(res.cookies);
      setStatusNotice({ type: 'success', message: 'YouTube cookies cleared.' });
      setTestResult(null);
    } catch (err: any) {
      setStatusNotice({ type: 'error', message: err.message || 'Failed to remove cookies.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiClient.testYouTubeCookies();
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to execute test.',
      });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden text-zinc-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Cookie className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                YouTube Cookies Configuration
              </h2>
              <p className="text-xs text-zinc-400">
                Bypass bot verification and download restrictions for YouTube video analysis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Status Banner */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              cookieInfo?.configured
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300'
            }`}
          >
            <div className="flex items-start space-x-3">
              {cookieInfo?.configured ? (
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <span>
                    {cookieInfo?.configured ? 'YouTube Cookies Active' : 'No Cookies Configured'}
                  </span>
                  {cookieInfo?.configured && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {cookieInfo.cookieCount} cookies ({cookieInfo.youtubeCookieCount} YouTube)
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {cookieInfo?.configured
                    ? `Storage: ${cookieInfo.filePath || 'storage/youtube_cookies.txt'} (${Math.round(cookieInfo.sizeBytes / 1024)} KB) • Session Auth: ${cookieInfo.hasSessionCookies ? 'Yes' : 'Anonymous'}`
                    : 'Without cookies, YouTube bot checks may block server downloads. Adding cookies provides authenticated access.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              {cookieInfo?.configured && (
                <>
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    className="px-3 py-1.5 text-xs font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                    {testing ? 'Testing...' : 'Verify'}
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="p-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg border border-rose-500/20 transition"
                    title="Remove Cookies"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Test Result Feedback */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="grow">
                <div className="font-semibold">{testResult.message}</div>
                {testResult.details && (
                  <div className="mt-1 font-mono text-[11px] text-zinc-400 max-h-24 overflow-y-auto whitespace-pre-wrap">
                    {testResult.details}
                  </div>
                )}
              </div>
            </div>
          )}

          {statusNotice && (
            <div
              className={`p-3 rounded-xl border text-xs ${
                statusNotice.type === 'success'
                  ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
              }`}
            >
              {statusNotice.message}
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-zinc-800 overflow-x-auto scrollbar-none gap-2 sm:gap-4 pb-0.5">
            <button
              onClick={() => setActiveTab('paste')}
              className={`pb-2.5 text-xs sm:text-sm font-medium transition border-b-2 whitespace-nowrap min-h-[38px] ${
                activeTab === 'paste'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Paste Cookies (Netscape)
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`pb-2.5 text-xs sm:text-sm font-medium transition border-b-2 whitespace-nowrap min-h-[38px] ${
                activeTab === 'upload'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Upload cookies.txt
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`pb-2.5 text-xs sm:text-sm font-medium transition border-b-2 whitespace-nowrap min-h-[38px] ${
                activeTab === 'guide'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Instructions
            </button>
          </div>

          {/* Tab 1: Paste Text */}
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-zinc-400 gap-1">
                <span>Paste the exported Netscape cookie text below:</span>
                <span className="text-zinc-500 font-mono text-[10px]"># Netscape HTTP Cookie File</span>
              </div>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n.youtube.com\tTRUE\t/\tTRUE\t1750000000\tLOGIN_INFO\t...\n.youtube.com\tTRUE\t/\tTRUE\t1750000000\tVISITOR_INFO1_LIVE\t...`}
                rows={8}
                className="w-full font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 transition"
              />
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Tip: Cookies contain session credentials for YouTube. Keep your browser export confidential.
                </p>
                <button
                  onClick={handleSave}
                  disabled={saving || !rawText.trim()}
                  className="w-full sm:w-auto px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition disabled:opacity-50 min-h-[40px] shrink-0"
                >
                  <Check className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save & Verify Cookies'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Upload File */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <label
                htmlFor="cookie-file-input"
                className="border-2 border-dashed border-zinc-700 hover:border-amber-500/50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition bg-zinc-950/50 hover:bg-zinc-900/50 group"
              >
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-105 transition">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="text-sm font-medium text-zinc-200">
                  Click to browse or drop your <code className="text-amber-400">cookies.txt</code> file
                </div>
                <p className="text-xs text-zinc-500 mt-1">Accepts standard .txt Netscape format exported from your browser</p>
                <input
                  id="cookie-file-input"
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {rawText && (
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span className="text-zinc-300">File loaded ({rawText.split('\n').length} lines). Click Save to apply.</span>
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg text-xs transition"
                  >
                    {saving ? 'Saving...' : 'Apply & Save'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Guide */}
          {activeTab === 'guide' && (
            <div className="space-y-4 text-xs text-zinc-300">
              <div className="p-4 bg-zinc-950 border border-zinc-800/80 rounded-xl space-y-3">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  How to export your YouTube cookies:
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-zinc-400 leading-relaxed">
                  <li>
                    Install a trusted browser extension like{' '}
                    <strong className="text-zinc-200">"Get cookies.txt LOCALLY"</strong> (open-source Chrome/Firefox extension) or{' '}
                    <strong className="text-zinc-200">"Cookie-Editor"</strong>.
                  </li>
                  <li>
                    Open a new tab and go to{' '}
                    <a
                      href="https://www.youtube.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:underline inline-flex items-center gap-0.5"
                    >
                      youtube.com <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    while signed in.
                  </li>
                  <li>
                    Click the extension icon in your browser toolbar, select{' '}
                    <span className="text-zinc-200 font-medium">Export</span>, and choose{' '}
                    <span className="text-zinc-200 font-medium">Export as Netscape format</span>.
                  </li>
                  <li>
                    Switch back here, click the <strong className="text-zinc-200">Paste Cookies</strong> tab, paste the exported text, and click <strong className="text-amber-400">Save & Verify</strong>.
                  </li>
                </ol>
              </div>

              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 text-[11px] leading-relaxed">
                <strong className="text-zinc-300">Why are cookies needed?</strong>
                <p className="mt-1">
                  YouTube frequently enforces bot verification challenges (IP rate limits, CAPTCHA, or "Sign in to confirm you're not a bot") on Cloud servers. Providing cookies authenticates yt-dlp as a normal browser session, unlocking seamless video downloads.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="text-xs text-zinc-500">
            {cookieInfo?.configured ? (
              <span className="text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Active on server
              </span>
            ) : (
              <span className="text-zinc-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-zinc-600"></span> Inactive
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
