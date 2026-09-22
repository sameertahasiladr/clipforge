import React, { useState, useEffect } from 'react';
import {
  Share2,
  Instagram,
  Youtube,
  Facebook,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Unlink,
  ExternalLink,
  Lock,
  Sliders,
  Check,
  X,
  Info,
} from 'lucide-react';
import { SocialAccount, EnvironmentIntegration } from '../types';
import { apiClient } from '../services/api';

interface AccountsViewProps {
  accounts: SocialAccount[];
  onAccountsUpdated: () => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts,
  onAccountsUpdated,
}) => {
  const [loadingPlatform, setLoadingPlatform] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string>('');
  const [successToast, setSuccessToast] = useState<string>('');
  const [envStatus, setEnvStatus] = useState<EnvironmentIntegration[]>([]);

  useEffect(() => {
    apiClient.getEnvStatus().then((list) => setEnvStatus(list));
  }, []);

  const supportedPlatforms = [
    {
      platform: 'instagram' as const,
      name: 'Instagram Reels',
      icon: <Instagram className="w-6 h-6 text-pink-400" />,
      description: 'Publishes 9:16 short vertical videos directly to your Instagram profile Reels feed.',
      scopes: ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement'],
      envKey: 'INSTAGRAM_CLIENT_ID',
    },
    {
      platform: 'youtube' as const,
      name: 'YouTube Shorts',
      icon: <Youtube className="w-6 h-6 text-red-500" />,
      description: 'Uploads vertical #Shorts directly to your connected YouTube Channel using YouTube v3 Data API.',
      scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
      envKey: 'GOOGLE_CLIENT_ID / YOUTUBE_CLIENT_ID',
    },
    {
      platform: 'facebook' as const,
      name: 'Facebook Reels & Pages',
      icon: <Facebook className="w-6 h-6 text-blue-400" />,
      description: 'Distributes vertical Reels to your managed Facebook business pages and creator profiles.',
      scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
      envKey: 'FACEBOOK_APP_ID',
    },
  ];

  const handleConnect = async (platform: 'instagram' | 'facebook' | 'youtube') => {
    setLoadingPlatform(platform);
    setErrorToast('');
    setSuccessToast('');

    try {
      const res = await apiClient.connectSocialOAuth(platform);

      if (res.authUrl) {
        // Open popup window for real OAuth authorization
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        const popup = window.open(
          res.authUrl,
          `Connect ${platform}`,
          `width=${width},height=${height},top=${top},left=${left}`
        );

        // Listen for postMessage from callback
        const messageListener = (event: MessageEvent) => {
          if (event.data?.type === 'OAUTH_SUCCESS') {
            setSuccessToast(`Official ${platform} account connected successfully!`);
            onAccountsUpdated();
            window.removeEventListener('message', messageListener);
          }
        };
        window.addEventListener('message', messageListener);
      }
    } catch (err: any) {
      setErrorToast(err.message || `Failed to initiate ${platform} connection.`);
    } finally {
      setLoadingPlatform(null);
    }
  };

  const handleDisconnect = async (platform: 'instagram' | 'facebook' | 'youtube') => {
    setLoadingPlatform(platform);
    setErrorToast('');
    setSuccessToast('');

    try {
      await apiClient.disconnectSocial(platform);
      setSuccessToast(`Disconnected ${platform} account.`);
      onAccountsUpdated();
    } catch (err: any) {
      setErrorToast(err.message || 'Failed to disconnect account.');
    } finally {
      setLoadingPlatform(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Share2 className="w-6 h-6 text-violet-400" />
            <span>Connected Publishing Accounts</span>
          </h1>
          <span className="px-3 py-1 rounded-full text-xs font-bold border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
            Production Mode
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Connect your official OAuth credentials. All publishing runs directly against platform APIs.
        </p>
      </div>

      {/* Notifications */}
      {successToast && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {errorToast && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorToast}</span>
        </div>
      )}

      {/* Zero-Leak Security Notice */}
      <div className="p-4 rounded-2xl bg-[#111420] border border-violet-900/30 flex items-start gap-3">
        <Lock className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <strong className="text-violet-200">Zero-Leak Token Architecture:</strong> OAuth access
          tokens, client secrets, and refresh credentials are kept strictly server-side inside AES-256-GCM
          encrypted vaults and are never exposed to the client.
        </div>
      </div>

      {/* Social Platforms Matrix */}
      <div className="space-y-4">
        {supportedPlatforms.map((item) => {
          const account = accounts.find((a) => a.platform === item.platform);
          const isConnected = Boolean(account && account.isConnected);
          const isLoading = loadingPlatform === item.platform;

          const statusBadge = isConnected
            ? { label: 'Connected', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' }
            : { label: 'Not Connected', color: 'bg-slate-800 text-slate-400 border-slate-700' };

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
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${statusBadge.color}`}
                    >
                      {isConnected && <Check className="w-3 h-3" />}
                      {statusBadge.label}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 max-w-md">{item.description}</p>

                  {isConnected && account && (
                    <div className="flex items-center gap-2 pt-1 text-xs text-slate-300">
                      <span className="font-semibold text-white">{account.accountUsername}</span>
                      {account.channelOrPageName && (
                        <span className="text-slate-500 font-mono">({account.channelOrPageName})</span>
                      )}
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
                {isConnected ? (
                  <>
                    <button
                      disabled={isLoading}
                      onClick={() => handleConnect(item.platform)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#181c2c] hover:bg-[#22273c] text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                      title="Refresh token"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>

                    <button
                      disabled={isLoading}
                      onClick={() => handleDisconnect(item.platform)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-colors cursor-pointer"
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
                    <span>{isLoading ? 'Connecting...' : `Connect ${item.name}`}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Environment Integrations & Production Readiness Status */}
      <div className="p-5 rounded-2xl bg-[#111420] border border-[#212437] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Integration & OAuth Status
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">Zero secrets exposed</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {envStatus.map((env) => (
            <div
              key={env.service}
              className="p-3 rounded-xl bg-[#161a29] border border-[#22273c] space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">{env.service}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    env.status === 'Configured'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}
                >
                  {env.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{env.instructions}</p>
              <div className="text-[10px] font-mono text-slate-500">{env.keyName}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
