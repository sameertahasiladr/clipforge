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
import { SettingsView } from './components/SettingsView';

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
import {
  onAuthChange,
  signOutUser,
} from './services/firebase';

export default function App() {
  // Navigation & User State
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Core Data (Authoritative source: PostgreSQL / Cloud SQL via backend API)
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

  // Authoritative Data Load from Backend (PostgreSQL)
  const loadData = async () => {
    try {
      const [projRes, clipsRes, accRes, jobsRes, statsRes] = await Promise.all([
        apiClient.getProjects(),
        apiClient.getClips(),
        apiClient.getSocialAccounts(),
        apiClient.getPublishingJobs(),
        apiClient.getAnalytics(),
      ]);

      if (projRes.data) setProjects(projRes.data);
      if (clipsRes.data) setClips(clipsRes.data);
      if (accRes.data) setSocialAccounts(accRes.data);
      if (jobsRes.data) setPublishingJobs(jobsRes.data);
      if (statsRes.data) setAnalytics(statsRes.data);
    } catch (err) {
      console.error('Failed to load ClipForge data from backend:', err);
    }
  };

  // Initial load
  useEffect(() => {
    loadData();
  }, []);

  // Listen to Firebase Auth state for user identity
  useEffect(() => {
    // Clear legacy guest localStorage keys if present
    try {
      localStorage.removeItem('clipforge_guest_clips');
      localStorage.removeItem('clipforge_guest_projects');
    } catch {}

    const unsubscribeAuth = onAuthChange(async (authUser) => {
      setUser(authUser);
      // Reload authoritative data from PostgreSQL upon auth state transition
      loadData();
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  // Handlers — PostgreSQL backed via backend API
  const handleClipsGenerated = async (newProject: ProjectItem, newClips: ClipItem[]) => {
    // The backend pipeline already persisted newProject and newClips into PostgreSQL
    // Update local state immediately for instant responsive UI
    setProjects((prev) => [newProject, ...prev.filter((p) => p.id !== newProject.id)]);
    setClips((prev) => [...newClips, ...prev.filter((c) => !newClips.some((nc) => nc.id === c.id))]);
    setActiveTab('clips');
  };

  const handleUpdateClip = async (updatedClip: ClipItem) => {
    setClips((prev) => prev.map((c) => (c.id === updatedClip.id ? updatedClip : c)));

    try {
      await apiClient.updateClip(updatedClip.id, updatedClip);
    } catch (err) {
      console.error('Backend clip update error:', err);
    }
  };

  const handleDeleteClip = async (clipId: string) => {
    setClips((prev) => prev.filter((c) => c.id !== clipId));
    try {
      await apiClient.deleteClip(clipId);
    } catch (err) {
      console.error('Backend delete error:', err);
    }
  };

  const handleDeleteMultipleClips = async (clipIds: string[]) => {
    if (!clipIds || clipIds.length === 0) return;
    const idSet = new Set(clipIds);
    setClips((prev) => prev.filter((c) => !idSet.has(c.id)));

    try {
      await apiClient.batchDeleteClips(clipIds);
    } catch (err) {
      console.error('Batch delete backend error:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (err) {
      console.error('Sign out error:', err);
    }
    setUser(null);
    setActiveTab('landing');
  };

  const handlePublishSuccess = () => {
    apiClient.getPublishingJobs().then((res) => {
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
        onLogout={handleSignOut}
      />

      {/* Main Page Content */}
      <main className="grow">
        {activeTab === 'landing' ? (
          <LandingPage
            onStartCreating={() => setActiveTab('create')}
            onOpenDemo={() => setActiveTab('dashboard')}
          />
        ) : (
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-20">
            {activeTab === 'dashboard' && (
              <DashboardView
                user={user}
                projects={projects}
                clips={clips}
                onNavigate={setActiveTab}
                onPreviewClip={(clip) => setPreviewClip(clip)}
              />
            )}

            {activeTab === 'create' && (
              <CreateClipsView
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
                onDeleteMultipleClips={handleDeleteMultipleClips}
                onPublishClips={(targetClips) => setPublishTargetClips(targetClips)}
              />
            )}

            {activeTab === 'scheduler' && (
              <SchedulerView
                jobs={publishingJobs}
                clips={clips}
                onPreviewClip={(clip) => setPreviewClip(clip)}
                onRefreshJobs={() => {
                  apiClient.getPublishingJobs().then((res) => {
                    if (res.data) setPublishingJobs(res.data);
                  });
                }}
              />
            )}

            {activeTab === 'accounts' && (
              <AccountsView
                accounts={socialAccounts}
                onAccountsUpdated={() => {
                  apiClient.getSocialAccounts().then((res) => {
                    if (res.data) setSocialAccounts(res.data);
                  });
                }}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView user={user} />
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
