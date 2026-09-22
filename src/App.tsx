/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { DashboardView } from './components/DashboardView';
import { CreateClipsView } from './components/CreateClipsView';
import { ClipReviewView } from './components/ClipReviewView';
import { SchedulerView } from './components/SchedulerView';
import { AccountsView } from './components/AccountsView';
import { AnalyticsView } from './components/AnalyticsView';

// Modals
import { AuthModal } from './components/AuthModal';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import { VideoEditorModal } from './components/VideoEditorModal';
import { AiCaptionModal } from './components/AiCaptionModal';
import { PublishModal } from './components/PublishModal';

import {
  UserProfile,
  ProjectItem,
  ClipItem,
  SocialAccount,
  PublishingJob,
  AnalyticsSummary,
  NavigationTab,
} from './types';
import { apiClient } from './services/api';

export default function App() {
  // Navigation & User State
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');

  const [user, setUser] = useState<UserProfile>({
    id: 'usr_demo_1',
    email: 'creator@clipforge.ai',
    fullName: 'Alex Mercer',
    role: 'creator',
    planTier: 'pro',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
  });

  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Core Data
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [publishingJobs, setPublishingJobs] = useState<PublishingJob[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary>({
    totalViews: 0,
    totalLikes: 0,
    totalShares: 0,
    totalComments: 0,
    averageWatchTimeSeconds: 0,
    completionRatePercent: 0,
    platformBreakdown: {
      instagram: 0,
      youtube: 0,
      facebook: 0,
    },
    aiObservations: [],
  });

  // Modal active targets
  const [previewClip, setPreviewClip] = useState<ClipItem | null>(null);
  const [editorClip, setEditorClip] = useState<ClipItem | null>(null);
  const [captionClip, setCaptionClip] = useState<ClipItem | null>(null);
  const [publishTargetClips, setPublishTargetClips] = useState<ClipItem[]>([]);

  // Initial Data Load based on Mode
  const loadDataForMode = async (demo: boolean) => {
    try {
      const mode = demo ? 'demo' : 'production';
      const [projRes, clipsRes, accRes, jobsRes, statsRes] = await Promise.all([
        apiClient.getProjects(mode),
        apiClient.getClips(mode),
        apiClient.getSocialAccounts(mode),
        apiClient.getPublishingJobs(mode),
        apiClient.getAnalytics(mode),
      ]);

      if (projRes.data) setProjects(projRes.data);
      if (clipsRes.data) setClips(clipsRes.data);
      if (accRes.data) setSocialAccounts(accRes.data);
      if (jobsRes.data) setPublishingJobs(jobsRes.data);
      if (statsRes.data) setAnalytics(statsRes.data);
    } catch (err) {
      console.error('Failed to load ClipForge data for mode', demo, err);
    }
  };

  useEffect(() => {
    loadDataForMode(isDemoMode);
  }, [isDemoMode]);

  // Handlers
  const handleClipsGenerated = (newProject: ProjectItem, newClips: ClipItem[]) => {
    setProjects([newProject, ...projects]);
    setClips([...newClips, ...clips]);
    setActiveTab('clips');
  };

  const handleUpdateClip = (updatedClip: ClipItem) => {
    setClips(clips.map((c) => (c.id === updatedClip.id ? updatedClip : c)));
  };

  const handleDeleteClip = async (clipId: string) => {
    try {
      await apiClient.deleteClip(clipId);
      setClips(clips.filter((c) => c.id !== clipId));
    } catch {
      setClips(clips.filter((c) => c.id !== clipId));
    }
  };

  const handlePublishSuccess = () => {
    const mode = isDemoMode ? 'demo' : 'production';
    apiClient.getPublishingJobs(mode).then((res) => {
      if (res.data) setPublishingJobs(res.data);
    });
    setActiveTab('scheduler');
  };

  return (
    <div className="min-h-screen bg-[#0a0b10] text-slate-100 flex flex-col font-sans selection:bg-violet-600 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        currentTab={activeTab}
        onSelectTab={setActiveTab}
        user={user}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onLogout={() => {
          setActiveTab('landing');
        }}
        isDemoMode={isDemoMode}
        onToggleDemoMode={() => setIsDemoMode(!isDemoMode)}
      />

      {/* Main Page Content */}
      <main className="grow">
        {activeTab === 'landing' ? (
          <LandingPage
            onStartCreating={() => setActiveTab('create')}
            onOpenDemo={() => setActiveTab('dashboard')}
          />
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20">
            {activeTab === 'dashboard' && (
              <DashboardView
                user={user}
                projects={projects}
                clips={clips}
                onNavigate={setActiveTab}
                onPreviewClip={(clip) => setPreviewClip(clip)}
                onQuickAnalyze={() => {
                  setActiveTab('create');
                }}
              />
            )}

            {activeTab === 'create' && (
              <CreateClipsView
                isDemoMode={isDemoMode}
                onClipsGenerated={handleClipsGenerated}
              />
            )}

            {activeTab === 'clips' && (
              <ClipReviewView
                clips={clips}
                onPreviewClip={(clip) => setPreviewClip(clip)}
                onEditClip={(clip) => setEditorClip(clip)}
                onRegenerateCaption={(clip) => setCaptionClip(clip)}
                onDeleteClip={handleDeleteClip}
                onPublishClips={(targetClips) => setPublishTargetClips(targetClips)}
              />
            )}

            {activeTab === 'scheduler' && (
              <SchedulerView
                jobs={publishingJobs}
                clips={clips}
                isDemoMode={isDemoMode}
                onPreviewClip={(clip) => setPreviewClip(clip)}
                onRefreshJobs={() => {
                  const mode = isDemoMode ? 'demo' : 'production';
                  apiClient.getPublishingJobs(mode).then((res) => {
                    if (res.data) setPublishingJobs(res.data);
                  });
                }}
              />
            )}

            {activeTab === 'accounts' && (
              <AccountsView
                accounts={socialAccounts}
                isDemoMode={isDemoMode}
                onAccountsUpdated={() => {
                  const mode = isDemoMode ? 'demo' : 'production';
                  apiClient.getSocialAccounts(mode).then((res) => {
                    if (res.data) setSocialAccounts(res.data);
                  });
                }}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsView
                analytics={analytics}
                topClips={clips}
                onPreviewClip={(clip) => setPreviewClip(clip)}
              />
            )}
          </div>
        )}
      </main>

      {/* Modals & Dialogs */}
      {isAuthModalOpen && (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={(newUser) => {
            setUser(newUser);
            setActiveTab('dashboard');
          }}
        />
      )}

      {previewClip && (
        <VideoPlayerModal
          clip={previewClip}
          onClose={() => setPreviewClip(null)}
          onOpenEditor={(clip) => {
            setPreviewClip(null);
            setEditorClip(clip);
          }}
          onOpenPublish={(clip) => {
            setPreviewClip(null);
            setPublishTargetClips([clip]);
          }}
        />
      )}

      {editorClip && (
        <VideoEditorModal
          clip={editorClip}
          onClose={() => setEditorClip(null)}
          onSave={handleUpdateClip}
        />
      )}

      {captionClip && (
        <AiCaptionModal
          clip={captionClip}
          onClose={() => setCaptionClip(null)}
          onApply={(updatedData) => {
            const updated: ClipItem = {
              ...captionClip,
              title: updatedData.title,
              hook: updatedData.hook,
              suggestedCaption: updatedData.suggestedCaption,
              description: updatedData.description,
              hashtags: updatedData.hashtags,
              callToAction: updatedData.callToAction,
            };
            handleUpdateClip(updated);
          }}
        />
      )}

      {publishTargetClips.length > 0 && (
        <PublishModal
          clips={publishTargetClips}
          socialAccounts={socialAccounts}
          isDemoMode={isDemoMode}
          onClose={() => setPublishTargetClips([])}
          onSuccess={handlePublishSuccess}
          onConnectAccount={() => {
            setPublishTargetClips([]);
            setActiveTab('accounts');
          }}
        />
      )}
    </div>
  );
}
