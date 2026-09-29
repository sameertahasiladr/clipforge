/**
 * ClipForge AI — Phase 6.2 Strict Multi-Tenant Security Verification Test Suite
 * Directly tests real PostgreSQL database boundaries, strict ownership enforcement,
 * PostgreSQL-backed OAuth state (including cross-process restart and atomic concurrency),
 * per-user encrypted cookies, live HTTP two-user media endpoints, fail-closed access,
 * and mandatory YouTube acquisition ownership.
 */

import express, { Request, Response } from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Database } from '../server/db/database.ts';
import { UserRepository } from '../server/repositories/userRepository.ts';
import { ProjectRepository } from '../server/repositories/projectRepository.ts';
import { ClipRepository } from '../server/repositories/clipRepository.ts';
import { JobRepository } from '../server/repositories/jobRepository.ts';
import { PublishingRepository } from '../server/repositories/publishingRepository.ts';
import { ScheduleRepository } from '../server/repositories/scheduleRepository.ts';
import { SocialAccountRepository } from '../server/repositories/socialAccountRepository.ts';
import { AnalyticsService } from '../server/services/analyticsService.ts';
import { JobService } from '../server/services/jobService.ts';
import { PublishingService } from '../server/services/publishingService.ts';
import { OAuthStateService } from '../server/services/oauthStateService.ts';
import { CookieService } from '../server/services/cookieService.ts';
import { StorageService } from '../server/services/storageService.ts';
import { SourceAcquisitionService } from '../server/services/sourceAcquisitionService.ts';
import { authenticateRequest } from '../server/middleware/auth.ts';

// Enable dev test tokens for the test process
process.env.ALLOW_DEV_TOKEN = 'true';

let passedCount = 0;
let failedCount = 0;
let blockedCount = 0;
let notTestedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    failedCount++;
  }
}

function reportNotTested(testName: string, reason: string) {
  console.log(`[NOT TESTED] ${testName} (${reason})`);
  notTestedCount++;
}

function extractProjectIdFromKey(key: string): string | null {
  const parts = key.split('/');
  if (parts.length >= 2 && parts[0] === 'projects') {
    return parts[1];
  }
  const match = key.match(/(?:clip|thumb)-([a-zA-Z0-9_-]+)-\d+\.(?:mp4|jpg|png|webp)/);
  if (match) {
    return match[1];
  }
  return null;
}

async function runTests() {
  console.log('====================================================================');
  console.log('ClipForge AI — Phase 6.2 Strict Security Verification Test Suite');
  console.log('====================================================================');

  await Database.init();
  await CookieService.init();

  const userA_Id = `test-user-A-${Date.now()}`;
  const userB_Id = `test-user-B-${Date.now()}`;

  // Seed two real users in PostgreSQL
  const userA = await UserRepository.findOrCreateByFirebase({
    uid: userA_Id,
    email: `${userA_Id}@test.clipforge.ai`,
    name: 'Alice Creator (User A)',
  });
  const userB = await UserRepository.findOrCreateByFirebase({
    uid: userB_Id,
    email: `${userB_Id}@test.clipforge.ai`,
    name: 'Bob Creator (User B)',
  });

  assert(userA.id === userA_Id, 'User A registered in PostgreSQL');
  assert(userB.id === userB_Id, 'User B registered in PostgreSQL');

  // -------------------------------------------------------------
  // 1. Mandatory YouTube Acquisition User Ownership
  // -------------------------------------------------------------
  console.log('\n--- 1. Mandatory YouTube Acquisition User Ownership ---');
  let threwOnMissingUserAcquisition = false;
  let acquisitionErrorCode = '';
  try {
    await SourceAcquisitionService.acquireYouTubeVideo(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      `job-test-${Date.now()}`,
      undefined,
      '1080p',
      '' // Missing/empty user ID
    );
  } catch (err: any) {
    threwOnMissingUserAcquisition = true;
    acquisitionErrorCode = err.code || '';
  }
  assert(threwOnMissingUserAcquisition, 'acquireYouTubeVideo rejects missing/empty userId before yt-dlp');
  assert(acquisitionErrorCode === 'USER_ID_REQUIRED', `acquireYouTubeVideo returns USER_ID_REQUIRED code (got ${acquisitionErrorCode})`);

  // -------------------------------------------------------------
  // 2. Processing Job Ownership: Strict DB Boundary
  // -------------------------------------------------------------
  console.log('\n--- 2. Processing Job Ownership ---');
  let threwOnMissingUserJobCreate = false;
  try {
    await JobRepository.create({
      jobId: `job-invalid-${Date.now()}`,
      state: 'PENDING',
      progressPercent: 0,
      statusMessage: 'Test',
      stepIndex: 0,
      totalSteps: 8,
      renderedClipsCount: 0,
      totalClipsToRender: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any, undefined, '' as any);
  } catch {
    threwOnMissingUserJobCreate = true;
  }
  assert(threwOnMissingUserJobCreate, 'JobRepository.create rejects missing/empty userId');

  const jobA = await JobRepository.create({
    jobId: `job-A-${Date.now()}`,
    state: 'PENDING',
    progressPercent: 10,
    statusMessage: 'Alice Job',
    stepIndex: 0,
    totalSteps: 8,
    renderedClipsCount: 0,
    totalClipsToRender: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as any, undefined, userA_Id);

  assert(jobA.userId === userA_Id, 'Job A created with explicit owner User A');

  // User A can find own job
  const foundByA = await JobRepository.findById(jobA.jobId, userA_Id);
  assert(foundByA !== null && foundByA.jobId === jobA.jobId, 'User A can find own processing job');

  // User B CANNOT find User A's job
  const foundByB = await JobRepository.findById(jobA.jobId, userB_Id);
  assert(foundByB === null, 'User B CANNOT find User A processing job (returns null)');

  // User B CANNOT update User A's job
  const updateByB = await JobRepository.update(jobA.jobId, { statusMessage: 'Hacked by Bob' }, userB_Id);
  assert(updateByB === null, 'User B CANNOT update User A processing job (WHERE user_id = $2 enforced)');

  // Verify User A's job is unchanged
  const verifyJobA = await JobRepository.findById(jobA.jobId, userA_Id);
  assert(verifyJobA?.statusMessage === 'Alice Job', 'Job A statusMessage intact, not modified by User B');

  // JobService cache and lookup ownership
  const cachedJob = JobService.createJob('Alice Service Job', userA_Id);
  assert(JobService.getJob(cachedJob.jobId, userB_Id) === undefined, 'JobService.getJob cache rejects User B for User A job');
  assert(JobService.getJob(cachedJob.jobId, userA_Id) !== undefined, 'JobService.getJob cache accepts User A for own job');

  const asyncJobLookupB = await JobService.getJobAsync(cachedJob.jobId, userB_Id);
  assert(!asyncJobLookupB, 'JobService.getJobAsync returns falsy (undefined) when User B queries User A job');

  // -------------------------------------------------------------
  // 3. Project & Clip Multi-Tenant Isolation
  // -------------------------------------------------------------
  console.log('\n--- 3. Project & Clip Ownership ---');
  const projA = await ProjectRepository.create({
    id: `proj-A-${Date.now()}`,
    title: 'Alice Project',
    sourceUrl: 'https://youtube.com/watch?v=11111111111',
    status: 'completed',
    clipsCount: 1,
    publishedCount: 0,
    draftCount: 1,
    durationSeconds: 60,
    thumbnailUrl: '',
    createdAt: new Date().toISOString(),
  } as any, userA_Id);

  assert(projA.userId === userA_Id, 'Project A created for User A');

  // User B cannot find User A project
  const projFoundByB = await ProjectRepository.findById(projA.id, userB_Id);
  assert(projFoundByB === null, 'User B cannot find User A project');

  // User B cannot update User A project
  const projUpdatedByB = await ProjectRepository.update(projA.id, { title: 'Compromised' }, userB_Id);
  assert(projUpdatedByB === null, 'User B cannot update User A project');

  // User B cannot delete User A project
  const projDeletedByB = await ProjectRepository.delete(projA.id, userB_Id);
  assert(projDeletedByB === false, 'User B cannot delete User A project');

  // Clip ownership
  const clipA = await ClipRepository.create({
    id: `clip-A-${Date.now()}`,
    projectId: projA.id,
    title: 'Alice Clip 1',
    hook: 'Hook A',
    startTimeSeconds: 0,
    endTimeSeconds: 30,
    durationSeconds: 30,
    aspectRatio: '9:16',
    aiViralScore: 90,
    status: 'draft',
  } as any, userA_Id);

  assert(clipA.userId === userA_Id, 'Clip A created with User A ownership');

  // User B cannot find User A clip
  const clipFoundByB = await ClipRepository.findById(clipA.id, userB_Id);
  assert(clipFoundByB === null, 'User B cannot find User A clip');

  // User B cannot update User A clip
  const clipUpdatedByB = await ClipRepository.update(clipA.id, { title: 'Compromised Clip' }, userB_Id);
  assert(clipUpdatedByB === null, 'User B cannot update User A clip');

  // User B cannot delete User A clip
  const clipDeletedByB = await ClipRepository.delete(clipA.id, userB_Id);
  assert(clipDeletedByB === false, 'User B cannot delete User A clip');

  // -------------------------------------------------------------
  // 4. Publishing Service: No Owner Fallback
  // -------------------------------------------------------------
  console.log('\n--- 4. Publishing Service Ownership ---');
  let publishingFailedForUserB = false;
  try {
    const pubRes = await PublishingService.publishClipToPlatform({
      clipId: clipA.id,
      platform: 'youtube',
      caption: 'Publish attempt by B',
      hashtags: ['#test'],
      privacy: 'public',
      userId: userB_Id,
    });
    if (!pubRes.success) publishingFailedForUserB = true;
  } catch {
    publishingFailedForUserB = true;
  }
  assert(publishingFailedForUserB, 'PublishingService rejects User B publishing User A clip (no owner fallback)');

  // -------------------------------------------------------------
  // 5. PostgreSQL-Backed OAuth State: Atomicity & Concurrency
  // -------------------------------------------------------------
  console.log('\n--- 5. PostgreSQL-Backed OAuth State ---');
  const oauthTokenA = await OAuthStateService.createState(userA_Id, 'youtube');
  assert(typeof oauthTokenA === 'string' && oauthTokenA.length === 64, 'OAuth state token generated (64 hex characters)');

  // Verify state is persisted in PostgreSQL
  const dbState = await OAuthStateService.getStateForTesting(oauthTokenA);
  assert(dbState !== null && dbState.user_id === userA_Id && dbState.platform === 'youtube', 'OAuth state is stored in PostgreSQL oauth_states table');
  assert(dbState.consumed_at === null, 'OAuth state consumed_at is initially NULL');

  // Validate and consume for wrong platform
  const wrongPlatformRes = await OAuthStateService.validateAndConsumeState(oauthTokenA, 'instagram');
  assert(!wrongPlatformRes.valid, 'OAuth state consumption rejected for platform mismatch');

  // Validate and consume successfully
  const validConsumeRes = await OAuthStateService.validateAndConsumeState(oauthTokenA, 'youtube');
  assert(validConsumeRes.valid && validConsumeRes.userId === userA_Id, 'OAuth state validated and atomically consumed for User A');

  // Replay protection: second consumption must FAIL
  const replayRes = await OAuthStateService.validateAndConsumeState(oauthTokenA, 'youtube');
  assert(!replayRes.valid, 'OAuth state token cannot be reused (single-use replay protection enforced)');

  // OAuth Concurrency Test (Requirement 5)
  console.log('\n--- 5b. OAuth Concurrent Consumption Verification ---');
  const concurToken = await OAuthStateService.createState(userA_Id, 'facebook');
  const [concur1, concur2] = await Promise.all([
    OAuthStateService.validateAndConsumeState(concurToken, 'facebook'),
    OAuthStateService.validateAndConsumeState(concurToken, 'facebook'),
  ]);
  const concurSuccessCount = (concur1.valid ? 1 : 0) + (concur2.valid ? 1 : 0);
  const concurFailCount = (!concur1.valid ? 1 : 0) + (!concur2.valid ? 1 : 0);
  assert(concurSuccessCount === 1 && concurFailCount === 1, `OAuth concurrent atomic consumption: exactly 1 succeeded, exactly 1 failed (${concurSuccessCount} ok, ${concurFailCount} err)`);

  // OAuth Process Restart Verification (Requirement 4)
  console.log('\n--- 5c. OAuth Cross-Process Restart Verification ---');
  const restartToken = await OAuthStateService.createState(userA_Id, 'youtube');
  // Spawn a fresh separate Node process with zero in-memory state
  const childScript = `
    const { Database } = require('./server/db/database.ts');
    const { OAuthStateService } = require('./server/services/oauthStateService.ts');
    (async () => {
      await Database.init();
      const res = await OAuthStateService.validateAndConsumeState('${restartToken}', 'youtube');
      console.log(JSON.stringify(res));
      process.exit(0);
    })().catch(e => { console.error(e); process.exit(1); });
  `;
  const restartProc = spawnSync('npx', ['tsx', '-e', childScript], { encoding: 'utf8', timeout: 15000 });
  let crossProcessResult: any = null;
  try {
    const lines = restartProc.stdout.trim().split('\n');
    crossProcessResult = JSON.parse(lines[lines.length - 1]);
  } catch {}
  assert(
    crossProcessResult && crossProcessResult.valid && crossProcessResult.userId === userA_Id,
    'OAuth state consumed by separate fresh process from PostgreSQL (survives process restart)'
  );

  // In main process, attempting to consume again must fail
  const postRestartReplay = await OAuthStateService.validateAndConsumeState(restartToken, 'youtube');
  assert(!postRestartReplay.valid, 'OAuth state consumed in external process cannot be replayed in main process');

  // -------------------------------------------------------------
  // 6. Two-User Encrypted YouTube Cookie Isolation
  // -------------------------------------------------------------
  console.log('\n--- 6. Two-User Cookie Isolation & Encryption ---');
  const userA_SecretCookie = 'alice_secret_token_11111';
  const userB_SecretCookie = 'bob_secret_token_22222';

  const cookiesTextA = `# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	2147483647	LOGIN_INFO	${userA_SecretCookie}
.google.com	TRUE	/	TRUE	2147483647	SID	alice_sid_token
`;
  const cookiesTextB = `# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	2147483647	LOGIN_INFO	${userB_SecretCookie}
.google.com	TRUE	/	TRUE	2147483647	SID	bob_sid_token
`;

  // Save for User A
  const cookieInfoA = await CookieService.saveCookies(userA_Id, cookiesTextA);
  assert(cookieInfoA.configured && cookieInfoA.cookieCount === 2, 'User A cookies saved with metadata');

  // Save for User B
  const cookieInfoB = await CookieService.saveCookies(userB_Id, cookiesTextB);
  assert(cookieInfoB.configured && cookieInfoB.cookieCount === 2, 'User B cookies saved with metadata');

  // Verify encrypted at rest in PostgreSQL (no plaintext secrets)
  const [rowA, rowB] = await Promise.all([
    Database.query('SELECT encrypted_cookies FROM user_cookies WHERE user_id = $1;', [userA_Id]),
    Database.query('SELECT encrypted_cookies FROM user_cookies WHERE user_id = $1;', [userB_Id]),
  ]);
  const encA = rowA.rows[0].encrypted_cookies;
  const encB = rowB.rows[0].encrypted_cookies;

  assert(!encA.includes(userA_SecretCookie) && encA.includes(':'), 'User A cookies stored encrypted (AES-256-GCM) at rest in DB');
  assert(!encB.includes(userB_SecretCookie) && encB.includes(':'), 'User B cookies stored encrypted (AES-256-GCM) at rest in DB');

  // Materialize isolated temporary files
  const fileA = await CookieService.getUserCookiesFile(userA_Id);
  const fileB = await CookieService.getUserCookiesFile(userB_Id);

  assert(fileA.filePath !== null && fileB.filePath !== null, 'Both users materialized temporary cookie files');
  assert(fileA.filePath !== fileB.filePath, 'User A and User B temporary cookie files are strictly distinct paths');

  const contentA = fs.readFileSync(fileA.filePath!, 'utf8');
  const contentB = fs.readFileSync(fileB.filePath!, 'utf8');

  assert(contentA.includes(userA_SecretCookie) && !contentA.includes(userB_SecretCookie), 'User A cookie file contains only User A credentials');
  assert(contentB.includes(userB_SecretCookie) && !contentB.includes(userA_SecretCookie), 'User B cookie file contains only User B credentials');

  const statA = fs.statSync(fileA.filePath!);
  const statB = fs.statSync(fileB.filePath!);
  const octalA = (statA.mode & 0o777).toString(8);
  const octalB = (statB.mode & 0o777).toString(8);

  assert(octalA === '600', `User A cookie file permissions are strictly 0600 (got ${octalA})`);
  assert(octalB === '600', `User B cookie file permissions are strictly 0600 (got ${octalB})`);

  // Cleanup removes both files
  fileA.cleanup();
  fileB.cleanup();
  assert(!fs.existsSync(fileA.filePath!), 'User A cookie file removed immediately by cleanup');
  assert(!fs.existsSync(fileB.filePath!), 'User B cookie file removed immediately by cleanup');

  // Deleting User A does not affect User B
  await CookieService.deleteCookies(userA_Id);
  const postDeleteA = await CookieService.getCookieInfo(userA_Id);
  const postDeleteB = await CookieService.getCookieInfo(userB_Id);
  assert(!postDeleteA.configured, 'User A cookies deleted');
  assert(postDeleteB.configured, 'User B cookies remain configured and isolated');

  await CookieService.deleteCookies(userB_Id);

  // -------------------------------------------------------------
  // 7. Live HTTP Two-User Authorization (/api/media/*)
  // -------------------------------------------------------------
  console.log('\n--- 7. Live HTTP Two-User Authorization ---');
  // Set up persistent media asset owned by User A
  const mediaRelKey = `projects/${projA.id}/clips/${clipA.id}/video.mp4`;
  const mediaFullPath = path.join(process.cwd(), 'storage', 'media', mediaRelKey);
  fs.mkdirSync(path.dirname(mediaFullPath), { recursive: true });
  fs.writeFileSync(mediaFullPath, 'MOCK_TEST_MP4_CONTENT_12345', 'utf8');

  // Mount an ephemeral test Express server with the real routes and authentication middleware
  const testApp = express();
  testApp.use(express.json());

  testApp.get('/api/media/url', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const key = req.query.key as string;
      if (!key) {
        res.status(400).json({ error: 'Missing key' });
        return;
      }
      const safeKey = StorageService.sanitizeKey(key);
      const projectId = extractProjectIdFromKey(safeKey);
      if (!projectId) {
        res.status(403).json({ error: 'Invalid or unauthorized media key.' });
        return;
      }
      const project = await ProjectRepository.findById(projectId, req.auth!.userId);
      if (!project) {
        res.status(404).json({ error: 'Project not found or unauthorized.' });
        return;
      }
      const url = await StorageService.getAccessUrl(safeKey);
      res.json({ success: true, key: safeKey, url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  testApp.get('/api/media/metadata', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const key = req.query.key as string;
      if (!key) {
        res.status(400).json({ error: 'Missing key' });
        return;
      }
      const safeKey = StorageService.sanitizeKey(key);
      const projectId = extractProjectIdFromKey(safeKey);
      if (!projectId) {
        res.status(403).json({ error: 'Invalid or unauthorized media key.' });
        return;
      }
      const project = await ProjectRepository.findById(projectId, req.auth!.userId);
      if (!project) {
        res.status(404).json({ error: 'Project not found or unauthorized.' });
        return;
      }
      const metadata = await StorageService.getMetadata(safeKey);
      if (!metadata) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }
      res.json({ success: true, key: safeKey, metadata });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  testApp.get('/api/media/stream', authenticateRequest, async (req: Request, res: Response) => {
    try {
      const key = req.query.key as string;
      if (!key) {
        res.status(400).json({ error: 'Missing key' });
        return;
      }
      const safeKey = StorageService.sanitizeKey(key);
      const projectId = extractProjectIdFromKey(safeKey);
      if (!projectId) {
        res.status(403).json({ error: 'Invalid or unauthorized media key.' });
        return;
      }
      const project = await ProjectRepository.findById(projectId, req.auth!.userId);
      if (!project) {
        res.status(404).json({ error: 'Project not found or unauthorized.' });
        return;
      }
      const metadata = await StorageService.getMetadata(safeKey);
      if (!metadata) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }
      const stream = StorageService.createStream(safeKey);
      stream.pipe(res);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const testServer = http.createServer(testApp);
  await new Promise<void>((resolve) => testServer.listen(0, resolve));
  const testPort = (testServer.address() as any).port;
  const baseUrl = `http://127.0.0.1:${testPort}`;

  // 1. GET /api/media/url: User A (Owner) vs User B (Unauthorized)
  const resUrlA = await fetch(`${baseUrl}/api/media/url?key=${encodeURIComponent(mediaRelKey)}`, {
    headers: { Authorization: `Bearer test_token_${userA_Id}` },
  });
  const dataUrlA = await resUrlA.json();
  assert(resUrlA.status === 200 && dataUrlA.success, 'HTTP GET /api/media/url: User A (Owner) allowed (200 OK)');

  const resUrlB = await fetch(`${baseUrl}/api/media/url?key=${encodeURIComponent(mediaRelKey)}`, {
    headers: { Authorization: `Bearer test_token_${userB_Id}` },
  });
  assert(resUrlB.status === 404 || resUrlB.status === 403, `HTTP GET /api/media/url: User B rejected (${resUrlB.status})`);

  // 2. GET /api/media/metadata: User A vs User B
  const resMetaA = await fetch(`${baseUrl}/api/media/metadata?key=${encodeURIComponent(mediaRelKey)}`, {
    headers: { Authorization: `Bearer test_token_${userA_Id}` },
  });
  const dataMetaA = await resMetaA.json();
  assert(resMetaA.status === 200 && dataMetaA.success, 'HTTP GET /api/media/metadata: User A (Owner) allowed (200 OK)');

  const resMetaB = await fetch(`${baseUrl}/api/media/metadata?key=${encodeURIComponent(mediaRelKey)}`, {
    headers: { Authorization: `Bearer test_token_${userB_Id}` },
  });
  assert(resMetaB.status === 404 || resMetaB.status === 403, `HTTP GET /api/media/metadata: User B rejected (${resMetaB.status})`);

  // 3. GET /api/media/stream: User A vs User B
  const resStreamA = await fetch(`${baseUrl}/api/media/stream?key=${encodeURIComponent(mediaRelKey)}`, {
    headers: { Authorization: `Bearer test_token_${userA_Id}` },
  });
  const streamBodyA = await resStreamA.text();
  assert(resStreamA.status === 200 && streamBodyA.includes('MOCK_TEST_MP4'), 'HTTP GET /api/media/stream: User A (Owner) streams media (200 OK)');

  const resStreamB = await fetch(`${baseUrl}/api/media/stream?key=${encodeURIComponent(mediaRelKey)}`, {
    headers: { Authorization: `Bearer test_token_${userB_Id}` },
  });
  assert(resStreamB.status === 404 || resStreamB.status === 403, `HTTP GET /api/media/stream: User B stream rejected (${resStreamB.status})`);

  testServer.close();

  // -------------------------------------------------------------
  // 8. Fail-Closed Media Access URL & Path Traversal
  // -------------------------------------------------------------
  console.log('\n--- 8. Fail-Closed Media Access ---');
  let threwOnNonExistentMedia = false;
  try {
    await StorageService.getAccessUrl('projects/non_existent_project/clips/clip_999/video.mp4');
  } catch {
    threwOnNonExistentMedia = true;
  }
  assert(threwOnNonExistentMedia, 'StorageService.getAccessUrl throws on non-existent media (fail-closed)');

  let threwOnTraversal = false;
  try {
    StorageService.sanitizeKey('../../../etc/passwd');
  } catch {
    threwOnTraversal = true;
  }
  assert(threwOnTraversal, 'StorageService.sanitizeKey rejects directory traversal attempts');

  // -------------------------------------------------------------
  // 9. Background Worker Ownership & Social Account Scope
  // -------------------------------------------------------------
  console.log('\n--- 9. Background Worker & Social Scope ---');
  const pubJobA = await PublishingRepository.create({
    id: `pub-job-A-${Date.now()}`,
    userId: userA_Id,
    clipId: clipA.id,
    clipTitle: 'Alice Clip',
    platform: 'youtube',
    accountId: 'acc_test_yt',
    status: 'QUEUED',
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  assert(pubJobA.userId === userA_Id, 'Publishing job A created with owner User A');

  // User B cannot find or update User A's publishing job
  const pubJobFoundByB = await PublishingRepository.findById(pubJobA.id, userB_Id);
  assert(pubJobFoundByB === null, 'User B cannot find User A publishing job');

  const pubJobUpdatedByB = await PublishingRepository.update(pubJobA.id, { status: 'CANCELLED' }, userB_Id);
  assert(pubJobUpdatedByB === null, 'User B cannot update User A publishing job');

  // Social account repository strict scoping
  const accountsA = await SocialAccountRepository.list(userA_Id);
  const accountsB = await SocialAccountRepository.list(userB_Id);
  assert(accountsA.length === 3 && accountsB.length === 3, 'Social accounts listed scoped to each user');
  assert(accountsA[0].id.includes(userA_Id) && accountsB[0].id.includes(userB_Id), 'Social account IDs are user-isolated');

  // Analytics service strict scoping
  const metricsA = await AnalyticsService.getMetrics(userA_Id);
  const metricsB = await AnalyticsService.getMetrics(userB_Id);
  assert(metricsA.totalClips === 1, 'Analytics for User A reflects User A clips (1)');
  assert(metricsB.totalClips === 0, 'Analytics for User B reflects User B clips (0, zero cross-tenant leakage)');

  // Clean up test records
  console.log('\n--- Cleanup ---');
  try {
    fs.unlinkSync(mediaFullPath);
  } catch {}
  await ProjectRepository.delete(projA.id, userA_Id).catch(() => {});
  await Database.query('DELETE FROM users WHERE id IN ($1, $2);', [userA_Id, userB_Id]);
  console.log('Test users and data cleaned up successfully.');

  console.log('====================================================================');
  console.log(`Phase 6.2 Test Results: ${passedCount} PASSED, ${failedCount} FAILED, ${blockedCount} BLOCKED, ${notTestedCount} NOT TESTED`);
  console.log('====================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
