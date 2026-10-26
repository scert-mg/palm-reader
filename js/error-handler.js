/**
 * error-handler.js - 사용자 친화적인 에러 분석 및 한국어 안내 메시지 변환기
 */

export function parseAppError(error) {
  if (!error) {
    return {
      title: '알 수 없는 오류',
      message: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
    };
  }

  // 1. 네트워크 단절
  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isBrowserOffline || error.message?.includes('Failed to fetch') || error.name === 'NetworkError') {
    return {
      title: '네트워크 연결 오류',
      message: '인터넷 연결이 불안정합니다. 네트워크 상태를 확인한 후 다시 시도해 주세요.'
    };
  }

  // 2. 서버 에러 코드 기반 매핑
  const code = error.code;
  switch (code) {
    case 'RATE_LIMITED':
      return {
        title: '이용 한도 초과 안내',
        message: 'AI 서비스의 일일 무료 이용량 또는 분당 요청 한도를 초과했습니다. 유료 자동 결제는 진행되지 않으니 안심하시고 잠시 후 다시 시도해 주세요.'
      };
    case 'CONFIG_MISSING':
      return {
        title: '서버 설정 확인 필요',
        message: '서버에 AI API 설정이 완료되지 않았습니다. 관리자에게 문의하거나 환경 변수를 확인해 주세요.'
      };
    case 'AI_AUTH_FAILED':
      return {
        title: '인증 실패',
        message: 'AI 서비스 토큰 인증에 실패했습니다. 올바른 계정 정보가 설정되어 있는지 확인해 주세요.'
      };
    case 'TIMEOUT':
      return {
        title: '응답 시간 초과',
        message: 'AI 비전 모델 분석 시간이 초과되었습니다 (28초). 사진 용량을 줄이거나 잠시 후 다시 시도해 주세요.'
      };
    case 'INVALID_REQUEST':
      return {
        title: '잘못된 요청',
        message: error.message || '사진 데이터가 올바르지 않습니다. 다른 손 사진을 선택해 주세요.'
      };
    case 'QUOTA_EXCEEDED_ERR':
      return {
        title: '브라우저 저장 공간 부족',
        message: '브라우저 내부 저장 용량이 부족합니다. 우측 상단 [초기화]를 눌러 이전 데이터를 정리해 주세요.'
      };
    default:
      return {
        title: '손금 분석 처리 오류',
        message: error.message || '손금 사진을 분석하는 도중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
      };
  }
}
