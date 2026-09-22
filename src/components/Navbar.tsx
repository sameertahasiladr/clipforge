import React, { useState } from 'react';
import {
  Sparkles,
  LayoutDashboard,
  Video,
  FolderKanban,
  Film,
  Send,
  Calendar,
  Share2,
  BarChart3,
  Settings,
  CreditCard,
  Bell,
  LogOut,
  CheckCircle,
  ExternalLink,
  ChevronDown,
  PlaySquare,
} from 'lucide-react';
import { NavigationTab, UserProfile } from '../types';

interface NavbarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  user: UserProfile | null;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  user,
  onOpenAuth,
  onLogout,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const notifications = [
    { id: 1, title: 'AI Analysis Ready', time: 'Just now', desc: 'Production video processing pipeline initialized.' },
  ];

  const navItems: Array<{ id: NavigationTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'create', label: 'Create Clips', icon: <Video className="w-4 h-4 text-violet-400" /> },
    { id: 'projects', label: 'Projects', icon: <FolderKanban className="w-4 h-4" /> },
    { id: 'clips', label: 'Generated Clips', icon: <Film className="w-4 h-4" /> },
    { id: 'scheduler', label: 'Publishing', icon: <Send className="w-4 h-4" /> },
    { id: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" /> },
    { id: 'accounts', label: 'Accounts', icon: <Share2 className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'pricing', label: 'Pricing', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#0d0f17]/95 backdrop-blur-md border-b border-[#1f2333]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => onSelectTab(user ? 'dashboard' : 'landing')}
              className="flex items-center gap-2.5 text-left group"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-500 p-0.5 shadow-lg shadow-violet-500/20 group-hover:shadow-violet-500/40 transition-all">
                <div className="w-full h-full bg-[#0d0f17] rounded-[10px] flex items-center justify-center">
                  <PlaySquare className="w-5 h-5 text-violet-400" />
                </div>
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                  ClipForge <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-300">AI</span>
                </span>
                <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium -mt-1">
                  Short-Form Video Engine
                </span>
              </div>
            </button>

            {/* Desktop Navigation */}
            {user && (
              <nav className="hidden xl:flex items-center space-x-1 pl-4 border-l border-[#1f2333]">
                {navItems.slice(0, 7).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      currentTab === item.id
                        ? 'bg-violet-600/15 text-violet-300 border border-violet-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#151824]'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {/* Live Pipeline Status Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Production Pipeline Active</span>
            </div>

            {user ? (
              <>
                {/* Create Clips CTA button */}
                <button
                  onClick={() => onSelectTab('create')}
                  className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/25 hover:from-violet-500 hover:to-indigo-500 transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Create Clips</span>
                </button>

                {/* Notifications */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowNotifications(!showNotifications);
                      setShowUserMenu(false);
                    }}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#151824] transition-colors relative"
                    aria-label="Notifications"
                  >
                    <Bell className="w-4 h-4" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-violet-500 ring-2 ring-[#0d0f17]" />
                  </button>

                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 rounded-xl bg-[#131622] border border-[#25283b] shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center justify-between pb-2 border-b border-[#25283b]">
                        <span className="text-xs font-semibold text-slate-200">Notifications</span>
                        <span className="text-[11px] text-violet-400 cursor-pointer hover:underline">Mark all read</span>
                      </div>
                      <div className="divide-y divide-[#1e2235]">
                        {notifications.map((n) => (
                          <div key={n.id} className="py-2.5 px-1 hover:bg-[#181c2b] rounded-lg transition-colors">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-200">{n.title}</span>
                              <span className="text-[10px] text-slate-500">{n.time}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{n.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* User Avatar Menu */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowUserMenu(!showUserMenu);
                      setShowNotifications(false);
                    }}
                    className="flex items-center gap-2 p-1 pl-2 rounded-lg hover:bg-[#151824] transition-colors"
                  >
                    <img
                      src={user.avatarUrl}
                      alt={user.fullName}
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-violet-500/40"
                    />
                    <span className="hidden md:block text-xs font-medium text-slate-300">
                      {user.fullName}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#131622] border border-[#25283b] shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2">
                      <div className="px-3 py-2 border-b border-[#25283b]">
                        <p className="text-xs font-semibold text-slate-200">{user.fullName}</p>
                        <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-violet-600/20 text-violet-300 border border-violet-500/30">
                          {user.planTier} Plan
                        </span>
                      </div>

                      <div className="py-1">
                        <button
                          onClick={() => {
                            onSelectTab('dashboard');
                            setShowUserMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-[#1d2133] rounded-lg transition-colors"
                        >
                          <LayoutDashboard className="w-3.5 h-3.5 text-slate-400" />
                          Dashboard
                        </button>
                        <button
                          onClick={() => {
                            onSelectTab('pricing');
                            setShowUserMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-[#1d2133] rounded-lg transition-colors"
                        >
                          <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                          Subscription & Plans
                        </button>
                        <button
                          onClick={() => {
                            onSelectTab('settings');
                            setShowUserMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-[#1d2133] rounded-lg transition-colors"
                        >
                          <Settings className="w-3.5 h-3.5 text-slate-400" />
                          Settings
                        </button>
                      </div>

                      <div className="pt-1 border-t border-[#25283b]">
                        <button
                          onClick={() => {
                            onLogout();
                            setShowUserMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenAuth}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={onOpenAuth}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/20 transition-all"
                >
                  Get Started
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Secondary Navigation Row for Tablet / Mobile when logged in */}
        {user && (
          <div className="flex xl:hidden items-center space-x-1 py-2 overflow-x-auto border-t border-[#1f2333]/50">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap font-medium transition-colors ${
                  currentTab === item.id
                    ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
};
