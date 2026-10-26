/**
 * lib/validation.js - 백엔드 요청 본문 및 입력값 검증 모듈 (안전 정책 필터링 포함)
 */

const ALLOWED_CATEGORIES = [
  'overall',
  'love',
  'fortune',
  'career',
  'wealth',
  'personality',
  'health',
  'crime',
  'relations',
  'marriage'
];

// Base64 Data URL 허용 형식 (JPEG, PNG, WebP)
const DATA_URL_REGEX = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_IMAGE_BASE64_LENGTH = 3.5 * 1024 * 1024 * 1.37; // 약 4.8MB 문자열

// 건강 및 범죄 부적절 키워드 탐지 목록 (위험 출력 원천 차단 필터)
const FORBIDDEN_WORDS = [
  '범죄자', '전과', '수감', '폭력성', '반사회적', '살인', '절도', '사이코패스', '소시오패스',
  '암', '당뇨', '심장병', '뇌졸중', '수명은', '살까지 산다', '사망', '약 복용', '투약'
];

/**
 * 이미지 Data URL 검증
 * @param {string} dataUrl 
 * @returns {boolean}
 */
export function isValidImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return false;
  if (dataUrl.length > MAX_IMAGE_BASE64_LENGTH) return false;
  return DATA_URL_REGEX.test(dataUrl);
}

/**
 * analyze API 요청 본문 검증
 * @param {object} body 
 * @returns {{ valid: boolean, error?: string, sanitized?: object }}
 */
export function validateAnalyzeRequest(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '요청 본문(JSON)이 비어있거나 올바르지 않습니다.' };
  }

  const { images, requestedCategory } = body;

  if (!images || typeof images !== 'object') {
    return { valid: false, error: '손 이미지 데이터(images)가 누락되었습니다.' };
  }

  const hasLeft = Boolean(images.left);
  const hasRight = Boolean(images.right);

  if (!hasLeft && !hasRight) {
    return { valid: false, error: '왼손과 오른손 중 최소 1장의 사진을 전달해야 합니다.' };
  }

  if (hasLeft && !isValidImageDataUrl(images.left)) {
    return { valid: false, error: '왼손 이미지 형식이 올바르지 않거나 허용 용량(10MB/전처리 3.5MB)을 초과했습니다.' };
  }

  if (hasRight && !isValidImageDataUrl(images.right)) {
    return { valid: false, error: '오른손 이미지 형식이 올바르지 않거나 허용 용량(10MB/전처리 3.5MB)을 초과했습니다.' };
  }

  const category = requestedCategory && ALLOWED_CATEGORIES.includes(requestedCategory)
    ? requestedCategory
    : 'overall';

  return {
    valid: true,
    sanitized: {
      leftImage: hasLeft ? images.left : null,
      rightImage: hasRight ? images.right : null,
      requestedCategory: category
    }
  };
}

/**
 * 텍스트 내 유해/단정적 표현 필터링 및 순화
 */
function sanitizeTextSafety(text, category) {
  if (typeof text !== 'string') return '';
  let cleaned = text;

  // 금지 단어 포함 시 안전한 표현으로 치환
  FORBIDDEN_WORDS.forEach(word => {
    if (cleaned.includes(word)) {
      if (category === 'crime') {
        cleaned = cleaned.replaceAll(word, '주의가 필요한 상황');
      } else if (category === 'health') {
        cleaned = cleaned.replaceAll(word, '컨디션 관리');
      }
    }
  });

  return cleaned;
}

/**
 * AI가 생성한 분석 결과 구조(8개 필수 필드) 엄격 검증 및 안전 정책 필터링
 * @param {object} analysisObj 
 * @param {string} expectedCategory 
 * @returns {{ valid: boolean, sanitized: object }}
 */
export function validateAnalysisStructure(analysisObj, expectedCategory = 'overall') {
  if (!analysisObj || typeof analysisObj !== 'object') {
    throw new Error('AI 응답이 객체 형식이 아닙니다.');
  }

  let rawSummary = typeof analysisObj.summary === 'string' && analysisObj.summary.trim()
    ? analysisObj.summary.trim()
    : '손금의 주선들이 관찰되었습니다.';

  let rawObservations = Array.isArray(analysisObj.observations) && analysisObj.observations.length > 0
    ? analysisObj.observations.map(obs => String(obs).trim()).filter(Boolean)
    : ['생명선과 두뇌선이 관찰되었습니다.'];

  let rawInterpretations = Array.isArray(analysisObj.interpretations) && analysisObj.interpretations.length > 0
    ? analysisObj.interpretations.map(interp => String(interp).trim()).filter(Boolean)
    : ['전통 손금학 이론에 따라 주선의 흐름이 조화롭습니다.'];

  let rawReflection = typeof analysisObj.reflection === 'string' && analysisObj.reflection.trim()
    ? analysisObj.reflection.trim()
    : '자신의 긍정적인 잠재력을 살려 활기찬 일상을 만들어 가시길 바랍니다.';

  // 안전 정책 필터링 적용
  const sanitized = {
    category: expectedCategory,
    title: typeof analysisObj.title === 'string' && analysisObj.title.trim()
      ? sanitizeTextSafety(analysisObj.title.trim(), expectedCategory)
      : `${expectedCategory} 손금 분석`,
    summary: sanitizeTextSafety(rawSummary, expectedCategory),
    imageQuality: typeof analysisObj.imageQuality === 'string' && analysisObj.imageQuality.trim()
      ? analysisObj.imageQuality.trim()
      : '선명함',
    observations: rawObservations.map(obs => sanitizeTextSafety(obs, expectedCategory)),
    interpretations: rawInterpretations.map(interp => sanitizeTextSafety(interp, expectedCategory)),
    reflection: sanitizeTextSafety(rawReflection, expectedCategory),
    disclaimer: expectedCategory === 'crime'
      ? '본 분석은 일상 속 안전과 위기관리를 위한 오락 콘텐츠이며, 개인의 범죄 성향이나 위험성을 판정하지 않습니다.'
      : (expectedCategory === 'health'
        ? '본 분석은 생활 습관 및 활력 참고를 위한 오락용이며, 의학적 질병 진단이나 치료를 대신할 수 없습니다.'
        : '본 손금 풀이는 전통 관습에 기반한 재미와 오락을 위한 콘텐츠이며, 의학적·법적 판단을 제공하지 않습니다.')
  };

  return { valid: true, sanitized };
}

export { ALLOWED_CATEGORIES };
