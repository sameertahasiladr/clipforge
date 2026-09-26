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
  testFirestoreConnection,
  onAuthChange,
  signOutUser,
  saveProjectToFirestore,
  getProjectsFromFirestore,
  saveClipToFirestore,
  getUserClipsFromFirestore,
  deleteClipFromFirestore,
  subscribeToUserClips,
  subscribeToUserProjects,
  auth,
} from './services/firebase';

export default function App() {
  // Navigation & User State
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');

  const [user, setUser] = useState<UserProfile | null>(null);
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

  // Validate Firestore Connection at application boot
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Listen to Firebase Auth state & establish real-time cross-device sync
  useEffect(() => {
    let unsubscribeClips: (() => void) | null = null;
    let unsubscribeProjects: (() => void) | null = null;

    const unsubscribeAuth = onAuthChange(async (authUser) => {
      setUser(authUser);

      // Clean up previous real-time listeners if any
      if (unsubscribeClips) {
        unsubscribeClips();
        unsubscribeClips = null;
      }
      if (unsubscribeProjects) {
        unsubscribeProjects();
        unsubscribeProjects = null;
      }

      if (authUser) {
        try {
          // 1. Sync any existing local/in-memory generated clips to Firestore under authUser.id
          // This ensures that clips generated on laptop before login are automatically saved to the user's account!
          try {
            const guestClipsRaw = localStorage.getItem('clipforge_guest_clips');
            const guestProjectsRaw = localStorage.getItem('clipforge_guest_projects');
            const pendingClips: ClipItem[] = guestClipsRaw ? JSON.parse(guestClipsRaw) : [];
            const pendingProjects: ProjectItem[] = guestProjectsRaw ? JSON.parse(guestProjectsRaw) : [];

            // Merge with any in-memory state clips
            setProjects((currentProjects) => {
              for (const p of currentProjects) {
                if (!pendingProjects.some((exist) => exist.id === p.id)) {
                  pendingProjects.push(p);
                }
              }
              return currentProjects;
            });

            setClips((currentClips) => {
              for (const c of currentClips) {
                if (!pendingClips.some((exist) => exist.id === c.id)) {
                  pendingClips.push(c);
                }
              }
              return currentClips;
            });

            if (pendingProjects.length > 0 || pendingClips.length > 0) {
              for (const p of pendingProjects) {
                await saveProjectToFirestore(authUser.id, p).catch(() => {});
              }
              for (const c of pendingClips) {
                await saveClipToFirestore(authUser.id, c.projectId, c).catch(() => {});
              }
              localStorage.removeItem('clipforge_guest_clips');
              localStorage.removeItem('clipforge_guest_projects');
            }
          } catch (migErr) {
            console.warn('Migration of guest clips failed:', migErr);
          }

          // 2. Fetch all user projects and clips from Firestore
          const firestoreProjects = await getProjectsFromFirestore(authUser.id);
          if (firestoreProjects && firestoreProjects.length > 0) {
            setProjects(firestoreProjects);
          }
          const firestoreClips = await getUserClipsFromFirestore(authUser.id, firestoreProjects || []);
          if (firestoreClips && firestoreClips.length > 0) {
            setClips(firestoreClips);
          }

          // 3. Set up REAL-TIME LISTENERS so clips generated on laptop appear on mobile / another tab instantly
          unsubscribeClips = subscribeToUserClips(authUser.id, (realtimeClips) => {
            if (realtimeClips && realtimeClips.length > 0) {
              setClips(realtimeClips);
            }
          });

          unsubscribeProjects = subscribeToUserProjects(authUser.id, (realtimeProjects) => {
            if (realtimeProjects && realtimeProjects.length > 0) {
              setProjects(realtimeProjects);
            }
          });
        } catch (e) {
          console.error('Error loading Firestore data for user:', e);
        }
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeClips) unsubscribeClips();
      if (unsubscribeProjects) unsubscribeProjects();
    };
  }, []);

  // Initial General Data Load
  const loadData = async () => {
    try {
      const [projRes, clipsRes, accRes, jobsRes, statsRes] = await Promise.all([
        apiClient.getProjects(),
        apiClient.getClips(),
        apiClient.getSocialAccounts(),
        apiClient.getPublishingJobs(),
        apiClient.getAnalytics(),
      ]);

      if (projRes.data && !user) setProjects(projRes.data);
      if (clipsRes.data && !user) setClips(clipsRes.data);
      if (accRes.data) setSocialAccounts(accRes.data);
      if (jobsRes.data) setPublishingJobs(jobsRes.data);
      if (statsRes.data) setAnalytics(statsRes.data);
    } catch (err) {
      console.error('Failed to load ClipForge data', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handlers
  const handleClipsGenerated = async (newProject: ProjectItem, newClips: ClipItem[]) => {
    // Immediately update state in current tab
    setProjects((prev) => [newProject, ...prev.filter((p) => p.id !== newProject.id)]);
    setClips((prev) => [...newClips, ...prev.filter((c) => !newClips.some((nc) => nc.id === c.id))]);
    setActiveTab('clips');

    const activeUserId = user?.id || auth.currentUser?.uid;

    if (activeUserId) {
      // User is authenticated: Persist project and clips to Firestore for instant cross-device sync
      try {
        await saveProjectToFirestore(activeUserId, newProject);
        await Promise.all(
          newClips.map((clip) => saveClipToFirestore(activeUserId, newProject.id, clip))
        );
      } catch (err) {
        console.error('Failed to save generated clips to Firestore:', err);
      }
    } else {
      // User is a guest: Save to localStorage so they migrate automatically upon sign in
      try {
        const guestClipsRaw = localStorage.getItem('clipforge_guest_clips');
        const guestProjectsRaw = localStorage.getItem('clipforge_guest_projects');
        const existingClips: ClipItem[] = guestClipsRaw ? JSON.parse(guestClipsRaw) : [];
        const existingProjects: ProjectItem[] = guestProjectsRaw ? JSON.parse(guestProjectsRaw) : [];

        localStorage.setItem(
          'clipforge_guest_projects',
          JSON.stringify([newProject, ...existingProjects.filter((p) => p.id !== newProject.id)])
        );
        localStorage.setItem(
          'clipforge_guest_clips',
          JSON.stringify([...newClips, ...existingClips.filter((c) => !newClips.some((nc) => nc.id === c.id))])
        );
      } catch (err) {
        console.warn('Could not cache guest clips:', err);
      }
    }
  };

  const handleUpdateClip = async (updatedClip: ClipItem) => {
    setClips((prev) => prev.map((c) => (c.id === updatedClip.id ? updatedClip : c)));

    const activeUserId = user?.id || auth.currentUser?.uid;
    if (activeUserId && updatedClip.projectId) {
      saveClipToFirestore(activeUserId, updatedClip.projectId, updatedClip).catch((err) =>
        console.error('Failed to update clip in Firestore:', err)
      );
    }
  };

  const handleDeleteClip = async (clipId: string) => {
    const clipToDelete = clips.find((c) => c.id === clipId);
    setClips((prev) => prev.filter((c) => c.id !== clipId));
    try {
      await apiClient.deleteClip(clipId);
    } catch (err) {
      console.warn('Backend delete notification error:', err);
    }

    const activeUserId = user?.id || auth.currentUser?.uid;
    if (activeUserId && clipToDelete?.projectId) {
      deleteClipFromFirestore(activeUserId, clipToDelete.projectId, clipId).catch((err) =>
        console.error('Failed to delete clip from Firestore:', err)
      );
    }
  };

  const handleDeleteMultipleClips = async (clipIds: string[]) => {
    if (!clipIds || clipIds.length === 0) return;
    const idSet = new Set(clipIds);
    const clipsToDelete = clips.filter((c) => idSet.has(c.id));
    setClips((prev) => prev.filter((c) => !idSet.has(c.id)));

    try {
      await apiClient.batchDeleteClips(clipIds);
    } catch (err) {
      console.warn('Batch delete backend error:', err);
    }

    const activeUserId = user?.id || auth.currentUser?.uid;
    if (activeUserId) {
      for (const c of clipsToDelete) {
        if (c.projectId) {
          deleteClipFromFirestore(activeUserId, c.projectId, c.id).catch((err) =>
            console.error('Failed to delete clip from Firestore:', err)
          );
        }
      }
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
