/**
 * lib/providers/cloudflare.js - Cloudflare Workers AI 호출 어댑터
 * 
 * 엔드포인트: POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}
 * 모델: @cf/meta/llama-3.2-11b-vision-instruct (기본값)
 */

export class CloudflareProvider {
  constructor() {
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.model = process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.2-11b-vision-instruct';
  }

  /**
   * 환경 변수 구성 유효성 검사
   */
  validateConfig() {
    if (!this.accountId || !this.apiToken) {
      return {
        configured: false,
        error: 'Cloudflare Workers AI 환경 변수(CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)가 서버에 설정되지 않았습니다.'
      };
    }
    return { configured: true };
  }

  /**
   * Cloudflare Workers AI 비전 모델 호출
   * @param {{ leftImage: string|null, rightImage: string|null }} images 
   * @param {string} prompt 
   */
  async runVisionInference(images, prompt) {
    const configCheck = this.validateConfig();
    if (!configCheck.configured) {
      const err = new Error(configCheck.error);
      err.code = 'CONFIG_MISSING';
      throw err;
    }

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;

    // Cloudflare Llama 3.2 Vision OpenAI 호환 다중 모달 메시지 페이로드 구성
    const userContent = [
      {
        type: 'text',
        text: prompt
      }
    ];

    if (images.leftImage) {
      userContent.push({
        type: 'image_url',
        image_url: { url: images.leftImage }
      });
    }

    if (images.rightImage) {
      userContent.push({
        type: 'image_url',
        image_url: { url: images.rightImage }
      });
    }

    const payload = {
      messages: [
        {
          role: 'user',
          content: userContent
        }
      ],
      max_tokens: 2048,
      temperature: 0.3 // 일관된 JSON 및 정밀 분석을 위해 낮은 온도값 적용
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000); // 28초 타임아웃

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // HTTP 상태 코드별 예외 처리 (API 키 등 민감 정보 누출 방지)
      if (response.status === 401 || response.status === 403) {
        const err = new Error('AI 서비스 인증에 실패했습니다. 서버의 API 토큰 설정을 확인하세요.');
        err.code = 'AI_AUTH_FAILED';
        err.status = 502;
        throw err;
      }

      if (response.status === 429) {
        const err = new Error('AI 서비스의 무료 이용 한도 또는 분당 요청 제한을 초과했습니다. 잠시 후 다시 시도해 주세요.');
        err.code = 'RATE_LIMITED';
        err.status = 429;
        throw err;
      }

      if (!response.ok) {
        const err = new Error(`AI 서비스 호출 중 오류가 발생했습니다. (HTTP ${response.status})`);
        err.code = 'AI_SERVICE_ERROR';
        err.status = 502;
        throw err;
      }

      const result = await response.json();

      if (!result.success && result.errors && result.errors.length > 0) {
        const err = new Error('AI 모델 응답 처리에 실패했습니다.');
        err.code = 'AI_RESULT_ERROR';
        err.status = 502;
        throw err;
      }

      // Llama 3.2 Vision 결과 추출
      const responseText = result.result?.response || result.result?.description || '';
      return responseText;

    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const timeoutErr = new Error('AI 응답 생성 시간이 초과되었습니다 (28초). 이미지 크기를 줄이거나 다시 시도해 주세요.');
        timeoutErr.code = 'TIMEOUT';
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    }
  }
}
