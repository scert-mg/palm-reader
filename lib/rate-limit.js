/**
 * lib/rate-limit.js - Vercel Serverless Function용 인메모리 요청 속도 제한 (Rate Limiting) 모듈
 * 
 * 단일 IP 기준:
 * - 윈도우 시간: 60초 (1분)
 * - 최대 허용 요청 수: 10회 (손금 분석은 고비용 AI 작업이므로 분당 10회로 제한)
 */

const ipRequestMap = new Map();

// 주기적으로 만료된 IP 기록 정리 (메모리 누수 방지, 5분마다)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpired() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [ip, record] of ipRequestMap.entries()) {
    if (now - record.resetTime > 60000) {
      ipRequestMap.delete(ip);
    }
  }
}

/**
 * 클라이언트 IP 확인 (Vercel 프록시 헤더 우선 감지)
 * @param {object} req 
 * @returns {string}
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown-ip';
}

/**
 * IP별 요청 빈도 검사
 * @param {string} ip 
 * @param {number} maxRequests 분당 최대 요청 수 (기본: 10)
 * @param {number} windowMs 윈도우 밀리초 (기본: 60000 = 1분)
 * @returns {{ allowed: boolean, remaining: number, resetInSeconds: number }}
 */
export function checkRateLimit(ip, maxRequests = 10, windowMs = 60000) {
  cleanupExpired();

  const now = Date.now();
  let record = ipRequestMap.get(ip);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + windowMs
    };
    ipRequestMap.set(ip, record);
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetInSeconds: Math.ceil(windowMs / 1000)
    };
  }

  record.count += 1;
  const resetInSeconds = Math.ceil((record.resetTime - now) / 1000);

  if (record.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds
    };
  }

  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetInSeconds
  };
}
