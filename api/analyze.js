/**
 * api/analyze.js - Vercel Serverless Function (POST /api/analyze)
 * 
 * 보안 강화 조치:
 * 1. POST 전용 및 캐시 방지(no-store)
 * 2. IP 기반 요청 속도 제한 (Rate Limiting: 분당 10회)
 * 3. 요청 바디 및 Base64 이미지 크기 상한 엄격 적용
 * 4. 비밀 키, 환경 변수, 스택 트레이스 노출 차단
 * 5. 로그에 이미지 본문 및 토큰 기록 금지
 */

import { validateAnalyzeRequest } from '../lib/validation.js';
import { analyzeCategory, checkAIConfig } from '../lib/aiProvider.js';
import { checkRateLimit, getClientIp } from '../lib/rate-limit.js';

export default async function handler(req, res) {
  // 캐싱 방지 및 보안 헤더 설정
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 1. HTTP 메서드 검증
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      error: '허용되지 않는 HTTP 메서드입니다. POST 요청만 지원합니다.'
    });
  }

  // 2. IP 기반 속도 제한 (공개 API 악용 및 디도스/크롤링 방지)
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp, 10, 60000); // 1분에 10회

  res.setHeader('X-RateLimit-Limit', '10');
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  res.setHeader('X-RateLimit-Reset', String(rateLimit.resetInSeconds));

  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      error: `요청 빈도가 너무 높습니다. 악용 방지를 위해 ${rateLimit.resetInSeconds}초 후에 다시 시도해 주세요.`
    });
  }

  try {
    // 3. 서버 환경 변수 확인
    const configCheck = checkAIConfig();
    if (!configCheck.configured) {
      return res.status(503).json({
        success: false,
        code: 'CONFIG_MISSING',
        error: configCheck.error || '서버에 AI API 설정(GEMINI_API_KEY)이 구성되지 않았습니다. .env.local 파일을 확인해 주세요.'
      });
    }

    // 4. 요청 본문 및 이미지 유효성 검사
    const validation = validateAnalyzeRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REQUEST',
        error: validation.error
      });
    }

    const { sanitized } = validation;

    // 5. 요청 카테고리에 대한 실제 AI 비전 손금 분석 실행
    // (서버 로그에 이미지 바이너리/Base64나 API 토큰을 출력하지 않음)
    const result = await analyzeCategory(
      {
        leftImage: sanitized.leftImage,
        rightImage: sanitized.rightImage
      },
      sanitized.requestedCategory
    );

    // 6. 성공 응답 반환
    return res.status(200).json({
      success: true,
      timestamp: result.timestamp,
      category: sanitized.requestedCategory,
      data: result.categoryData
    });

  } catch (err) {
    // 7. 안전한 오류 처리 (내부 스택/토큰/환경변수 노출 방지)
    const statusCode = err.status || 500;
    const errorCode = err.code || 'INTERNAL_SERVER_ERROR';

    let userMessage = '손금 분석 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    if (errorCode === 'RATE_LIMITED') {
      userMessage = 'AI 서비스의 일일 무료 이용 한도 또는 분당 요청 제한을 초과했습니다. 유료 자동 결제는 진행되지 않으므로 잠시 후 다시 시도해 주세요.';
    } else if (errorCode === 'AI_AUTH_FAILED') {
      userMessage = 'AI 서비스 인증에 실패했습니다. 관리자 설정을 확인해 주세요.';
    } else if (errorCode === 'TIMEOUT') {
      userMessage = '분석 시간이 초과되었습니다 (28초). 이미지 크기를 줄이거나 다시 시도해 주세요.';
    } else if (err.message && typeof err.message === 'string' && !err.message.includes('Bearer')) {
      userMessage = err.message;
    }

    return res.status(statusCode).json({
      success: false,
      code: errorCode,
      error: userMessage
    });
  }
}
