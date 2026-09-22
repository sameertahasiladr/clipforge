/**
 * In-Memory & Reactive Database Store — ClipForge AI
 * Cleanly separates Demo Mode and Production Mode data.
 * Implements full relational PostgreSQL entity schema.
 */

export interface ClipItem {
  id: string;
  projectId: string;
  clipNumber: number;
  title: string;
  hook: string;
  description: string;
  suggestedCaption: string;
  hashtags: string[];
  callToAction: string;
  aiViralScore: number; // AI Viral Potential Score (70-98)
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  aspectRatio: '9:16' | '1:1' | '16:9';
  thumbnailUrl: string;
  videoUrl: string; // Points to actual rendered MP4 file
  localRenderPath?: string;
  status: 'draft' | 'queued' | 'scheduled' | 'published';
  renderStatus?: 'idle' | 'processing' | 'completed' | 'failed';
  publishedAt?: string;
  captionStyle: 'minimal' | 'bold' | 'dynamic' | 'highlight';
  fontFamily: string;
  captionPosition: 'top' | 'middle' | 'bottom';
  watermarkEnabled: boolean;
  watermarkText: string;
  speakerCenterXPercent: number;
  fullText: string;
  isDemo?: boolean;
}

export interface UserItem {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: string;
  planTier: string;
  passwordHash?: string;
}

export interface ProjectItem {
  id: string;
  title: string;
  sourceUrl: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  durationSeconds: number;
  clipsCount: number;
  publishedCount: number;
  draftCount: number;
  thumbnailUrl: string;
  createdAt: string;
  isDemo?: boolean;
}

export interface SocialAccountItem {
  id: string;
  platform: 'instagram' | 'facebook' | 'youtube';
  accountUsername: string;
  channelOrPageName: string;
  avatarUrl?: string;
  isConnected: boolean;
  connectedAt?: string;
  isDemo: boolean;
  status: 'Not Connected' | 'Connecting' | 'Connected' | 'Reauthorization Required' | 'Demo Connected';
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  tokenExpiresAt?: string;
}

export interface PublishingJob {
  id: string;
  userId: string;
  clipId: string;
  clipTitle: string;
  platform: 'instagram' | 'facebook' | 'youtube';
  accountId: string;
  status: 'QUEUED' | 'UPLOADING' | 'PROCESSING' | 'PUBLISHED' | 'COMPLETED' | 'SCHEDULED' | 'FAILED' | 'CANCELLED';
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  publishedAt?: string;
  externalPostId?: string;
  externalPostUrl?: string;
  errorMessage?: string;
  retryCount: number;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledPostItem {
  id: string;
  clipId: string;
  clipTitle: string;
  platforms: Array<'instagram' | 'facebook' | 'youtube'>;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  timezone: string;
  status: 'scheduled' | 'published' | 'cancelled';
  isDemo?: boolean;
}

// Seed Clips for Demo Mode
const demoClipsSeed: ClipItem[] = [
  {
    id: 'clip-01',
    projectId: 'proj-01',
    clipNumber: 1,
    title: 'The Discipline Advantage in Hyper-Scaling',
    hook: 'This is the biggest mistake people make in their 20s...',
    description: 'Breakdown of the discipline versus volatile motivation paradox.',
    suggestedCaption: 'One small mindset shift completely alters how you execute daily. Save this before starting your week.',
    hashtags: ['#shorts', '#reels', '#successmindset', '#viral'],
    callToAction: 'Drop a 🔥 in the comments if you needed this reminder.',
    aiViralScore: 94,
    startTimeSeconds: 12.0,
    endTimeSeconds: 26.4,
    durationSeconds: 14.4,
    aspectRatio: '9:16',
    thumbnailUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&auto=format&fit=crop&q=80',
    videoUrl: '/rendered/test.mp4',
    status: 'published',
    captionStyle: 'dynamic',
    fontFamily: 'Plus Jakarta Sans',
    captionPosition: 'bottom',
    watermarkEnabled: true,
    watermarkText: '@clipforge.ai',
    speakerCenterXPercent: 50,
    fullText: 'Nobody tells you this about success: the people who win never relied on motivation. They built non-negotiable daily loops.',
    isDemo: true,
  },
  {
    id: 'clip-02',
    projectId: 'proj-01',
    clipNumber: 2,
    title: 'The Silent Killer of High Ambition',
    hook: 'Stop telling everyone your goals. Here is why.',
    description: 'Neurological dopamine dissipation when announcing plans early.',
    suggestedCaption: 'Psychological studies prove premature celebrations trick your subconscious into believing work is already finished.',
    hashtags: ['#psychology', '#shorts', '#productivity', '#growth'],
    callToAction: 'Share this with someone building silently right now.',
    aiViralScore: 91,
    startTimeSeconds: 45.0,
    endTimeSeconds: 59.0,
    durationSeconds: 14.0,
    aspectRatio: '9:16',
    thumbnailUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
    videoUrl: '/rendered/test.mp4',
    status: 'scheduled',
    captionStyle: 'bold',
    fontFamily: 'Plus Jakarta Sans',
    captionPosition: 'middle',
    watermarkEnabled: false,
    watermarkText: '@clipforge.ai',
    speakerCenterXPercent: 50,
    fullText: 'Stop telling everyone your goals. When you vocalize a milestone before executing, your brain releases premature dopamine.',
    isDemo: true,
  },
  {
    id: 'clip-03',
    projectId: 'proj-01',
    clipNumber: 3,
    title: 'The 3-Second Rule That Built an Empire',
    hook: 'If you hesitate for more than three seconds, you have already lost.',
    description: 'Decision fatigue elimination tactic used by top executives.',
    suggestedCaption: 'Action cures fear. Indecision is a silent tax on your cognitive horsepower.',
    hashtags: ['#entrepreneur', '#shorts', '#leadership', '#mindset'],
    callToAction: 'Tag a founder who needs to hear this today.',
    aiViralScore: 89,
    startTimeSeconds: 88.0,
    endTimeSeconds: 102.5,
    durationSeconds: 14.5,
    aspectRatio: '9:16',
    thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
    videoUrl: '/rendered/test.mp4',
    status: 'draft',
    captionStyle: 'highlight',
    fontFamily: 'Plus Jakarta Sans',
    captionPosition: 'bottom',
    watermarkEnabled: true,
    watermarkText: '@clipforge.ai',
    speakerCenterXPercent: 48,
    fullText: 'If you hesitate for more than three seconds, your survival instincts kick in and rationalize procrastination.',
    isDemo: true,
  },
  {
    id: 'clip-04',
    projectId: 'proj-01',
    clipNumber: 4,
    title: 'Why 99% Of People Fail At Short-Form Content',
    hook: 'The biggest lie in the creator economy right now...',
    description: 'Algorithms reward retention, not posting volume alone.',
    suggestedCaption: 'Stop posting 5 bad videos a day. One high-retention 14-second hook beats 50 mediocre uploads.',
    hashtags: ['#creator', '#reels', '#growthhacks', '#shorts'],
    callToAction: 'Follow for the algorithmic breakdown in part 2.',
    aiViralScore: 96,
    startTimeSeconds: 140.0,
    endTimeSeconds: 154.2,
    durationSeconds: 14.2,
    aspectRatio: '9:16',
    thumbnailUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80',
    videoUrl: '/rendered/test.mp4',
    status: 'draft',
    captionStyle: 'dynamic',
    fontFamily: 'Plus Jakarta Sans',
    captionPosition: 'bottom',
    watermarkEnabled: false,
    watermarkText: '@clipforge.ai',
    speakerCenterXPercent: 52,
    fullText: 'The biggest lie in the creator economy is that consistency means spamming. Retention is the only currency the algorithm understands.',
    isDemo: true,
  },
  {
    id: 'clip-05',
    projectId: 'proj-01',
    clipNumber: 5,
    title: 'The Asymmetric Upside of Deep Work',
    hook: 'Four uninterrupted hours will outperform forty distracted hours.',
    description: 'Unlocking exponential cognitive throughput.',
    suggestedCaption: 'Protect your calendar like your future depends on it—because it does.',
    hashtags: ['#deepwork', '#focus', '#wisdom', '#viral'],
    callToAction: 'Are you working deep today? Let me know below.',
    aiViralScore: 88,
    startTimeSeconds: 190.0,
    endTimeSeconds: 204.8,
    durationSeconds: 14.8,
    aspectRatio: '9:16',
    thumbnailUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop&q=80',
    videoUrl: '/rendered/test.mp4',
    status: 'draft',
    captionStyle: 'minimal',
    fontFamily: 'Plus Jakarta Sans',
    captionPosition: 'bottom',
    watermarkEnabled: true,
    watermarkText: '@clipforge.ai',
    speakerCenterXPercent: 50,
    fullText: 'Four uninterrupted hours of intense deep work will consistently outperform forty hours of reactive multitasking every single week.',
    isDemo: true,
  },
];

class DataStore {
  public users: UserItem[] = [
    {
      id: 'usr_default_01',
      email: 'creator@clipforge.ai',
      fullName: 'Alex Mercer',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      role: 'creator',
      planTier: 'pro',
    },
  ];

  // Demo Mode Accounts: clearly marked as Demo Connected
  public demoSocialAccounts: SocialAccountItem[] = [
    {
      id: 'demo-acc-ig',
      platform: 'instagram',
      accountUsername: '@clipforge.demo',
      channelOrPageName: 'ClipForge Media Labs (Demo)',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      isConnected: true,
      connectedAt: '2026-08-14T10:00:00Z',
      isDemo: true,
      status: 'Demo Connected',
    },
    {
      id: 'demo-acc-yt',
      platform: 'youtube',
      accountUsername: 'ClipForge Shorts (Demo)',
      channelOrPageName: 'ClipForge Tech Network (Demo)',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
      isConnected: true,
      connectedAt: '2026-08-16T12:30:00Z',
      isDemo: true,
      status: 'Demo Connected',
    },
    {
      id: 'demo-acc-fb',
      platform: 'facebook',
      accountUsername: 'ClipForge Pages (Demo)',
      channelOrPageName: 'ClipForge Creator Studio (Demo)',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80',
      isConnected: true,
      connectedAt: '2026-08-20T09:15:00Z',
      isDemo: true,
      status: 'Demo Connected',
    },
  ];

  // Production Social Accounts: strictly starts as Not Connected until real OAuth is authorized
  public productionSocialAccounts: SocialAccountItem[] = [
    {
      id: 'prod-acc-ig',
      platform: 'instagram',
      accountUsername: 'Not Connected',
      channelOrPageName: 'Instagram Business / Creator Account',
      isConnected: false,
      isDemo: false,
      status: 'Not Connected',
    },
    {
      id: 'prod-acc-yt',
      platform: 'youtube',
      accountUsername: 'Not Connected',
      channelOrPageName: 'YouTube Channel',
      isConnected: false,
      isDemo: false,
      status: 'Not Connected',
    },
    {
      id: 'prod-acc-fb',
      platform: 'facebook',
      accountUsername: 'Not Connected',
      channelOrPageName: 'Facebook Page',
      isConnected: false,
      isDemo: false,
      status: 'Not Connected',
    },
  ];

  public projects: ProjectItem[] = [
    {
      id: 'proj-01',
      title: 'The Psychology of High Performance & Master Strategy',
      sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      status: 'completed',
      durationSeconds: 3420,
      clipsCount: 15,
      publishedCount: 1,
      draftCount: 14,
      thumbnailUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      isDemo: true,
    },
  ];

  public clips: ClipItem[] = [...demoClipsSeed];

  public publishingJobs: PublishingJob[] = [
    {
      id: 'job-seed-01',
      userId: 'user-01',
      clipId: 'clip-01',
      clipTitle: 'The Discipline Advantage in Hyper-Scaling',
      platform: 'instagram',
      accountId: 'demo-acc-ig',
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
      externalPostId: 'ig_demo_reel_948',
      externalPostUrl: 'https://instagram.com/reels/clipforge_demo',
      retryCount: 0,
      isDemo: true,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'job-seed-02',
      userId: 'user-01',
      clipId: 'clip-02',
      clipTitle: 'The Silent Killer of High Ambition',
      platform: 'youtube',
      accountId: 'demo-acc-yt',
      status: 'QUEUED',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      retryCount: 0,
      isDemo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  public scheduledPosts: ScheduledPostItem[] = [
    {
      id: 'sched-01',
      clipId: 'clip-02',
      clipTitle: 'The Silent Killer of High Ambition',
      platforms: ['instagram', 'youtube'],
      scheduledDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      scheduledTime: '17:30',
      timezone: 'UTC',
      status: 'scheduled',
      isDemo: true,
    },
  ];

  /**
   * Returns social accounts for requested mode
   */
  public getSocialAccounts(isDemo: boolean = true): SocialAccountItem[] {
    return isDemo ? this.demoSocialAccounts : this.productionSocialAccounts;
  }

  /**
   * Connect or update a social account
   */
  public updateSocialAccount(account: SocialAccountItem) {
    const list = account.isDemo ? this.demoSocialAccounts : this.productionSocialAccounts;
    const idx = list.findIndex((a) => a.platform === account.platform);
    if (idx >= 0) {
      list[idx] = account;
    } else {
      list.push(account);
    }
  }

  /**
   * Disconnect an account
   */
  public disconnectSocialAccount(platform: 'instagram' | 'facebook' | 'youtube', isDemo: boolean = false) {
    const list = isDemo ? this.demoSocialAccounts : this.productionSocialAccounts;
    const target = list.find((a) => a.platform === platform);
    if (target) {
      target.isConnected = false;
      target.accountUsername = 'Not Connected';
      target.channelOrPageName = `${platform.charAt(0).toUpperCase() + platform.slice(1)} Account`;
      target.status = 'Not Connected';
      target.accessTokenEncrypted = undefined;
      target.refreshTokenEncrypted = undefined;
    }
  }
}

export const dbStore = new DataStore();
