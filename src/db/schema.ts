import { pgTable, text, integer, numeric, boolean, timestamp, bigint, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Users Table
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique('users_email_key'),
  passwordHash: text('password_hash'),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  role: text('role').default('creator'),
  planTier: text('plan_tier').default('free'),
  googleId: text('google_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 2. Projects Table
export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sourceUrl: text('source_url').notNull(),
  sourceVideoPath: text('source_video_path'),
  sourceVideoKey: text('source_video_key'),
  storageProvider: text('storage_provider').default('local'),
  storageStatus: text('storage_status').default('ready'),
  sourcePlatform: text('source_platform').default('youtube'),
  sourceType: text('source_type').default('youtube'),
  status: text('status').default('queued'),
  durationSeconds: numeric('duration_seconds', { precision: 10, scale: 2 }).default('0'),
  clipsCount: integer('clips_count').default(0),
  publishedCount: integer('published_count').default(0),
  draftCount: integer('draft_count').default(0),
  thumbnailUrl: text('thumbnail_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 3. Source Videos Table
export const sourceVideos = pgTable('source_videos', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  youtubeVideoId: text('youtube_video_id'),
  videoTitle: text('video_title').notNull(),
  channelName: text('channel_name'),
  channelId: text('channel_id'),
  durationSeconds: numeric('duration_seconds', { precision: 10, scale: 2 }).notNull(),
  resolution: text('resolution').default('1080p'),
  storagePath: text('storage_path'),
  audioPath: text('audio_path'),
  rawTranscript: jsonb('raw_transcript'),
  hasRightsConfirmed: boolean('has_rights_confirmed').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 4. Clips Table
export const clips = pgTable('clips', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clipNumber: integer('clip_number').notNull(),
  title: text('title').notNull(),
  hook: text('hook').notNull(),
  description: text('description'),
  suggestedCaption: text('suggested_caption'),
  hashtags: text('hashtags').array(),
  callToAction: text('call_to_action'),
  aiViralScore: integer('ai_viral_score').notNull(),
  startTimeSeconds: numeric('start_time_seconds', { precision: 8, scale: 2 }).notNull(),
  endTimeSeconds: numeric('end_time_seconds', { precision: 8, scale: 2 }).notNull(),
  durationSeconds: numeric('duration_seconds', { precision: 8, scale: 2 }).notNull(),
  aspectRatio: text('aspect_ratio').default('9:16'),
  thumbnailUrl: text('thumbnail_url'),
  videoUrl: text('video_url'),
  localRenderPath: text('local_render_path'),
  videoStorageKey: text('video_storage_key'),
  thumbnailStorageKey: text('thumbnail_storage_key'),
  storageProvider: text('storage_provider').default('local'),
  storageStatus: text('storage_status').default('ready'),
  status: text('status').default('draft'),
  renderStatus: text('render_status').default('completed'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  captionStyle: text('caption_style').default('none'),
  fontFamily: text('font_family').default('Plus Jakarta Sans'),
  captionPosition: text('caption_position').default('bottom'),
  watermarkEnabled: boolean('watermark_enabled').default(false),
  watermarkText: text('watermark_text').default('@clipforge.ai'),
  speakerCenterXPercent: numeric('speaker_center_x_percent', { precision: 5, scale: 2 }).default('50'),
  fullText: text('full_text'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 5. Processing Jobs Table
export const processingJobs = pgTable('processing_jobs', {
  jobId: text('job_id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  state: text('state').notNull(),
  statusMessage: text('status_message'),
  stepIndex: integer('step_index').default(0),
  totalSteps: integer('total_steps').default(8),
  progressPercent: integer('progress_percent').default(0),
  sourceVideoPath: text('source_video_path'),
  renderedClipsCount: integer('rendered_clips_count').default(0),
  totalClipsToRender: integer('total_clips_to_render').default(0),
  error: text('error'),
  errorCode: text('error_code'),
  failedClipId: text('failed_clip_id'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

// 6. Social Accounts Table
export const socialAccounts = pgTable('social_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  accountUsername: text('account_username').notNull(),
  channelOrPageName: text('channel_or_page_name'),
  platformAccountId: text('platform_account_id'),
  avatarUrl: text('avatar_url'),
  isConnected: boolean('is_connected').default(false),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  status: text('status').default('Not Connected'),
  accessTokenEncrypted: text('access_token_encrypted'),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 7. Publishing Jobs Table
export const publishingJobs = pgTable('publishing_jobs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clipId: text('clip_id').references(() => clips.id, { onDelete: 'cascade' }),
  clipTitle: text('clip_title'),
  platform: text('platform').notNull(),
  accountId: text('account_id'),
  status: text('status').default('QUEUED'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  externalPostId: text('external_post_id'),
  externalPostUrl: text('external_post_url'),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// 8. Scheduled Posts Table
export const scheduledPosts = pgTable('scheduled_posts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clipId: text('clip_id').references(() => clips.id, { onDelete: 'cascade' }),
  clipTitle: text('clip_title'),
  platforms: text('platforms').array().notNull(),
  scheduledDate: text('scheduled_date').notNull(),
  scheduledTime: text('scheduled_time').notNull(),
  timezone: text('timezone').default('UTC'),
  status: text('status').default('scheduled'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 9. Analytics Table
export const analytics = pgTable('analytics', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clipId: text('clip_id').references(() => clips.id, { onDelete: 'set null' }),
  platform: text('platform').notNull(),
  viewsCount: integer('views_count').default(0),
  likesCount: integer('likes_count').default(0),
  commentsCount: integer('comments_count').default(0),
  sharesCount: integer('shares_count').default(0),
  avgWatchTimeSeconds: numeric('avg_watch_time_seconds', { precision: 5, scale: 2 }).default('0'),
  engagementRate: numeric('engagement_rate', { precision: 5, scale: 2 }).default('0'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  clips: many(clips),
  socialAccounts: many(socialAccounts),
  publishingJobs: many(publishingJobs),
  scheduledPosts: many(scheduledPosts),
  analytics: many(analytics),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  clips: many(clips),
  sourceVideos: many(sourceVideos),
}));

export const clipsRelations = relations(clips, ({ one, many }) => ({
  project: one(projects, { fields: [clips.projectId], references: [projects.id] }),
  user: one(users, { fields: [clips.userId], references: [users.id] }),
  publishingJobs: many(publishingJobs),
  scheduledPosts: many(scheduledPosts),
}));
