/**
 * In-Memory Database Store — ClipForge AI
 * Reflects the PostgreSQL schema with immediate reactivity and persistence.
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
  aiViralScore: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  aspectRatio: '9:16' | '1:1' | '16:9';
  thumbnailUrl: string;
  videoUrl: string;
  status: 'draft' | 'queued' | 'scheduled' | 'published';
  captionStyle: 'minimal' | 'bold' | 'dynamic' | 'highlight';
  fontFamily: string;
  captionPosition: 'top' | 'middle' | 'bottom';
  watermarkEnabled: boolean;
  watermarkText: string;
  speakerCenterXPercent: number;
  fullText: string;
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
}

export interface SocialAccountItem {
  id: string;
  platform: 'instagram' | 'facebook' | 'youtube';
  accountUsername: string;
  channelOrPageName: string;
  avatarUrl: string;
  isConnected: boolean;
  connectedAt: string;
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
}

const sampleClipsSeed: ClipItem[] = [
  {
    id: 'clip-01',
    projectId: 'proj-01',
    clipNumber: 1,
    title: 'Nobody Tells You This About Success',
    hook: 'This is the biggest mistake people make in their 20s...',
    description: 'Breakdown of the discipline versus motivation paradox.',
    suggestedCaption: 'One small mindset shift completely alters how you approach daily execution. Save this before starting your week.',
    hashtags: ['#shorts', '#reels', '#successmindset', '#viral'],
    callToAction: 'Drop a 🔥 in the comments if you needed this reminder.',
    aiViralScore: 94,
    startTimeSeconds: 222.0,
    endTimeSeconds: 236.4,
    durationSeconds: 14.4,
    aspectRatio: '9:16',
    thumbnailUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&auto=format&fit=crop&q=80',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    status: 'published',
    captionStyle: 'dynamic',
    fontFamily: 'Plus Jakarta Sans',
    captionPosition: 'bottom',
    watermarkEnabled: true,
    watermarkText: '@clipforge.ai',
    speakerCenterXPercent: 50,
    fullText: 'Nobody tells you this about success: the people who win never relied on motivation. They built non-negotiable daily loops.',
  },
  {
    id: 'clip-02',
    projectId: 'proj-01',
    clipNumber: 2,
    title: 'The Silent Killer of High Ambition',
    hook: 'Stop telling everyone your goals. Here is why.',
    description: 'Neurological dopamine dissipation when announcing plans early.',
    suggestedCaption: 'Psychological studies prove premature celebration trick your subconscious into believing work is already finished.',
    hashtags: ['#psychology', '#shorts', '#productivity', '#growth'],
    callToAction: 'Share this with someone building silently right now.',
    aiViralScore: 91,
    startTimeSeconds: 380.0,
    endTimeSeconds: 394.0,
    durationSeconds: 14.0,
    aspectRatio: '9:16',
    thumbnailUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
    status: 'scheduled',
    captionStyle: 'bold',
    fontFamily: 'Plus Jakarta Sans',
    captionPosition: 'middle',
    watermarkEnabled: false,
    watermarkText: '@clipforge.ai',
    speakerCenterXPercent: 50,
    fullText: 'Stop telling everyone your goals. When you vocalize a milestone before executing, your brain releases premature dopamine.',
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
    startTimeSeconds: 512.0,
    endTimeSeconds: 526.5,
    durationSeconds: 14.5,
    aspectRatio: '9:16',
    thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    status: 'draft',
    captionStyle: 'highlight',
    fontFamily: 'Plus Jakarta Sans',
    captionPosition: 'bottom',
    watermarkEnabled: true,
    watermarkText: '@clipforge.ai',
    speakerCenterXPercent: 48,
    fullText: 'If you hesitate for more than three seconds, your survival instincts kick in and rationalize procrastination.',
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
    startTimeSeconds: 740.0,
    endTimeSeconds: 754.2,
    durationSeconds: 14.2,
    aspectRatio: '9:16',
    thumbnailUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    status: 'draft',
    captionStyle: 'dynamic',
    fontFamily: 'Plus Jakarta Sans',
    captionPosition: 'bottom',
    watermarkEnabled: false,
    watermarkText: '@clipforge.ai',
    speakerCenterXPercent: 52,
    fullText: 'The biggest lie in the creator economy is that consistency means spamming. Retention is the only currency the algorithm understands.',
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
    startTimeSeconds: 910.0,
    endTimeSeconds: 924.8,
    durationSeconds: 14.8,
    aspectRatio: '9:16',
    thumbnailUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop&q=80',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    status: 'draft',
    captionStyle: 'minimal',
    fontFamily: 'Plus Jakarta Sans',
    captionPosition: 'bottom',
    watermarkEnabled: true,
    watermarkText: '@clipforge.ai',
    speakerCenterXPercent: 50,
    fullText: 'Four uninterrupted hours of intense deep work will consistently outperform forty hours of reactive multitasking every single week.',
  },
];

class DataStore {
  public projects: ProjectItem[] = [
    {
      id: 'proj-01',
      title: 'The Psychology of High Performance & Master Strategy',
      sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      status: 'completed',
      durationSeconds: 3420,
      clipsCount: 15,
      publishedCount: 4,
      draftCount: 11,
      thumbnailUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: 'proj-02',
      title: 'AI Supercycles & Creator Economy Deep Dive',
      sourceUrl: 'https://www.youtube.com/watch?v=kXYiU_JCYtU',
      status: 'completed',
      durationSeconds: 2840,
      clipsCount: 12,
      publishedCount: 3,
      draftCount: 9,
      thumbnailUrl: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=80',
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
  ];

  public clips: ClipItem[] = [...sampleClipsSeed];

  public socialAccounts: SocialAccountItem[] = [
    {
      id: 'acc-ig',
      platform: 'instagram',
      accountUsername: '@clipforge.official',
      channelOrPageName: 'ClipForge Media Labs',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      isConnected: true,
      connectedAt: '2026-08-14T10:00:00Z',
    },
    {
      id: 'acc-yt',
      platform: 'youtube',
      accountUsername: 'ClipForge Shorts',
      channelOrPageName: 'ClipForge Tech Network',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
      isConnected: true,
      connectedAt: '2026-08-16T12:30:00Z',
    },
    {
      id: 'acc-fb',
      platform: 'facebook',
      accountUsername: 'ClipForge Pages',
      channelOrPageName: 'ClipForge Creator Studio',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80',
      isConnected: false,
      connectedAt: '',
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
    },
    {
      id: 'sched-02',
      clipId: 'clip-03',
      clipTitle: 'The 3-Second Rule That Built an Empire',
      platforms: ['youtube', 'facebook'],
      scheduledDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
      scheduledTime: '11:00',
      timezone: 'UTC',
      status: 'scheduled',
    },
  ];
}

export const dbStore = new DataStore();
