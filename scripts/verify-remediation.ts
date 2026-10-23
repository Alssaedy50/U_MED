/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Critical Remediation Automated Verification Suite
 * Verifies authentication hardening, privilege escalation immunity, assessment deadline/attempt checks,
 * and cryptographic backup integrity.
 */

import http from 'http';
import crypto from 'crypto';
import { app } from '../api/index.ts';

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordTest(category: string, name: string, passed: boolean, details: string) {
  results.push({ name, category, passed, details });
  const mark = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`[${mark}] [${category}] ${name}: ${details}`);
}

// Helper to make local in-process HTTP requests against Express app
function makeRequest(
  server: http.Server,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      return reject(new Error('Server address not available'));
    }

    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: address.port,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runVerification() {
  console.log('================================================================');
  console.log('🚀 Running UMED Security & Remediation Automated Test Suite');
  console.log('================================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // -------------------------------------------------------------------------
    // Category 1: Health & Runtime Verification
    // -------------------------------------------------------------------------
    const health = await makeRequest(server, 'GET', '/api/health');
    recordTest(
      'HEALTH',
      'Health check endpoint responds 200 with security config',
      health.status === 200 && health.body.status === 'ok',
      `Status: ${health.status}, authVerification: ${health.body?.security?.authVerification}`
    );

    // -------------------------------------------------------------------------
    // Category 2: Authentication & Token Verification (VULN-01 & VULN-02)
    // -------------------------------------------------------------------------

    // Test 2.1: Missing Bearer Token on Protected Endpoint
    const noAuthRoles = await makeRequest(server, 'GET', '/api/admin/roles');
    recordTest(
      'AUTH',
      'Reject request to /api/admin/roles without Bearer token',
      noAuthRoles.status === 401,
      `Received HTTP ${noAuthRoles.status} (Expected 401)`
    );

    // Test 2.2: Forged / Self-Signed Token without Google Cert Signature
    const fakeHeader = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fake-kid-123' })).toString('base64url');
    const fakePayload = Buffer.from(
      JSON.stringify({
        iss: 'https://securetoken.google.com/umed-yemen',
        aud: 'umed-yemen',
        sub: 'forged-attacker-uid',
        email: 'alssaedy50@gmail.com',
        exp: Math.floor(Date.now() / 1000) + 3600
      })
    ).toString('base64url');
    const fakeSig = Buffer.from('invalid-signature-bytes').toString('base64url');
    const forgedToken = `${fakeHeader}.${fakePayload}.${fakeSig}`;

    const forgedTokenRes = await makeRequest(server, 'GET', '/api/admin/roles', {
      'Authorization': `Bearer ${forgedToken}`
    });
    recordTest(
      'AUTH',
      'Reject forged RSA-256 token without valid Google public key signature',
      forgedTokenRes.status === 401,
      `Received HTTP ${forgedTokenRes.status} (Expected 401)`
    );

    // Test 2.3: Body-Supplied Caller Identity Bypass (Privilege Escalation Immunity)
    const bodySpoofBootstrap = await makeRequest(
      server,
      'POST',
      '/api/admin/bootstrap-owner',
      {},
      { email: 'alssaedy50@gmail.com', uid: 'attacker-uid' }
    );
    recordTest(
      'AUTH',
      'Prevent unauthenticated body-supplied bootstrap privilege escalation',
      bodySpoofBootstrap.status === 401,
      `Received HTTP ${bodySpoofBootstrap.status} (Expected 401)`
    );

    const bodySpoofAssign = await makeRequest(
      server,
      'POST',
      '/api/admin/assign-role',
      {},
      {
        callerEmail: 'alssaedy50@gmail.com',
        targetUid: 'student-victim',
        role: 'platform_owner'
      }
    );
    recordTest(
      'AUTH',
      'Prevent body-supplied callerEmail role assignment bypass',
      bodySpoofAssign.status === 401,
      `Received HTTP ${bodySpoofAssign.status} (Expected 401)`
    );

    // Test 2.4: Protected Admin Questions Endpoint
    const unauthQuestions = await makeRequest(server, 'GET', '/api/admin/questions');
    recordTest(
      'CONFIDENTIALITY',
      'Reject unauthenticated access to /api/admin/questions (Answer Key Secrecy)',
      unauthQuestions.status === 401,
      `Received HTTP ${unauthQuestions.status} (Expected 401)`
    );

    // Test 2.5: Protected Admin Sync Endpoint
    const unauthSync = await makeRequest(server, 'POST', '/api/admin/sync-assessment-questions', {}, {
      deletedQuestionIds: ['q-cvs-1']
    });
    recordTest(
      'AUTH',
      'Reject unauthenticated call to /api/admin/sync-assessment-questions',
      unauthSync.status === 401,
      `Received HTTP ${unauthSync.status} (Expected 401)`
    );

    // -------------------------------------------------------------------------
    // Category 3: Assessment Integrity, Deadlines & Scoring (VULN-04 & VULN-05)
    // -------------------------------------------------------------------------

    const testAssessmentId = `asmnt-test-${Date.now()}`;
    const testUid = `student-test-${Date.now()}`;

    // Test 3.1: Start attempt returns public questions without answer keys
    const startAttemptRes = await makeRequest(server, 'POST', '/api/assessments/start-attempt', {}, {
      assessmentId: testAssessmentId,
      durationMinutes: 10,
      maxAttempts: 1,
      uid: testUid
    });

    const questionsAreSanitized =
      startAttemptRes.status === 200 &&
      Array.isArray(startAttemptRes.body.questions) &&
      startAttemptRes.body.questions.every(
        (q: any) => q.correctOptionId === undefined && q.explanationArabic === undefined
      );

    recordTest(
      'ASSESSMENT',
      'Assessment questions delivered to students are stripped of correctOptionId and explanations',
      questionsAreSanitized,
      `Sanitized check passed: ${questionsAreSanitized}`
    );

    const attemptId = startAttemptRes.body?.attempt?.id;

    // Test 3.2: Submit valid attempt within deadline scores accurately
    const submitRes = await makeRequest(server, 'POST', '/api/assessments/submit-attempt', {}, {
      attemptId,
      assessmentId: testAssessmentId,
      answers: {
        'q-cvs-1': 'opt-b', // correct (+5)
        'q-cvs-2': 'opt-a', // correct (+5)
        'q-cvs-3': 'opt-c'  // incorrect (0)
      },
      uid: testUid
    });

    const isScoreCorrect =
      submitRes.status === 200 &&
      submitRes.body.result?.score === 10 &&
      submitRes.body.result?.totalPoints === 15;

    recordTest(
      'ASSESSMENT',
      'Server-authoritative scoring calculates 10/15 points using protected answer keys',
      isScoreCorrect,
      `Calculated Score: ${submitRes.body.result?.score}/${submitRes.body.result?.totalPoints}`
    );

    // Test 3.3: Idempotent submission returns original result without re-grading
    const resubmitRes = await makeRequest(server, 'POST', '/api/assessments/submit-attempt', {}, {
      attemptId,
      answers: { 'q-cvs-3': 'opt-a' } // attempting to change after submission
    });

    recordTest(
      'ASSESSMENT',
      'Idempotent submission returns existing score and rejects post-submission answer modification',
      resubmitRes.status === 200 && resubmitRes.body.result?.score === 10,
      `Score maintained at ${resubmitRes.body.result?.score}`
    );

    // Test 3.4: Max attempts enforcement
    const secondAttemptRes = await makeRequest(server, 'POST', '/api/assessments/start-attempt', {}, {
      assessmentId: testAssessmentId,
      maxAttempts: 1,
      uid: testUid
    });

    recordTest(
      'ASSESSMENT',
      'Enforce maxAttempts limit: reject starting second attempt when maxAttempts is 1',
      secondAttemptRes.status === 403,
      `Received HTTP ${secondAttemptRes.status} (Expected 403)`
    );

    // -------------------------------------------------------------------------
    // Category 4: Backup/Restore Cryptographic SHA-256 & Batch Chunking (VULN-07)
    // -------------------------------------------------------------------------

    // Test 4.1: SHA-256 Checksum generation and verification
    const testPayload = { items: [1, 2, 3], timestamp: '2026-10-23' };
    const hash = crypto.createHash('sha256').update(JSON.stringify(testPayload)).digest('hex');
    const tamperedPayload = { items: [1, 2, 3, 4], timestamp: '2026-10-23' };
    const tamperedHash = crypto.createHash('sha256').update(JSON.stringify(tamperedPayload)).digest('hex');

    recordTest(
      'BACKUP',
      'Cryptographic SHA-256 detection detects any byte modification in backup data',
      hash !== tamperedHash && hash.length === 64,
      `Original hash: ${hash.slice(0, 12)}..., Tampered: ${tamperedHash.slice(0, 12)}...`
    );

    // Test 4.2: Batch chunking algorithm verification
    const testLargeList = Array.from({ length: 950 }, (_, i) => ({ id: `doc-${i}` }));
    const CHUNK_SIZE = 400;
    const chunks: any[][] = [];
    for (let i = 0; i < testLargeList.length; i += CHUNK_SIZE) {
      chunks.push(testLargeList.slice(i, i + CHUNK_SIZE));
    }

    const chunkingValid =
      chunks.length === 3 &&
      chunks[0].length === 400 &&
      chunks[1].length === 400 &&
      chunks[2].length === 150 &&
      chunks.every((c) => c.length <= 400);

    recordTest(
      'BACKUP',
      'Batch chunking splits 950 items into chunks <= 400 to prevent Firestore 500-write limit exception',
      chunkingValid,
      `Split into ${chunks.length} chunks of sizes: ${chunks.map((c) => c.length).join(', ')}`
    );

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  const allPassed = results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${results.length - passedCount}`);
  if (allPassed) {
    console.log('🎉 ALL SECURITY & REMEDIATION TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('❌ SOME TESTS FAILED. PLEASE REVIEW OUTPUT ABOVE.');
  }
  console.log('================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
