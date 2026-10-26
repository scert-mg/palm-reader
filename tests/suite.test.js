/**
 * tests/suite.test.js - 핵심 기능 24개 항목 검증을 위한 통합 테스트 스위트
 * 
 * 실행: node tests/suite.test.js
 */

import assert from 'node:assert';
import { validateAnalyzeRequest, validateAnalysisStructure } from '../lib/validation.js';
import { checkRateLimit } from '../lib/rate-limit.js';
import { checkAIConfig } from '../lib/aiProvider.js';
import { parseAppError } from '../js/error-handler.js';
import handler from '../api/analyze.js';

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

console.log('====================================');
console.log('🧪 손금 분석 앱 8단계 통합 테스트 시작');
console.log('====================================\n');

// 1. 유효하지 않은 이미지 형식 검증
runTest('테스트 19: 잘못된 이미지 형식 차단', () => {
  const result = validateAnalyzeRequest({
    images: { left: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }
  });
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /형식이 올바르지 않거나/);
});

// 2. 이미지 용량 초과 검증 (Base64 길이 제한)
runTest('테스트 20: 허용 용량 초과 이미지 차단', () => {
  const fakeHugeBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(5 * 1024 * 1024);
  const result = validateAnalyzeRequest({
    images: { left: fakeHugeBase64 }
  });
  assert.strictEqual(result.valid, false);
});

// 3. 한 손만 업로드한 경우 분석 요청 검증
runTest('테스트 4: 한 손만 업로드한 경우 요청 허용', () => {
  const validDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
  const result = validateAnalyzeRequest({
    images: { left: validDataUrl }
  });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.sanitized.leftImage, validDataUrl);
  assert.strictEqual(result.sanitized.rightImage, null);
});

// 4. 두 손을 모두 업로드한 경우 분석 요청 검증
runTest('테스트 5: 두 손 모두 업로드한 경우 요청 허용', () => {
  const validDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
  const result = validateAnalyzeRequest({
    images: { left: validDataUrl, right: validDataUrl }
  });
  assert.strictEqual(result.valid, true);
  assert.ok(result.sanitized.leftImage);
  assert.ok(result.sanitized.rightImage);
});

// 5. 10개 태그 화이트리스트 검증
runTest('테스트 9: 10개 태그 및 기본값 폴백 검증', () => {
  const validDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
  const tags = ['overall', 'love', 'fortune', 'career', 'wealth', 'personality', 'health', 'crime', 'relations', 'marriage'];

  tags.forEach(t => {
    const res = validateAnalyzeRequest({
      images: { left: validDataUrl },
      requestedCategory: t
    });
    assert.strictEqual(res.sanitized.requestedCategory, t);
  });

  // 비정상 태그 입력 시 기본 'overall'로 폴백
  const invalidTagRes = validateAnalyzeRequest({
    images: { left: validDataUrl },
    requestedCategory: 'hacker_category'
  });
  assert.strictEqual(invalidTagRes.sanitized.requestedCategory, 'overall');
});

// 6. 범죄 및 건강 분석 안전 정책 필터링 검증
runTest('테스트 23: 범죄 및 건강 안전 정책 필터링 검증', () => {
  const dangerousSample = {
    category: 'crime',
    title: '범죄자 성향 분석',
    summary: '이 사람은 폭력성과 반사회적 성향이 강해 범죄자가 될 확률이 높습니다.',
    observations: ['감정선이 거칠어 전과 가능성 있음'],
    interpretations: ['절도 및 폭력 위험 있음'],
    reflection: '마음을 곱게 쓰세요.',
    disclaimer: '테스트'
  };

  const { sanitized } = validateAnalysisStructure(dangerousSample, 'crime');
  
  // 금지 단어가 안전한 표현으로 정제되었는지 확인
  assert.ok(!sanitized.summary.includes('범죄자'));
  assert.ok(!sanitized.summary.includes('폭력성'));
  assert.ok(!sanitized.observations[0].includes('전과'));
  assert.match(sanitized.disclaimer, /개인의 범죄 성향이나 위험성을 판정하지 않습니다/);

  // 건강 태그 질병 진단 및 수명 판정 방지 확인
  const healthSample = {
    category: 'health',
    title: '건강 진단',
    summary: '암 또는 당뇨에 걸릴 수 있으며 수명은 60살까지 산다.',
    observations: ['생명선 끊김'],
    interpretations: ['약 복용 필요'],
    reflection: '건강 조심',
    disclaimer: '테스트'
  };
  const healthSanitized = validateAnalysisStructure(healthSample, 'health').sanitized;
  assert.ok(!healthSanitized.summary.includes('암'));
  assert.ok(!healthSanitized.summary.includes('수명은'));
  assert.match(healthSanitized.disclaimer, /의학적 질병 진단이나 치료를 대신할 수 없습니다/);
});

// 7. API 응답 8개 필수 필드 무결성 검증
runTest('테스트 18: 잘못되거나 불완전한 AI 응답의 8개 필수 필드 복원', () => {
  const brokenResponse = {
    // 필수 필드 대거 누락
    summary: '흐릿한 손바닥'
  };
  const { sanitized } = validateAnalysisStructure(brokenResponse, 'overall');
  const requiredKeys = ['category', 'title', 'summary', 'imageQuality', 'observations', 'interpretations', 'reflection', 'disclaimer'];
  requiredKeys.forEach(k => {
    assert.ok(sanitized[k] !== undefined, `필수 필드 ${k} 누락`);
  });
});

// 8. 속도 제한 (Rate Limiting) 검증
runTest('테스트: Rate Limit 차단 동작 검증 (분당 10회 초과 시 429)', () => {
  const testIp = '192.168.1.100';
  for (let i = 1; i <= 10; i++) {
    const res = checkRateLimit(testIp, 10, 60000);
    assert.strictEqual(res.allowed, true);
  }
  const overflowRes = checkRateLimit(testIp, 10, 60000);
  assert.strictEqual(overflowRes.allowed, false);
  assert.strictEqual(overflowRes.remaining, 0);
});

// 9. API 키 누락 시 안전한 503 에러 처리 검증
await runAsyncTest('테스트 14: 서버 API 키 미구성 시 안전한 에러 반환', async () => {
  let statusCode = 0;
  let jsonBody = null;
  const res = {
    setHeader: () => {},
    status: (code) => {
      statusCode = code;
      return { json: (data) => { jsonBody = data; } };
    }
  };

  // 환경변수가 없을 때의 analyze 호출 시뮬레이션
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;

  await handler({ method: 'POST', body: {}, headers: {} }, res);
  assert.strictEqual(statusCode, 503);
  assert.strictEqual(jsonBody.code, 'CONFIG_MISSING');
  assert.strictEqual(jsonBody.success, false);
});

// 10. HTTP GET 메서드 거부 검증
await runAsyncTest('테스트: GET 메서드 405 차단', async () => {
  let statusCode = 0;
  const res = {
    setHeader: () => {},
    status: (code) => {
      statusCode = code;
      return { json: () => {} };
    }
  };
  await handler({ method: 'GET', headers: {} }, res);
  assert.strictEqual(statusCode, 405);
});

// 11. 에러 파서 사용자 안내 문구 검증
runTest('테스트 16 & 17: 네트워크 장애 및 한도 초과 친절한 한국어 안내', () => {
  const rateLimitErr = parseAppError({ code: 'RATE_LIMITED' });
  assert.match(rateLimitErr.message, /유료 자동 결제는 진행되지 않으니/);

  const networkErr = parseAppError({ name: 'NetworkError', message: 'Failed to fetch' });
  assert.match(networkErr.title, /네트워크/);
});

console.log('\n====================================');
console.log(`🏁 테스트 완료: 통과 ${passed}건, 실패 ${failed}건`);
console.log('====================================');

if (failed > 0) {
  process.exit(1);
}
