import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  getDocFromServer,
  onSnapshot,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, ProjectItem, ClipItem } from '../types';

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Cloud Firestore using provisioned database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Operation Types for error diagnosis
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validates connection to Firestore at app boot
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore: Client is offline or network is disconnected.');
    }
    return false;
  }
}

/**
 * Sign in with Google Popup
 */
export async function signInWithGoogle(): Promise<UserProfile> {
  const result = await signInWithPopup(auth, googleProvider);
  return await syncUserProfile(result.user);
}

/**
 * Sign in with Email and Password
 */
export async function signInWithEmail(email: string, pass: string): Promise<UserProfile> {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  return await syncUserProfile(result.user);
}

/**
 * Sign up with Email and Password
 */
export async function signUpWithEmail(email: string, pass: string, displayName?: string): Promise<UserProfile> {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  if (displayName && result.user) {
    await updateProfile(result.user, { displayName });
  }
  return await syncUserProfile(result.user);
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Sign out current user
 */
export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

/**
 * Listen to Auth State changes
 */
export function onAuthChange(callback: (user: UserProfile | null) => void) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      try {
        const profile = await syncUserProfile(firebaseUser);
        callback(profile);
      } catch {
        callback({
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          fullName: firebaseUser.displayName || 'ClipForge Creator',
          role: 'creator',
          planTier: 'pro',
        });
      }
    } else {
      callback(null);
    }
  });
}

/**
 * Sync user profile to Firestore document: /users/{userId}
 */
export async function syncUserProfile(firebaseUser: FirebaseUser): Promise<UserProfile> {
  const userRef = doc(db, 'users', firebaseUser.uid);
  const path = `users/${firebaseUser.uid}`;

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        id: firebaseUser.uid,
        email: data.email || firebaseUser.email || '',
        fullName: data.displayName || firebaseUser.displayName || 'ClipForge Creator',
        role: 'creator',
        planTier: 'pro',
      };
    } else {
      const newProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || 'ClipForge Creator',
        photoURL: firebaseUser.photoURL || '',
        createdAt: new Date().toISOString(),
      };
      await setDoc(userRef, newProfile);
      return {
        id: firebaseUser.uid,
        email: newProfile.email,
        fullName: newProfile.displayName,
        role: 'creator',
        planTier: 'pro',
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Persist a project to Firestore: /users/{userId}/projects/{projectId}
 */
export async function saveProjectToFirestore(userId: string, project: ProjectItem): Promise<void> {
  const projectRef = doc(db, 'users', userId, 'projects', project.id);
  const path = `users/${userId}/projects/${project.id}`;

  try {
    await setDoc(
      projectRef,
      {
        id: project.id,
        userId: userId,
        title: project.title,
        sourceUrl: project.sourceUrl || '',
        sourceType: project.sourceType || 'upload',
        thumbnailUrl: project.thumbnailUrl || '',
        duration: project.durationSeconds || 0,
        durationSeconds: project.durationSeconds || 0,
        status: project.status || 'completed',
        clipsCount: project.clipsCount || 0,
        publishedCount: project.publishedCount || 0,
        draftCount: project.draftCount || 0,
        createdAt: project.createdAt || new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Fetch all user projects from Firestore
 */
export async function getProjectsFromFirestore(userId: string): Promise<ProjectItem[]> {
  const collRef = collection(db, 'users', userId, 'projects');
  const path = `users/${userId}/projects`;

  try {
    const snap = await getDocs(collRef);
    const list: ProjectItem[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: data.id || d.id,
        title: data.title || 'Untitled Video',
        sourceUrl: data.sourceUrl || '',
        sourceType: data.sourceType || 'youtube',
        thumbnailUrl: data.thumbnailUrl || '',
        durationSeconds: data.durationSeconds || 0,
        status: data.status || 'completed',
        clipsCount: data.clipsCount || 0,
        publishedCount: data.publishedCount || 0,
        draftCount: data.draftCount || 0,
        createdAt: data.createdAt || new Date().toISOString(),
      });
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Persist a clip to Firestore:
 * Writes to both /users/{userId}/clips/{clipId} (direct user-level)
 * and /users/{userId}/projects/{projectId}/clips/{clipId} (nested under project)
 * for instant cross-device and multi-tab sync.
 */
export async function saveClipToFirestore(userId: string, projectId: string, clip: ClipItem): Promise<void> {
  const directClipRef = doc(db, 'users', userId, 'clips', clip.id);
  const nestedClipRef = doc(db, 'users', userId, 'projects', projectId, 'clips', clip.id);
  const path = `users/${userId}/clips/${clip.id}`;

  try {
    const startTime = typeof clip.startTimeSeconds === 'number' ? clip.startTimeSeconds : 0;
    const endTime = typeof clip.endTimeSeconds === 'number' ? clip.endTimeSeconds : startTime + 30;
    const duration = clip.durationSeconds || Math.max(3, endTime - startTime);
    const createdAt = (clip as any).createdAt || new Date().toISOString();

    const clipPayload = {
      id: clip.id,
      projectId: projectId,
      userId: userId,
      clipNumber: clip.clipNumber || 1,
      title: clip.title || 'Viral Hook',
      hook: clip.hook || clip.title || '',
      description: clip.description || '',
      suggestedCaption: clip.suggestedCaption || '',
      hashtags: Array.isArray(clip.hashtags) ? clip.hashtags : ['#shorts', '#viral'],
      callToAction: clip.callToAction || '',
      aiViralScore: clip.aiViralScore || 85,
      viralityScore: clip.aiViralScore || 85,
      startTime: startTime,
      endTime: endTime,
      startTimeSeconds: startTime,
      endTimeSeconds: endTime,
      duration: duration,
      durationSeconds: duration,
      aspectRatio: clip.aspectRatio || '9:16',
      thumbnailUrl: clip.thumbnailUrl || '',
      videoUrl: clip.videoUrl || '',
      localRenderPath: clip.localRenderPath || '',
      status: clip.status || 'draft',
      captionStyle: clip.captionStyle || 'bold',
      fontFamily: clip.fontFamily || 'Inter',
      captionPosition: clip.captionPosition || 'bottom',
      watermarkEnabled: !!clip.watermarkEnabled,
      watermarkText: clip.watermarkText || '',
      speakerCenterXPercent: clip.speakerCenterXPercent || 50,
      fullText: clip.fullText || '',
      renderStatus: clip.renderStatus || 'completed',
      createdAt: createdAt,
    };

    // Save to both locations concurrently
    await Promise.all([
      setDoc(directClipRef, clipPayload, { merge: true }),
      setDoc(nestedClipRef, clipPayload, { merge: true }),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Parses a raw Firestore document snapshot into a type-safe ClipItem
 */
function parseClipDoc(data: any, docId: string, fallbackProjectId?: string): ClipItem {
  return {
    id: data.id || docId,
    projectId: data.projectId || fallbackProjectId || 'unknown',
    clipNumber: data.clipNumber || 1,
    title: data.title || 'Viral Hook',
    hook: data.hook || data.title || '',
    description: data.description || '',
    suggestedCaption: data.suggestedCaption || '',
    hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
    callToAction: data.callToAction || '',
    aiViralScore: data.aiViralScore || data.viralityScore || 85,
    startTimeSeconds: typeof data.startTimeSeconds === 'number' ? data.startTimeSeconds : 0,
    endTimeSeconds: typeof data.endTimeSeconds === 'number' ? data.endTimeSeconds : 30,
    durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : 30,
    aspectRatio: data.aspectRatio || '9:16',
    thumbnailUrl: data.thumbnailUrl || '',
    videoUrl: data.videoUrl || '',
    localRenderPath: data.localRenderPath || '',
    status: data.status || 'draft',
    captionStyle: data.captionStyle || 'bold',
    fontFamily: data.fontFamily || 'Inter',
    captionPosition: data.captionPosition || 'bottom',
    watermarkEnabled: !!data.watermarkEnabled,
    watermarkText: data.watermarkText || '',
    speakerCenterXPercent: typeof data.speakerCenterXPercent === 'number' ? data.speakerCenterXPercent : 50,
    fullText: data.fullText || '',
    renderStatus: data.renderStatus || 'completed',
  };
}

/**
 * Fetch all user clips across projects from Firestore.
 * Prioritizes the direct /users/{userId}/clips collection for atomic 1-query fetch,
 * and merges with /users/{userId}/projects/{projId}/clips for backward compatibility.
 */
export async function getUserClipsFromFirestore(userId: string, projects: ProjectItem[]): Promise<ClipItem[]> {
  const clipMap = new Map<string, ClipItem>();

  // 1. First, fetch from direct user clips collection
  try {
    const directColl = collection(db, 'users', userId, 'clips');
    const snap = await getDocs(directColl);
    snap.forEach((docSnap) => {
      const clip = parseClipDoc(docSnap.data(), docSnap.id);
      clipMap.set(clip.id, clip);
    });
  } catch (err) {
    console.warn('Could not query direct /users/{userId}/clips, trying subcollections:', err);
  }

  // 2. Fetch from per-project subcollections and merge
  for (const proj of projects) {
    const clipsColl = collection(db, 'users', userId, 'projects', proj.id, 'clips');
    try {
      const snap = await getDocs(clipsColl);
      snap.forEach((docSnap) => {
        const clip = parseClipDoc(docSnap.data(), docSnap.id, proj.id);
        if (!clipMap.has(clip.id)) {
          clipMap.set(clip.id, clip);
        }
      });
    } catch (error) {
      // Do not abort all clips if a single project fails to query
      console.warn(`Error querying clips for project ${proj.id}:`, error);
    }
  }

  return Array.from(clipMap.values());
}

/**
 * Real-time listener for user clips across devices and tabs
 */
export function subscribeToUserClips(
  userId: string,
  onUpdate: (clips: ClipItem[]) => void
): () => void {
  const directColl = collection(db, 'users', userId, 'clips');
  return onSnapshot(
    directColl,
    (snap) => {
      const clips: ClipItem[] = [];
      snap.forEach((docSnap) => {
        clips.push(parseClipDoc(docSnap.data(), docSnap.id));
      });
      if (clips.length > 0) {
        onUpdate(clips);
      }
    },
    (err) => {
      console.warn('Real-time clip subscription error:', err);
    }
  );
}

/**
 * Real-time listener for user projects across devices and tabs
 */
export function subscribeToUserProjects(
  userId: string,
  onUpdate: (projects: ProjectItem[]) => void
): () => void {
  const projColl = collection(db, 'users', userId, 'projects');
  return onSnapshot(
    projColl,
    (snap) => {
      const projs: ProjectItem[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        projs.push({
          id: data.id || docSnap.id,
          title: data.title || 'Untitled Project',
          sourceUrl: data.sourceUrl || '',
          sourceType: data.sourceType || 'youtube',
          thumbnailUrl: data.thumbnailUrl || '',
          durationSeconds: data.durationSeconds || 0,
          status: data.status || 'completed',
          clipsCount: data.clipsCount || 0,
          publishedCount: data.publishedCount || 0,
          draftCount: data.draftCount || 0,
          createdAt: data.createdAt || new Date().toISOString(),
        });
      });
      if (projs.length > 0) {
        onUpdate(projs);
      }
    },
    (err) => {
      console.warn('Real-time projects subscription error:', err);
    }
  );
}

/**
 * Delete a clip from Firestore in both nested and direct locations
 */
export async function deleteClipFromFirestore(userId: string, projectId: string, clipId: string): Promise<void> {
  const directClipRef = doc(db, 'users', userId, 'clips', clipId);
  const nestedClipRef = doc(db, 'users', userId, 'projects', projectId, 'clips', clipId);

  try {
    await Promise.all([
      deleteDoc(directClipRef).catch(() => {}),
      deleteDoc(nestedClipRef).catch(() => {}),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}/clips/${clipId}`);
  }
}
