/**
 * lib/aiProvider.js - 통합 AI 프로바이더 및 카테고리별 정밀 손금 프롬프트 관리 (6단계: 안전 정책 및 윤리 가이드라인 강화)
 */

import { CloudflareProvider } from './providers/cloudflare.js';
import { GeminiProvider } from './providers/gemini.js';
import { validateAnalysisStructure } from './validation.js';

// Gemini 키가 있으면 우선 사용, 없으면 Cloudflare 사용
const gemini = new GeminiProvider();
const cloudflare = new CloudflareProvider();

function getActiveProvider() {
  if (process.env.GEMINI_API_KEY) {
    return gemini;
  }
  return cloudflare;
}

// 10개 태그 메타데이터
const CATEGORY_META = {
  overall: {
    name: '종합 분석',
    focus: '생명선, 두뇌선, 감정선, 운명선의 총체적 조화와 손바닥 언덕의 균형'
  },
  love: {
    name: '연애',
    focus: '감정선의 곡률, 시작점과 종점, 상향/하향 지선의 발달 형태'
  },
  fortune: {
    name: '운세',
    focus: '태양구(약지 아래 언덕), 운명선의 선명도와 연속성'
  },
  career: {
    name: '직업',
    focus: '두뇌선의 기울기와 길이, 운명선의 출발 지점 및 방향'
  },
  wealth: {
    name: '재물',
    focus: '재운선(소지 아래 세로선), 두뇌선과 감정선 사이의 삼각문(재물 주머니)'
  },
  personality: {
    name: '성격',
    focus: '손바닥의 형상(방형/원추형), 손가락 마디 비율, 주요 삼대선의 깊이'
  },
  health: {
    name: '건강 (생활 활력)',
    focus: '생명선의 호(곡률)와 금성구(엄지두덩)의 탄력감 및 활력 지수'
  },
  crime: {
    name: '범죄 (안전 및 위기관리)',
    focus: '제1화성구의 두께와 손바닥 중심의 안정성(일상 속 위험 회피 및 위기관리 센스)'
  },
  relations: {
    name: '인간관계',
    focus: '목성구(검지 아래 언덕)의 발달과 손바닥 측면 사교선의 유무'
  },
  marriage: {
    name: '결혼',
    focus: '결혼선(소지와 감정선 사이 가로선)의 위치, 개수, 직선성'
  }
};

/**
 * 카테고리별 특화 프롬프트 빌더 (엄격한 안전 정책 반영)
 */
function buildCategoryPrompt(category, hasLeft, hasRight) {
  const meta = CATEGORY_META[category] || CATEGORY_META.overall;

  let handContext = '';
  if (hasLeft && hasRight) {
    handContext = '제공된 이미지는 2장입니다. 첫 번째는 왼손(선천적 잠재력 및 내면 성향), 두 번째는 오른손(후천적 개척 및 현실 운세)입니다. 양손의 실제 차이점과 공통점을 관찰하여 비교 해석하세요.';
  } else if (hasLeft) {
    handContext = '제공된 이미지는 1장이며, 왼손(선천적 기질과 내면 잠재력)입니다. 사진에 나타난 실제 손금 선을 바탕으로 해석하세요.';
  } else {
    handContext = '제공된 이미지는 1장이며, 오른손(후천적 실현력과 사회적 운세)입니다. 사진에 나타난 실제 손금 선을 바탕으로 해석하세요.';
  }

  // 카테고리별 안전 지침 커스텀
  let specificSafetyGuidelines = '';

  if (category === 'crime') {
    specificSafetyGuidelines = `
[범죄 태그 전용 특별 지침 (절대 준수)]
- 금지: 사용자의 범죄자 될 확률, 폭력성, 반사회성, 위험 인물 분류, 실제 범죄 이력이나 범죄 의도 추정을 '절대' 하지 마십시오.
- 허용: 가상 추리/미스터리 상황에서의 관찰력, 일상 속 보이스피싱이나 사기 위험을 피하는 위기관리 수칙, 분실 예방 등 재미있고 유익한 안전 수칙 오락 콘텐츠로 작성하십시오.
`;
  } else if (category === 'health') {
    specificSafetyGuidelines = `
[건강 태그 전용 특별 지침 (절대 준수)]
- 금지: 질병 진단, 특정 질환 발생 가능성 예측, 손금에 기반한 수명/잔여 수명 판정, 약물 권고나 치료법 제시를 '절대' 하지 마십시오.
- 허용: 충분한 수면, 가벼운 스트레칭, 규칙적인 휴식 등 건강한 생활 습관 형성을 위한 재미와 가벼운 자기 성찰 오락 콘텐츠로 한정하십시오.
`;
  }

  return `당신은 30년 경력의 지혜롭고 온화한 전통 손금 전문가입니다.
사용자가 제출한 손바닥 사진의 가시적인 실제 특징을 직접 관찰하고, [${meta.name}] 카테고리에 맞추어 전통 손금학 이론에 근거한 상세한 풀이를 작성하세요.

[분석 환경]
${handContext}

[관찰 중점 사항: ${meta.name}]
${meta.focus}

[공통 안전 정책 및 엄격한 준수 원칙]
1. 본 손금 분석은 순수하게 오락과 재미를 위한 콘텐츠입니다.
2. 이미지에서 객관적으로 관찰할 수 있는 가시적 특징과 전통적인 상징적 해석을 명확히 구분하십시오.
3. 사진에서 확실히 보이지 않는 선이나 특징을 허위로 만들어 내지 마십시오. 확인되지 않은 부분은 솔직하게 "해당 사진상에서는 선명히 식별되지 않음"으로 기재하십시오.
4. 미래 사건이 반드시 일어날 것처럼 예언하거나, 중요한 인생 결정을 내리는 근거로 단정하지 마십시오. ("~하는 경향이 엿보입니다", "~로 전통 손금학에서 풀이합니다"와 같은 표현 사용)
${specificSafetyGuidelines}
5. 사진 품질 평가: 손바닥이 아니거나 손금이 식별 불가능할 정도로 어둡고 흐리다면 imageQuality를 '재촬영 권장'으로 명시하고 친절한 재촬영 안내를 작성하십시오.
6. 문체: 희망적이고 따뜻하며 신뢰감 있는 자연스러운 한국어 경어체로 작성하십시오.

[출력 형식: 반드시 아래 8개 키를 가진 순수한 JSON 객체만 반환할 것]
코드블록 마크다운(\`\`\`json) 없이 오직 JSON 텍스트만 출력하십시오.

{
  "category": "${category}",
  "title": "${meta.name} 손금 정밀 분석",
  "summary": "${meta.name}의 핵심 운세와 인상을 1~2문장으로 명확히 요약 (단정적 어조 금지)",
  "imageQuality": "양호함 또는 재촬영 권장",
  "observations": [
    "사진에서 실제로 관찰된 손금 특징 1 (예: 생명선이 엄지두덩을 넓게 감싸고 있음)",
    "사진에서 실제로 관찰된 손금 특징 2 (예: 감정선 말단이 검지 부근에서 완만하게 상승)",
    "불확실하거나 흐린 특징에 대한 관찰 (예: 보조 잔주름은 조명으로 인해 구체적 식별이 제한적임)"
  ],
  "interpretations": [
    "관찰된 특징에 기반한 전통 손금 풀이 해석 1 (상징적 의미)",
    "관찰된 특징에 기반한 전통 손금 풀이 해석 2 (생활 속 의미)",
    "앞으로의 삶이나 태도에 긍정적인 도움이 되는 유익한 풀이"
  ],
  "reflection": "사용자가 마음을 다스리거나 긍정적인 방향을 개척하는 데 도움이 되는 따뜻한 조언",
  "disclaimer": "본 손금 풀이는 전통 관습에 기반한 재미와 오락을 위한 콘텐츠이며, 의학적 진단이나 법적 판단을 제공하지 않습니다."
}`;
}

/**
 * 특정 카테고리에 대한 실제 AI 비전 손금 분석 실행
 * @param {{ leftImage: string|null, rightImage: string|null }} images 
 * @param {string} category 
 * @returns {Promise<object>}
 */
export async function analyzeCategory(images, category = 'overall') {
  const hasLeft = Boolean(images.leftImage);
  const hasRight = Boolean(images.rightImage);
  const prompt = buildCategoryPrompt(category, hasLeft, hasRight);

  // 활성 AI 프로바이더 (Gemini 또는 Cloudflare) 호출
  const provider = getActiveProvider();
  const rawText = await provider.runVisionInference(images, prompt);

  // JSON 파싱 및 정제
  let parsed = null;
  try {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    }
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.trim();

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    console.warn('AI 원본 응답 JSON 파싱 실패, 텍스트 변환 시도:', rawText);
    parsed = {
      category,
      title: `${CATEGORY_META[category]?.name || category} 분석`,
      summary: '손금 사진의 가시적인 윤곽을 분석하였습니다.',
      imageQuality: '확인됨',
      observations: ['손바닥의 주요 주선이 관찰되었습니다.'],
      interpretations: [rawText || '손금의 흐름이 대체로 안정적인 균형을 보이고 있습니다.'],
      reflection: '자신의 긍정적인 잠재력을 믿고 성실하게 삶을 가꾸어 나가시길 바랍니다.',
      disclaimer: '본 손금 풀이는 전통 관습에 기반한 오락용 콘텐츠입니다.'
    };
  }

  // 8개 필수 필드 구조 및 안전 정책 후처리 검증
  const { sanitized } = validateAnalysisStructure(parsed, category);

  return {
    categoryData: sanitized,
    timestamp: Date.now()
  };
}

export function checkAIConfig() {
  const provider = getActiveProvider();
  return provider.validateConfig();
}
