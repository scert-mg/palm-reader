/**
 * image-processor.js - 브라우저 캔버스 기반 이미지 검증 및 전처리 모듈
 * 
 * 기능:
 * 1. 파일 규격 및 크기 검증 (최대 10MB)
 * 2. 손상된 이미지 감지 (Image 디코딩 테스트)
 * 3. 저품질/과소 해상도 이미지 감지 (재촬영 가이드 안내)
 * 4. AI 전송 및 Vercel Serverless 요청 제한(4.5MB) 대비 최적화 리사이징 및 압축:
 *    - 최대 가로/세로 1280px 유지
 *    - JPEG Quality 0.85로 압축 (손금 선의 선명도는 유지하되 용량은 300KB~700KB 수준으로 최적화)
 */

export const IMAGE_CONFIG = {
  MAX_UPLOAD_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MIN_DIMENSION: 200,                      // 너무 작아 손금을 식별할 수 없는 해상도 하한
  TARGET_MAX_DIMENSION: 1280,             // 리사이즈 최대 변 길이
  JPEG_QUALITY: 0.85                       // 압축 품질
};

/**
 * 파일 유효성 기본 검사
 * @param {File} file 
 */
export function validateFile(file) {
  if (!file) {
    throw new Error('선택된 파일이 없습니다.');
  }

  // 확장자 또는 MIME 타입 검사 (대소문자 무관 및 파일 확장자 폴백)
  const mimeType = (file.type || '').toLowerCase();
  const fileName = (file.name || '').toLowerCase();
  const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const hasValidExt = validExtensions.some(ext => fileName.endsWith(ext));
  const validMimes = ['image/jpeg', 'image/png', 'image/webp'];

  if (!validMimes.includes(mimeType) && !hasValidExt) {
    throw new Error('지원되지 않는 이미지 형식입니다. JPEG, PNG, WebP 파일을 업로드해 주세요.');
  }

  if (file.size > IMAGE_CONFIG.MAX_UPLOAD_SIZE_BYTES) {
    throw new Error('이미지 파일 크기가 10MB를 초과합니다. 더 작은 크기의 이미지를 선택해 주세요.');
  }

  return true;
}

/**
 * File 객체를 읽어 Image 엘리먼트로 로드하고 손상 여부 및 품질 판별
 * @param {File} file 
 * @returns {Promise<{ img: HTMLImageElement, originalDataUrl: string, warning?: string }>}
 */
export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    validateFile(file);

    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('파일을 읽는 도중 오류가 발생했습니다. 파일이 손상되었을 수 있습니다.'));
    };

    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();

      img.onerror = () => {
        reject(new Error('이미지 데이터를 디코딩할 수 없습니다. 파일이 손상되었거나 유효한 이미지 포맷이 아닙니다.'));
      };

      img.onload = () => {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        let warning = null;
        if (width < IMAGE_CONFIG.MIN_DIMENSION || height < IMAGE_CONFIG.MIN_DIMENSION) {
          warning = '이미지 해상도가 너무 낮습니다. 손금이 선명하게 보이도록 더 가까이서 밝게 재촬영해 주시기 바랍니다.';
        }

        resolve({
          img,
          originalDataUrl: dataUrl,
          width,
          height,
          warning
        });
      };

      img.src = dataUrl;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * 브라우저 Canvas를 이용한 리사이징 및 압축 처리
 * @param {HTMLImageElement} img 
 * @returns {{ processedDataUrl: string, processedWidth: number, processedHeight: number, approxSizeBytes: number }}
 */
export function processImageForAI(img) {
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  // 비율 유지하며 최대 변 크기를 TARGET_MAX_DIMENSION으로 축소
  if (width > IMAGE_CONFIG.TARGET_MAX_DIMENSION || height > IMAGE_CONFIG.TARGET_MAX_DIMENSION) {
    if (width > height) {
      height = Math.round((height * IMAGE_CONFIG.TARGET_MAX_DIMENSION) / width);
      width = IMAGE_CONFIG.TARGET_MAX_DIMENSION;
    } else {
      width = Math.round((width * IMAGE_CONFIG.TARGET_MAX_DIMENSION) / height);
      height = IMAGE_CONFIG.TARGET_MAX_DIMENSION;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D 컨텍스트를 생성할 수 없습니다.');
  }

  // 선명한 리사이징을 위한 고품질 보간 설정
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 흰색 배경 채우기 (투명 PNG 처리 대비)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  ctx.drawImage(img, 0, 0, width, height);

  const processedDataUrl = canvas.toDataURL('image/jpeg', IMAGE_CONFIG.JPEG_QUALITY);
  
  // Base64 대략적인 바이트 크기 계산
  const base64Length = processedDataUrl.length - (processedDataUrl.indexOf(',') + 1);
  const approxSizeBytes = Math.round((base64Length * 3) / 4);

  return {
    processedDataUrl,
    processedWidth: width,
    processedHeight: height,
    approxSizeBytes
  };
}
