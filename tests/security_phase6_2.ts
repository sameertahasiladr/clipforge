/**
 * ClipForge AI — Phase 6.2 Strict Multi-Tenant Security Verification Test Suite
 * Directly tests real PostgreSQL database boundary, strict ownership enforcement,
 * PostgreSQL-backed OAuth state, per-user encrypted cookies, fail-closed media access,
 * and background worker isolation across two distinct authenticated users.
 */

import { Database } from '../server/db/database.ts';
import { UserRepository } from '../server/repositories/userRepository.ts';
import { ProjectRepository } from '../server/repositories/projectRepository.ts';
import { ClipRepository } from '../server/repositories/clipRepository.ts';
import { JobRepository } from '../server/repositories/jobRepository.ts';
import { PublishingRepository } from '../server/repositories/publishingRepository.ts';
import { ScheduleRepository } from '../server/repositories/scheduleRepository.ts';
import { JobService } from '../server/services/jobService.ts';
import { PublishingService } from '../server/services/publishingService.ts';
import { OAuthStateService } from '../server/services/oauthStateService.ts';
import { CookieService } from '../server/services/cookieService.ts';
import { CryptoService } from '../server/services/cryptoService.ts';
import { StorageService } from '../server/services/storageService.ts';
import { BackgroundWorkerService } from '../server/services/workerService.ts';
import fs from 'node:fs';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('====================================================================');
  console.log('ClipForge AI — Phase 6.2 Security Test Suite Execution');
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
  // 1. Processing Job Ownership: Strict DB Boundary
  // -------------------------------------------------------------
  console.log('\n--- 1. Processing Job Ownership ---');
  let threwOnMissingUserCreate = false;
  try {
    await JobRepository.create({
      jobId: `job-invalid-${Date.now()}`,
      status: 'pending',
      state: 'PENDING',
      progressPercent: 0,
      statusMessage: 'Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any, undefined, '' as any);
  } catch {
    threwOnMissingUserCreate = true;
  }
  assert(threwOnMissingUserCreate, 'JobRepository.create rejects missing/empty userId');

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
  // 2. Project & Clip Multi-Tenant Isolation
  // -------------------------------------------------------------
  console.log('\n--- 2. Project & Clip Ownership ---');
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
  // 3. Publishing Service: No Owner Fallback
  // -------------------------------------------------------------
  console.log('\n--- 3. Publishing Service Ownership ---');
  let publishingFailedForUserB = false;
  try {
    // User B tries to publish User A's clip
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
  // 4. PostgreSQL-Backed OAuth State (Single-Use, Atomicity)
  // -------------------------------------------------------------
  console.log('\n--- 4. PostgreSQL-Backed OAuth State ---');
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
  assert(!replayRes.valid, 'OAuth state token cannot be reused (single-use enforced in PostgreSQL)');

  // -------------------------------------------------------------
  // 5. Per-User Encrypted YouTube Cookie Isolation
  // -------------------------------------------------------------
  console.log('\n--- 5. Per-User YouTube Cookie Isolation & Encryption ---');
  const sampleNetscapeCookiesA = `# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	2147483647	LOGIN_INFO	alice_login_secret_cookie_token_12345
.youtube.com	TRUE	/	TRUE	2147483647	VISITOR_INFO1_LIVE	alice_visitor_token_abc
.google.com	TRUE	/	TRUE	2147483647	SID	alice_session_sid_9999
`;

  // Save User A cookies
  const saveCookieResA = await CookieService.saveCookies(userA_Id, sampleNetscapeCookiesA);
  assert(saveCookieResA.configured === true && saveCookieResA.cookieCount === 3, 'User A cookies saved with metadata');
  assert(saveCookieResA.filePath === null, 'Cookie metadata does not expose disk file path');

  // Verify encrypted at rest in PostgreSQL
  const dbCookieRow = await Database.query('SELECT encrypted_cookies FROM user_cookies WHERE user_id = $1;', [userA_Id]);
  const encryptedVal = dbCookieRow.rows[0].encrypted_cookies;
  assert(
    !encryptedVal.includes('alice_login_secret_cookie_token_12345') && encryptedVal.includes(':'),
    'YouTube cookies stored encrypted (AES-256-GCM ciphertext) at rest in PostgreSQL'
  );

  // User B MUST NOT have User A's cookies
  const userB_CookieInfo = await CookieService.getCookieInfo(userB_Id);
  assert(userB_CookieInfo.configured === false && userB_CookieInfo.cookieCount === 0, 'User B has configured=false (no cookie leakage from User A)');

  const userB_File = await CookieService.getUserCookiesFile(userB_Id);
  assert(userB_File.filePath === null, 'User B getUserCookiesFile returns null');

  // User A gets temporary isolated file with 0600 permissions
  const userA_File = await CookieService.getUserCookiesFile(userA_Id);
  assert(userA_File.filePath !== null && fs.existsSync(userA_File.filePath), 'User A temporary cookie file created for operation');

  const fileStats = fs.statSync(userA_File.filePath!);
  const modeOctal = (fileStats.mode & 0o777).toString(8);
  assert(modeOctal === '600', `Temporary cookie file has strict 0600 permissions (got ${modeOctal})`);

  // Cleanup removes file immediately
  userA_File.cleanup();
  assert(!fs.existsSync(userA_File.filePath!), 'Temporary cookie file deleted immediately by cleanup callback');

  // Deleting User A cookies
  await CookieService.deleteCookies(userA_Id);
  const deletedInfo = await CookieService.getCookieInfo(userA_Id);
  assert(deletedInfo.configured === false, 'User A cookies deleted successfully from PostgreSQL');

  // -------------------------------------------------------------
  // 6. Fail-Closed Media Access URL
  // -------------------------------------------------------------
  console.log('\n--- 6. Fail-Closed Media Access ---');
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
  // 7. Background Worker Ownership
  // -------------------------------------------------------------
  console.log('\n--- 7. Background Worker Isolation ---');
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

  // Clean up test records
  console.log('\n--- Cleanup ---');
  await ProjectRepository.delete(projA.id, userA_Id).catch(() => {});
  await Database.query('DELETE FROM users WHERE id IN ($1, $2);', [userA_Id, userB_Id]);
  console.log('Test users and data cleaned up successfully.');

  console.log('====================================================================');
  console.log(`Phase 6.2 Test Results: ${passedCount} PASSED, ${failedCount} FAILED`);
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
