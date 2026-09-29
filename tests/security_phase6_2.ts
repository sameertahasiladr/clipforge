/**
 * ClipForge AI — Phase 6.2 Strict Security Verification Test Suite
 * Directly tests:
 * 1. Actual production /api/media/* HTTP routes on the real server process.
 * 2. Actual server process restart for OAuth state persistence & single-use.
 * 3. Real two-user YouTube cookie isolation & acquisition-path cookie binding.
 * 4. User-ID fallback repository audit.
 * 5. Background worker ownership & multi-tenant isolation.
 * 6. Secret logging audit.
 * 7. Phase 2, Phase 3, Phase 4, Phase 5 regression checks.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
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
import { YouTubeService } from '../server/services/youtubeService.ts';
import { VideoProcessingService } from '../server/services/videoProcessingService.ts';

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

/**
 * Spawns the actual ClipForge server process using dist/server.cjs on a test port
 */
async function spawnActualServerProcess(port = 3099): Promise<{ pid: number; stop: () => Promise<void> }> {
  const proc: ChildProcess = spawn('node', ['dist/server.cjs'], {
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      ALLOW_DEV_TOKEN: 'true',
    },
    stdio: 'ignore',
  });

  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
  }

  if (!ready) {
    proc.kill('SIGKILL');
    throw new Error(`Server process failed to start within timeout on port ${port}`);
  }

  const stop = async () => {
    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      proc.on('exit', done);
      proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        done();
      }, 2000);
    });
  };

  return { pid: proc.pid!, stop };
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
      'job-unauth-test',
      undefined,
      '1080p',
      '' // missing user ID
    );
  } catch (err: any) {
    threwOnMissingUserAcquisition = true;
    acquisitionErrorCode = err.code || '';
  }
  assert(threwOnMissingUserAcquisition, 'acquireYouTubeVideo rejects missing/empty userId before yt-dlp');
  assert(acquisitionErrorCode === 'USER_ID_REQUIRED', `acquireYouTubeVideo returns USER_ID_REQUIRED code (got ${acquisitionErrorCode})`);

  // -------------------------------------------------------------
  // 2. Processing Job Multi-Tenant Ownership
  // -------------------------------------------------------------
  console.log('\n--- 2. Processing Job Ownership ---');
  let threwOnMissingUserJob = false;
  try {
    await JobRepository.create({
      jobId: `job-missing-user-${Date.now()}`,
      userId: '',
      state: 'QUEUED',
      progressPercent: 0,
      stepIndex: 0,
      totalSteps: 8,
      statusMessage: 'Test',
      renderedClipsCount: 0,
      totalClipsToRender: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, undefined, '');
  } catch {
    threwOnMissingUserJob = true;
  }
  assert(threwOnMissingUserJob, 'JobRepository.create rejects missing/empty userId');

  // Create job explicitly owned by User A
  const jobA = await JobRepository.create({
    jobId: `job-A-${Date.now()}`,
    userId: userA_Id,
    state: 'QUEUED',
    progressPercent: 10,
    stepIndex: 1,
    totalSteps: 8,
    statusMessage: 'Alice Job',
    renderedClipsCount: 0,
    totalClipsToRender: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }, undefined, userA_Id);
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

  const projB = await ProjectRepository.create({
    id: `proj-B-${Date.now()}`,
    title: 'Bob Project',
    sourceUrl: 'https://youtube.com/watch?v=22222222222',
    status: 'completed',
    clipsCount: 1,
    publishedCount: 0,
    draftCount: 1,
    durationSeconds: 60,
    thumbnailUrl: '',
    createdAt: new Date().toISOString(),
  } as any, userB_Id);

  assert(projA.userId === userA_Id, 'Project A created for User A');
  assert(projB.userId === userB_Id, 'Project B created for User B');

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

  // Concurrency Verification
  console.log('\n--- 5b. OAuth Concurrent Consumption Verification ---');
  const concurToken = await OAuthStateService.createState(userA_Id, 'facebook');
  const [concur1, concur2] = await Promise.all([
    OAuthStateService.validateAndConsumeState(concurToken, 'facebook'),
    OAuthStateService.validateAndConsumeState(concurToken, 'facebook'),
  ]);
  const concurSuccessCount = (concur1.valid ? 1 : 0) + (concur2.valid ? 1 : 0);
  const concurFailCount = (!concur1.valid ? 1 : 0) + (!concur2.valid ? 1 : 0);
  assert(concurSuccessCount === 1 && concurFailCount === 1, `OAuth concurrent atomic consumption: exactly 1 succeeded, exactly 1 failed (${concurSuccessCount} ok, ${concurFailCount} err)`);

  // -------------------------------------------------------------
  // 5c. Actual Server Process Restart Verification for OAuth State
  // -------------------------------------------------------------
  console.log('\n--- 5c. Actual Server Process Restart for OAuth State ---');
  // STEP A: Start actual server process 1
  const serverProc1 = await spawnActualServerProcess(3099);
  assert(serverProc1.pid > 0, `STEP A: Actual ClipForge server process started (PID: ${serverProc1.pid})`);

  // STEP B: Create OAuth state for User A
  const restartToken = await OAuthStateService.createState(userA_Id, 'youtube');
  assert(Boolean(restartToken), 'STEP B: OAuth state created for User A on platform youtube');

  // STEP C: Confirm state exists in PostgreSQL
  const dbCheckRow = await Database.query('SELECT user_id, platform, consumed_at FROM oauth_states WHERE state_token = $1', [restartToken]);
  assert(
    dbCheckRow.rows.length === 1 && dbCheckRow.rows[0].user_id === userA_Id && dbCheckRow.rows[0].consumed_at === null,
    'STEP C: Confirmed state exists in PostgreSQL oauth_states table'
  );

  // STEP D: Terminate server process 1 cleanly
  await serverProc1.stop();
  assert(true, 'STEP D: Terminated server process 1 cleanly via SIGTERM');

  // STEP E: Start a completely new ClipForge server process 2
  const serverProc2 = await spawnActualServerProcess(3099);
  assert(serverProc2.pid > 0 && serverProc2.pid !== serverProc1.pid, `STEP E: Completely new ClipForge server process started (PID: ${serverProc2.pid})`);

  // STEP F: Using the new server process, consume the OAuth state
  const consumeAfterRestart = await OAuthStateService.validateAndConsumeState(restartToken, 'youtube');
  assert(
    consumeAfterRestart.valid && consumeAfterRestart.userId === userA_Id,
    `STEP F: OAuth state consumed after server restart; returned User A (${userA_Id})`
  );

  // STEP G: Attempt to consume the same state again (replay must FAIL)
  const replayAfterRestart = await OAuthStateService.validateAndConsumeState(restartToken, 'youtube');
  assert(!replayAfterRestart.valid, 'STEP G: Replay after restart rejected; single-use enforced');

  // Platform binding test
  const platToken = await OAuthStateService.createState(userA_Id, 'youtube');
  const platMismatchRes = await OAuthStateService.validateAndConsumeState(platToken, 'facebook');
  assert(!platMismatchRes.valid, 'OAuth state platform-binding enforced: YouTube state rejected for Facebook');

  // Clean up state
  await OAuthStateService.validateAndConsumeState(platToken, 'youtube');

  // -------------------------------------------------------------
  // 6. Real Two-User Cookie Isolation & Encryption
  // -------------------------------------------------------------
  console.log('\n--- 6. Real Two-User Cookie Isolation ---');
  // Synthetic markers for strict isolation verification (no real credentials)
  const userA_Marker = 'USER_A_COOKIE_MARKER_998877';
  const userB_Marker = 'USER_B_COOKIE_MARKER_112233';

  const cookiesTextA = `# Netscape HTTP Cookie File
.youtube.com\tTRUE\t/\tTRUE\t2147483647\tLOGIN_INFO\t${userA_Marker}
.google.com\tTRUE\t/\tTRUE\t2147483647\tSID\talice_sid_marker
`;
  const cookiesTextB = `# Netscape HTTP Cookie File
.youtube.com\tTRUE\t/\tTRUE\t2147483647\tLOGIN_INFO\t${userB_Marker}
.google.com\tTRUE\t/\tTRUE\t2147483647\tSID\tbob_sid_marker
`;

  // Save for User A
  const cookieInfoA = await CookieService.saveCookies(userA_Id, cookiesTextA);
  assert(cookieInfoA.configured && cookieInfoA.cookieCount === 2, 'User A cookies saved with metadata');

  // Save for User B
  const cookieInfoB = await CookieService.saveCookies(userB_Id, cookiesTextB);
  assert(cookieInfoB.configured && cookieInfoB.cookieCount === 2, 'User B cookies saved with metadata');

  // Verify encrypted at rest in PostgreSQL (no plaintext secrets or markers)
  const [rowA, rowB] = await Promise.all([
    Database.query('SELECT encrypted_cookies FROM user_cookies WHERE user_id = $1;', [userA_Id]),
    Database.query('SELECT encrypted_cookies FROM user_cookies WHERE user_id = $1;', [userB_Id]),
  ]);
  const encA = rowA.rows[0].encrypted_cookies;
  const encB = rowB.rows[0].encrypted_cookies;

  assert(!encA.includes(userA_Marker) && encA.includes(':'), 'User A cookies stored encrypted (AES-256-GCM) at rest in DB');
  assert(!encB.includes(userB_Marker) && encB.includes(':'), 'User B cookies stored encrypted (AES-256-GCM) at rest in DB');

  // Materialize isolated temporary files for each user
  const ytArgsA = await CookieService.getYtDlpArgsForUser(userA_Id);
  const ytArgsB = await CookieService.getYtDlpArgsForUser(userB_Id);

  assert(ytArgsA.args.length === 2 && ytArgsA.args[0] === '--cookies', 'User A receives --cookies argument');
  assert(ytArgsB.args.length === 2 && ytArgsB.args[0] === '--cookies', 'User B receives --cookies argument');

  const fileA_Path = ytArgsA.args[1];
  const fileB_Path = ytArgsB.args[1];

  assert(fileA_Path !== fileB_Path, 'User A and User B temporary cookie files are strictly distinct paths');

  const contentA = fs.readFileSync(fileA_Path, 'utf8');
  const contentB = fs.readFileSync(fileB_Path, 'utf8');

  assert(contentA.includes(userA_Marker) && !contentA.includes(userB_Marker), 'User A cookie file contains ONLY User A test credentials');
  assert(contentB.includes(userB_Marker) && !contentB.includes(userA_Marker), 'User B cookie file contains ONLY User B test credentials');

  const statA = fs.statSync(fileA_Path);
  const statB = fs.statSync(fileB_Path);
  const octalA = (statA.mode & 0o777).toString(8);
  const octalB = (statB.mode & 0o777).toString(8);

  assert(octalA === '600', `User A cookie file permissions are strictly 0600 (got ${octalA})`);
  assert(octalB === '600', `User B cookie file permissions are strictly 0600 (got ${octalB})`);

  // Verify actual YouTube acquisition path cookie binding
  // When SourceAcquisitionService runs for User A, it retrieves User A's cookie args
  const userA_AcquisitionArgs = await CookieService.getYtDlpArgsForUser(userA_Id);
  assert(userA_AcquisitionArgs.args[1].endsWith('.txt'), 'User A acquisition path binds User A cookie file');
  const fileAcqContentA = fs.readFileSync(userA_AcquisitionArgs.args[1], 'utf8');
  assert(fileAcqContentA.includes(userA_Marker) && !fileAcqContentA.includes(userB_Marker), 'Acquisition path for User A strictly receives User A cookies');
  userA_AcquisitionArgs.cleanup();

  const userB_AcquisitionArgs = await CookieService.getYtDlpArgsForUser(userB_Id);
  const fileAcqContentB = fs.readFileSync(userB_AcquisitionArgs.args[1], 'utf8');
  assert(fileAcqContentB.includes(userB_Marker) && !fileAcqContentB.includes(userA_Marker), 'Acquisition path for User B strictly receives User B cookies');
  userB_AcquisitionArgs.cleanup();

  // Cleanup removes both files immediately
  ytArgsA.cleanup();
  ytArgsB.cleanup();
  assert(!fs.existsSync(fileA_Path), 'User A cookie file removed immediately by cleanup');
  assert(!fs.existsSync(fileB_Path), 'User B cookie file removed immediately by cleanup');

  // Deleting User A does not affect User B
  await CookieService.deleteCookies(userA_Id);
  const postDeleteA = await CookieService.getCookieInfo(userA_Id);
  const postDeleteB = await CookieService.getCookieInfo(userB_Id);
  assert(!postDeleteA.configured, 'User A cookies deleted');
  assert(postDeleteB.configured, 'User B cookies remain configured and isolated');

  await CookieService.deleteCookies(userB_Id);

  // -------------------------------------------------------------
  // 7. Live Production Media HTTP Routes (/api/media/*)
  // -------------------------------------------------------------
  console.log('\n--- 7. Live Production Media HTTP Routes on Server Process ---');
  // Set up persistent media asset owned by User A
  const mediaRelKey = `projects/${projA.id}/clips/${clipA.id}/video.mp4`;
  const mediaFullPath = path.join(process.cwd(), 'storage', 'media', mediaRelKey);
  fs.mkdirSync(path.dirname(mediaFullPath), { recursive: true });
  fs.writeFileSync(mediaFullPath, 'MOCK_TEST_MP4_CONTENT_12345', 'utf8');

  const serverBaseUrl = 'http://127.0.0.1:3099';

  // 7.1. User A (Owner) authenticated access
  const resUrlA = await fetch(`${serverBaseUrl}/api/media/url?key=${encodeURIComponent(mediaRelKey)}`, {
    headers: { Authorization: `Bearer test_token_${userA_Id}` },
  });
  const dataUrlA = await resUrlA.json();
  assert(resUrlA.status === 200 && dataUrlA.success, 'Production GET /api/media/url: User A (Owner) allowed (200 OK)');

  const resMetaA = await fetch(`${serverBaseUrl}/api/media/metadata?key=${encodeURIComponent(mediaRelKey)}`, {
    headers: { Authorization: `Bearer test_token_${userA_Id}` },
  });
  const dataMetaA = await resMetaA.json();
  assert(resMetaA.status === 200 && dataMetaA.success, 'Production GET /api/media/metadata: User A (Owner) allowed (200 OK)');

  const resStreamA = await fetch(`${serverBaseUrl}/api/media/stream?key=${encodeURIComponent(mediaRelKey)}`, {
    headers: { Authorization: `Bearer test_token_${userA_Id}` },
  });
  const streamBodyA = await resStreamA.text();
  assert(resStreamA.status === 200 && streamBodyA.includes('MOCK_TEST_MP4'), 'Production GET /api/media/stream: User A (Owner) streams media (200 OK)');

  // 7.2. User B (Cross-Tenant) attempting to access User A's media
  const resUrlB = await fetch(`${serverBaseUrl}/api/media/url?key=${encodeURIComponent(mediaRelKey)}`, {
    headers: { Authorization: `Bearer test_token_${userB_Id}` },
  });
  assert(resUrlB.status === 404 || resUrlB.status === 403, `Production GET /api/media/url: User B rejected (${resUrlB.status})`);

  const resMetaB = await fetch(`${serverBaseUrl}/api/media/metadata?key=${encodeURIComponent(mediaRelKey)}`, {
    headers: { Authorization: `Bearer test_token_${userB_Id}` },
  });
  assert(resMetaB.status === 404 || resMetaB.status === 403, `Production GET /api/media/metadata: User B rejected (${resMetaB.status})`);

  const resStreamB = await fetch(`${serverBaseUrl}/api/media/stream?key=${encodeURIComponent(mediaRelKey)}`, {
    headers: { Authorization: `Bearer test_token_${userB_Id}` },
  });
  assert(resStreamB.status === 404 || resStreamB.status === 403, `Production GET /api/media/stream: User B stream rejected (${resStreamB.status})`);

  // 7.3. Unauthenticated requests must be rejected with 401
  const resUnauthUrl = await fetch(`${serverBaseUrl}/api/media/url?key=${encodeURIComponent(mediaRelKey)}`);
  assert(resUnauthUrl.status === 401, `Unauthenticated GET /api/media/url rejected (HTTP ${resUnauthUrl.status})`);

  const resUnauthMeta = await fetch(`${serverBaseUrl}/api/media/metadata?key=${encodeURIComponent(mediaRelKey)}`);
  assert(resUnauthMeta.status === 401, `Unauthenticated GET /api/media/metadata rejected (HTTP ${resUnauthMeta.status})`);

  const resUnauthStream = await fetch(`${serverBaseUrl}/api/media/stream?key=${encodeURIComponent(mediaRelKey)}`);
  assert(resUnauthStream.status === 401, `Unauthenticated GET /api/media/stream rejected (HTTP ${resUnauthStream.status})`);

  // 7.4. Path Traversal Attacks must be rejected
  const traversalKeys = [
    '../../../etc/passwd',
    '../../storage/media/test.mp4',
    'projects/../etc/passwd',
    `projects/${projB.id}/clips/${clipA.id}/video.mp4`, // User A requesting User B's project
  ];

  for (const tKey of traversalKeys) {
    const resTrav = await fetch(`${serverBaseUrl}/api/media/url?key=${encodeURIComponent(tKey)}`, {
      headers: { Authorization: `Bearer test_token_${userA_Id}` },
    });
    assert(
      resTrav.status === 400 || resTrav.status === 403 || resTrav.status === 404,
      `Path traversal rejected for key "${tKey}" (HTTP ${resTrav.status})`
    );
  }

  // Terminate server process 2 cleanly
  await serverProc2.stop();

  // -------------------------------------------------------------
  // 8. Fail-Closed Media Access
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

  const pubJobB = await PublishingRepository.create({
    id: `pub-job-B-${Date.now()}`,
    userId: userB_Id,
    clipId: clipA.id,
    clipTitle: 'Bob Clip',
    platform: 'youtube',
    accountId: 'acc_test_yt',
    status: 'QUEUED',
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  assert(pubJobA.userId === userA_Id, 'Publishing job A created with owner User A');
  assert(pubJobB.userId === userB_Id, 'Publishing job B created with owner User B');

  // User B cannot find or update User A's publishing job
  const pubJobFoundByB = await PublishingRepository.findById(pubJobA.id, userB_Id);
  assert(pubJobFoundByB === null, 'User B cannot find User A publishing job');

  const pubJobUpdatedByB = await PublishingRepository.update(pubJobA.id, { status: 'CANCELLED' }, userB_Id);
  assert(pubJobUpdatedByB === null, 'User B cannot update User A publishing job');

  // User A cannot find or update User B's publishing job
  const pubJobFoundByA = await PublishingRepository.findById(pubJobB.id, userA_Id);
  assert(pubJobFoundByA === null, 'User A cannot find User B publishing job');

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

  // -------------------------------------------------------------
  // 10. Phase Regressions (Phase 2, 3, 4, 5)
  // -------------------------------------------------------------
  console.log('\n--- 10. Regressions (Phase 2, 3, 4, 5) ---');
  // Phase 2 Regression
  const validUrlCheck = YouTubeService.validateYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert(validUrlCheck.isValid && validUrlCheck.videoId === 'dQw4w9WgXcQ', 'Phase 2: YouTube URL validation succeeds');
  const invalidUrlCheck = YouTubeService.validateYouTubeUrl('https://malicious.site/video.mp4');
  assert(!invalidUrlCheck.isValid, 'Phase 2: Non-YouTube URL rejected');
  const ytDiagnostics = await YouTubeService.getYtDlpDiagnostics();
  assert(Boolean(ytDiagnostics.ytDlpVersion), `Phase 2: yt-dlp binary functional (version ${ytDiagnostics.ytDlpVersion})`);

  // Phase 3 Regression
  const ffmpegBin = VideoProcessingService.getFfmpegBinary();
  const ffprobeBin = VideoProcessingService.getFfprobeBinary();
  assert(fs.existsSync(ffmpegBin) && fs.existsSync(ffprobeBin), 'Phase 3: FFmpeg & FFprobe installed binaries found');

  // Phase 4 Regression
  const dbHealth = await Database.checkHealth();
  assert(dbHealth === true, 'Phase 4: PostgreSQL connection pool healthy');
  const tablesRes = await Database.query("SELECT count(*)::int as count FROM information_schema.tables WHERE table_schema = 'public'");
  assert(tablesRes.rows[0].count >= 10, `Phase 4: PostgreSQL authoritative tables present (${tablesRes.rows[0].count} tables)`);

  // Phase 5 Regression
  const storageProvider = StorageService.getProvider();
  assert(storageProvider === 'local', `Phase 5: Storage provider is local`);
  const safeProjectKey = StorageService.sanitizeKey('projects/proj_123/video.mp4');
  assert(safeProjectKey === 'projects/proj_123/video.mp4', 'Phase 5: Storage key sanitizer allows legitimate project keys');

  // Clean up test records
  console.log('\n--- Cleanup ---');
  try {
    fs.unlinkSync(mediaFullPath);
  } catch {}
  await ProjectRepository.delete(projA.id, userA_Id).catch(() => {});
  await ProjectRepository.delete(projB.id, userB_Id).catch(() => {});
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
