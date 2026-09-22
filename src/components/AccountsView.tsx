import React, { useState } from 'react';
import {
  Share2,
  Instagram,
  Youtube,
  Facebook,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Unlink,
  ExternalLink,
  Lock,
  Sparkles,
} from 'lucide-react';
import { SocialAccount } from '../types';
import { apiClient } from '../services/api';

interface AccountsViewProps {
  accounts: SocialAccount[];
  onAccountsUpdated: () => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({ accounts, onAccountsUpdated }) => {
  const [loadingPlatform, setLoadingPlatform] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string>('');

  const supportedPlatforms = [
    {
      platform: 'instagram',
      name: 'Instagram Reels',
      icon: <Instagram className="w-6 h-6 text-pink-400" />,
      color: 'from-pink-500/20 to-purple-500/10',
      description: 'Publishes 9:16 short vertical videos directly to your Instagram profile Reels feed.',
      scopes: ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement'],
    },
    {
      platform: 'youtube',
      name: 'YouTube Shorts',
      icon: <Youtube className="w-6 h-6 text-red-500" />,
      color: 'from-red-500/20 to-rose-500/10',
      description: 'Uploads vertical #Shorts directly to your connected YouTube Channel using YouTube v3 Data API.',
      scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
    },
    {
      platform: 'facebook',
      name: 'Facebook Reels & Pages',
      icon: <Facebook className="w-6 h-6 text-blue-400" />,
      color: 'from-blue-500/20 to-indigo-500/10',
      description: 'Distributes vertical Reels to your managed Facebook business pages and creator profiles.',
      scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
    },
  ];

  const handleConnect = async (platform: string) => {
    setLoadingPlatform(platform);
    try {
      await apiClient.connectSocialAccount({
        platform: platform as any,
        accountName: `@clipforge_${platform}`,
        accountHandle: `clipforge_${platform}_official`,
        avatarUrl: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100`,
      });

      setSuccessToast(`Successfully connected ${platform} with official API scope!`);
      onAccountsUpdated();
      setTimeout(() => setSuccessToast(''), 3000);
    } catch {
      onAccountsUpdated();
    } finally {
      setLoadingPlatform(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    setLoadingPlatform(id);
    try {
      await apiClient.disconnectSocialAccount(id);
      setSuccessToast('Account disconnected and access tokens revoked safely.');
      onAccountsUpdated();
      setTimeout(() => setSuccessToast(''), 3000);
    } catch {
      onAccountsUpdated();
    } finally {
      setLoadingPlatform(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in pb-16">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
          <Share2 className="w-6 h-6 text-violet-400" />
          <span>Connected Publishing Accounts</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Connect your social accounts via official OAuth protocols to enable one-click publishing and automated scheduling.
        </p>
      </div>

      {/* Success Notification */}
      {successToast && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Enterprise Security Architecture Callout */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-950/30 to-[#121522] border border-violet-800/30 flex items-start gap-3">
        <Lock className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <strong className="text-violet-200">Zero-Leak Token Architecture:</strong> OAuth access
          tokens, client secrets, and refresh credentials are kept server-side inside encrypted session
          vaults and never broadcast to the browser runtime.
        </div>
      </div>

      {/* Social Platforms Matrix */}
      <div className="space-y-4">
        {supportedPlatforms.map((item) => {
          const connectedAccount = accounts.find(
            (a) => a.platform === item.platform && a.isConnected
          );
          const isConnected = !!connectedAccount;
          const isLoading = loadingPlatform === item.platform || loadingPlatform === connectedAccount?.id;

          return (
            <div
              key={item.platform}
              className="p-5 rounded-2xl bg-[#111420] border border-[#212437] hover:border-violet-500/30 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-5"
            >
              {/* Left Identity */}
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-2xl bg-[#171b2b] border border-[#272c42] shrink-0">
                  {item.icon}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{item.name}</h3>
                    {isConnected ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Connected
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">
                        Disconnected
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 max-w-md">{item.description}</p>

                  {isConnected && connectedAccount && (
                    <div className="flex items-center gap-2 pt-1 text-xs text-slate-300">
                      <span className="font-semibold text-white">{connectedAccount.accountName}</span>
                      <span className="text-slate-500 font-mono">(@{connectedAccount.accountHandle})</span>
                    </div>
                  )}

                  {/* Scopes badge */}
                  <div className="flex flex-wrap gap-1 pt-1.5">
                    {item.scopes.map((sc, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded bg-[#161a29] border border-[#23273c] text-[10px] font-mono text-slate-400"
                      >
                        {sc}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
                {isConnected && connectedAccount ? (
                  <>
                    <button
                      disabled={isLoading}
                      onClick={() => handleConnect(item.platform)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#181c2c] hover:bg-[#22273c] text-xs font-semibold text-slate-300 transition-colors"
                      title="Refresh token"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                      <span>Refresh Token</span>
                    </button>

                    <button
                      disabled={isLoading}
                      onClick={() => handleDisconnect(connectedAccount.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-colors"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </>
                ) : (
                  <button
                    disabled={isLoading}
                    onClick={() => handleConnect(item.platform)}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-bold text-white shadow-md shadow-violet-600/25 transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{isLoading ? 'Connecting OAuth...' : `Connect ${item.name}`}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Demo Mode Notice */}
      <div className="p-4 rounded-xl bg-[#141724] border border-[#212437] text-xs text-slate-400 space-y-1">
        <span className="font-bold text-slate-200">Demo Mode Active:</span>
        <p>
          In Demo Mode, social account connections and official token exchanges are simulated safely
          so you can test end-to-end publishing pipelines without production API credentials.
        </p>
      </div>
    </div>
  );
};
