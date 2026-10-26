/**
 * lib/providers/gemini.js - Google Gemini API 비전 모델 호출 어댑터
 */

export class GeminiProvider {
  get apiKey() {
    return process.env.GEMINI_API_KEY;
  }

  get model() {
    // 기본 모델을 가장 가볍고 지연/과부하가 없는 gemini-3.1-flash-lite 로 우선 지정
    return process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  }

  // 트래픽 과부하(503) 발생 시 순차적으로 즉시 자동 전환할 안정적 폴백 체인
  get fallbackModels() {
    return ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];
  }

  validateConfig() {
    if (!this.apiKey) {
      return {
        configured: false,
        error: 'Google Gemini API 키(GEMINI_API_KEY)가 서버 환경 변수에 설정되지 않았습니다.'
      };
    }
    return { configured: true };
  }

  /**
   * Gemini Vision API 호출
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

    // Gemini API Contents 페이로드 생성
    const parts = [{ text: prompt }];

    function addImagePart(dataUrl) {
      if (!dataUrl) return;
      const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inline_data: {
            mime_type: match[1],
            data: match[2]
          }
        });
      }
    }

    if (images.leftImage) addImagePart(images.leftImage);
    if (images.rightImage) addImagePart(images.rightImage);

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    };

    // 1차 주 모델 시도 후 503 과부하 발생 시 다른 모델로 연속 자동 전환
    const candidateModels = Array.from(new Set([this.model, ...this.fallbackModels]));
    let lastError = null;

    for (const m of candidateModels) {
      try {
        return await this.executeRequest(m, payload);
      } catch (err) {
        lastError = err;
        // 503 (High Demand / Spikes in demand) 또는 429 시 다음 모델로 즉시 폴백
        if (err.status === 503 || err.status === 429) {
          console.warn(`[Gemini] ${m} 일시적 과부하 (${err.status}), 다음 가용 모델로 자동 전환 시도...`);
          continue;
        }
        // 그 외 인증 오류나 치명적 오류는 바로 throw
        throw err;
      }
    }

    throw lastError;
  }

  async executeRequest(modelName, payload) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 400 || response.status === 403) {
        const err = new Error('Google Gemini API 키 인증에 실패했습니다. API 키를 확인해 주세요.');
        err.code = 'AI_AUTH_FAILED';
        err.status = 502;
        throw err;
      }

      if (response.status === 429) {
        const err = new Error('Gemini API의 무료 이용 한도 또는 분당 요청 제한(15 RPM)을 초과했습니다. 잠시 후 다시 시도해 주세요.');
        err.code = 'RATE_LIMITED';
        err.status = 429;
        throw err;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const err = new Error(errData.error?.message || `Gemini API 호출 오류 (HTTP ${response.status})`);
        err.code = 'AI_SERVICE_ERROR';
        err.status = response.status;
        throw err;
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text;

    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const timeoutErr = new Error('AI 분석 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.');
        timeoutErr.code = 'TIMEOUT';
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    }
  }
}
