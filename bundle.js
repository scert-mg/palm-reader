
/* --- js/db.js --- */
/**
 * db.js - IndexedDB 영속 저장소 래퍼 모듈
 * 
 * 저장 대상:
 * - 왼손/오른손 원본 및 전처리(압축) 이미지
 * - AI 분석 결과 (전체 및 카테고리별 데이터)
 * - 메타데이터 (생성 일시, 작업 ID, 손 구분 등)
 */

const DB_NAME = 'PalmReadingDB';
const DB_VERSION = 1;
const STORE_IMAGES = 'images';
const STORE_ANALYSIS = 'analysis';

let dbInstance = null;

/**
 * IndexedDB 연결 초기화 및 인스턴스 획득
 */
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      return reject(new Error('IndexedDB를 지원하지 않는 브라우저입니다.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. 이미지 저장소 (키: 'left', 'right')
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'hand' });
      }

      // 2. 분석 결과 저장소 (키: 'current_analysis')
      if (!db.objectStoreNames.contains(STORE_ANALYSIS)) {
        db.createObjectStore(STORE_ANALYSIS, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB 열기 실패:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * 손 사진 데이터 저장 (왼손 또는 오른손)
 * @param {string} hand 'left' | 'right'
 * @param {object} imageData { original, processed, width, height, format, size, updatedAt }
 */
async function saveHandImage(hand, imageData) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, 'readwrite');
      const store = tx.objectStore(STORE_IMAGES);
      const record = {
        hand,
        ...imageData,
        updatedAt: Date.now()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`손 사진 저장 실패 (${hand}):`, err);
    throw err;
  }
}

/**
 * 특정 손 사진 데이터 조회
 * @param {string} hand 'left' | 'right'
 */
async function getHandImage(hand) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, 'readonly');
      const store = tx.objectStore(STORE_IMAGES);
      const req = store.get(hand);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`손 사진 조회 실패 (${hand}):`, err);
    return null;
  }
}

/**
 * 특정 손 사진 삭제
 * @param {string} hand 'left' | 'right'
 */
async function deleteHandImage(hand) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, 'readwrite');
      const store = tx.objectStore(STORE_IMAGES);
      const req = store.delete(hand);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`손 사진 삭제 실패 (${hand}):`, err);
    throw err;
  }
}

/**
 * 분석 결과 저장
 * @param {object} analysisData { rawResult, categories, createdAt, analyzedHands, id: 'current_analysis' }
 */
async function saveAnalysisResult(analysisData) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ANALYSIS, 'readwrite');
      const store = tx.objectStore(STORE_ANALYSIS);
      const record = {
        id: 'current_analysis',
        ...analysisData,
        updatedAt: Date.now()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('분석 결과 저장 실패:', err);
    throw err;
  }
}

/**
 * 현재 분석 결과 조회
 */
async function getAnalysisResult() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ANALYSIS, 'readonly');
      const store = tx.objectStore(STORE_ANALYSIS);
      const req = store.get('current_analysis');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('분석 결과 조회 실패:', err);
    return null;
  }
}

/**
 * IndexedDB의 모든 데이터(이미지 및 분석 결과) 완전 삭제
 */
async function clearAllDBData() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_IMAGES, STORE_ANALYSIS], 'readwrite');
      tx.objectStore(STORE_IMAGES).clear();
      tx.objectStore(STORE_ANALYSIS).clear();

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('IndexedDB 초기화 실패:', err);
    throw err;
  }
}

/* --- js/storage.js --- */
/**
 * storage.js - localStorage 경량 설정 및 상태 관리 모듈
 * 
 * 저장 대상:
 * - 마지막 선택된 카테고리 태그
 * - UI 환경설정 (테마, 안내 배너 닫힘 여부 등)
 * - 스키마 버전 (버전 마이그레이션 및 무결성 관리)
 * 
 * ※ 주의: API Key, Access Token 및 민감 정보는 절대 localStorage에 저장하지 않음.
 */

const STORAGE_KEYS = {
  SCHEMA_VERSION: 'palm_schema_ver',
  SELECTED_TAG: 'palm_selected_tag',
  UI_SETTINGS: 'palm_ui_settings'
};

const CURRENT_SCHEMA_VERSION = '1.0.0';

/**
 * 스키마 버전 확인 및 초기화
 */
function checkSchemaVersion() {
  try {
    const version = localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION);
    if (!version) {
      localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, CURRENT_SCHEMA_VERSION);
    }
  } catch (err) {
    console.warn('localStorage 접근 불가(시크릿 모드 또는 권한 제한):', err);
  }
}

/**
 * 선택된 태그 저장
 * @param {string} tagKey 
 */
function saveSelectedTag(tagKey) {
  try {
    localStorage.setItem(STORAGE_KEYS.SELECTED_TAG, String(tagKey));
  } catch (err) {
    console.warn('선택 태그 localStorage 저장 실패:', err);
  }
}

/**
 * 선택된 태그 불러오기
 * @param {string} defaultTag 
 * @returns {string}
 */
function getSelectedTag(defaultTag = 'overall') {
  try {
    return localStorage.getItem(STORAGE_KEYS.SELECTED_TAG) || defaultTag;
  } catch (err) {
    console.warn('선택 태그 localStorage 읽기 실패:', err);
    return defaultTag;
  }
}

/**
 * 일반 UI 설정 저장
 * @param {object} settings 
 */
function saveUISettings(settings) {
  try {
    const current = getUISettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEYS.UI_SETTINGS, JSON.stringify(updated));
  } catch (err) {
    console.warn('UI 설정 저장 실패:', err);
  }
}

/**
 * 일반 UI 설정 불러오기
 * @returns {object}
 */
function getUISettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.UI_SETTINGS);
    return raw ? JSON.parse(raw) : { bannerDismissed: false };
  } catch (err) {
    console.warn('UI 설정 읽기 실패:', err);
    return { bannerDismissed: false };
  }
}

/**
 * 앱 관련 모든 localStorage 항목 삭제
 */
function clearAllLocalStorage() {
  try {
    localStorage.removeItem(STORAGE_KEYS.SELECTED_TAG);
    localStorage.removeItem(STORAGE_KEYS.UI_SETTINGS);
    localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, CURRENT_SCHEMA_VERSION);
  } catch (err) {
    console.warn('localStorage 초기화 실패:', err);
  }
}

/* --- js/image-processor.js --- */
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

const IMAGE_CONFIG = {
  MAX_UPLOAD_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MIN_DIMENSION: 200,                      // 너무 작아 손금을 식별할 수 없는 해상도 하한
  TARGET_MAX_DIMENSION: 1280,             // 리사이즈 최대 변 길이
  JPEG_QUALITY: 0.85                       // 압축 품질
};

/**
 * 파일 유효성 기본 검사
 * @param {File} file 
 */
function validateFile(file) {
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
function loadImageFromFile(file) {
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
function processImageForAI(img) {
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

/* --- js/error-handler.js --- */
/**
 * error-handler.js - 사용자 친화적인 에러 분석 및 한국어 안내 메시지 변환기
 */

function parseAppError(error) {
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

/* --- app.js --- */
/**
 * app.js - 손금 분석 웹 애플리케이션 메인 컨트롤러 (5단계: 실제 AI 비전 분석 연결 및 카테고리 캐싱)
 */









// 10개 카테고리 메타데이터 정의
const CATEGORY_MAP = {
  overall: { title: '종합 분석', icon: '🔮', sub: '생명선, 두뇌선, 감정선, 운명선의 총체적 균형과 조화', scope: '양손 종합' },
  love: { title: '연애', icon: '💖', sub: '감정선의 곡률과 지선으로 보는 애정 표현 방식과 연애 성향', scope: '감정선 중심' },
  fortune: { title: '운세', icon: '✨', sub: '태양구와 손바닥 탄력감으로 엿보는 전체적인 운의 흐름과 기회', scope: '손바닥 전반' },
  career: { title: '직업', icon: '💼', sub: '두뇌선과 운명선의 각도로 살펴보는 적성 및 사회적 활동력', scope: '두뇌선 · 운명선' },
  wealth: { title: '재물', icon: '💰', sub: '재운선과 삼각문(재물 주머니) 형성을 통해 보는 금전 관리 흐름', scope: '새끼손가락 아래 · 손바닥 중앙' },
  personality: { title: '성격', icon: '🧠', sub: '손바닥의 형상과 주요 3대선으로 파악하는 내면적 기질', scope: '손바닥 전체' },
  health: { title: '건강', icon: '🌿', sub: '생명선의 호와 금성구 탄력감으로 보는 활력 및 컨디션 조언', scope: '생명선 · 금성구' },
  crime: { title: '범죄', icon: '🛡️', sub: '제1화성구와 감정선 말단을 통해 보는 감정 제어력 및 충동 조절력', scope: '감정 제어선' },
  relations: { title: '인간관계', icon: '🤝', sub: '목성구와 손바닥 측면 지선이 보여주는 대인 친화력과 소통 매너', scope: '목성구 · 손바닥 측면' },
  marriage: { title: '결혼', icon: '💍', sub: '새끼손가락 바로 아래 결혼선의 위치와 선명도로 살펴보는 가정운', scope: '결혼선 영역' }
};

// 애플리케이션 상태 (In-Memory)
const state = {
  images: {
    left: null,   // { original, processed, width, height, approxSizeBytes }
    right: null
  },
  analysisResult: null, // { categories: { [key]: categoryData }, updatedAt }
  selectedTag: 'overall',
  isAnalyzing: false
};

let dom = {};

document.addEventListener('DOMContentLoaded', async () => {
  initDOMReferences();
  checkSchemaVersion();
  setupEventListeners();

  // 브라우저 저장소 데이터 복원
  await restoreAppState();
});

function initDOMReferences() {
  dom = {
    // 왼손 카드
    inputLeft: document.getElementById('input-left'),
    dropLeft: document.getElementById('drop-left'),
    promptLeft: document.getElementById('prompt-left'),
    btnSelectLeft: document.getElementById('btn-select-left'),
    previewWrapLeft: document.getElementById('preview-wrap-left'),
    imgPreviewLeft: document.getElementById('img-preview-left'),
    btnReplaceLeft: document.getElementById('btn-replace-left'),
    btnDeleteLeft: document.getElementById('btn-delete-left'),
    statusLeft: document.getElementById('status-left'),

    // 오른손 카드
    inputRight: document.getElementById('input-right'),
    dropRight: document.getElementById('drop-right'),
    promptRight: document.getElementById('prompt-right'),
    btnSelectRight: document.getElementById('btn-select-right'),
    previewWrapRight: document.getElementById('preview-wrap-right'),
    imgPreviewRight: document.getElementById('img-preview-right'),
    btnReplaceRight: document.getElementById('btn-replace-right'),
    btnDeleteRight: document.getElementById('btn-delete-right'),
    statusRight: document.getElementById('status-right'),

    // 액션 바
    btnAnalyze: document.getElementById('btn-analyze'),
    btnAnalyzeText: document.getElementById('btn-analyze-text'),
    actionCaption: document.getElementById('action-caption'),
    aiStatusBadge: document.getElementById('ai-status-badge'),
    aiStatusText: document.getElementById('ai-status-text'),
    tagsContainer: document.getElementById('tags-container'),

    // 결과 뷰
    resIcon: document.getElementById('res-icon'),
    resTitle: document.getElementById('res-title'),
    resSub: document.getElementById('res-sub'),
    resHandScope: document.getElementById('res-hand-scope'),
    resSummary: document.getElementById('res-summary'),
    resDetails: document.getElementById('res-details'),

    // 헤더 및 모달
    btnPrivacy: document.getElementById('btn-privacy'),
    btnReset: document.getElementById('btn-reset'),
    modalPrivacy: document.getElementById('modal-privacy'),
    btnClosePrivacy: document.getElementById('btn-close-privacy'),
    btnConfirmPrivacy: document.getElementById('btn-confirm-privacy')
  };
}

/**
 * 새로고침 시 IndexedDB 및 localStorage 복원
 */
async function restoreAppState() {
  try {
    await openDB();
    const [leftRecord, rightRecord, analysisRecord] = await Promise.all([
      getHandImage('left'),
      getHandImage('right'),
      getAnalysisResult()
    ]);

    if (leftRecord) {
      state.images.left = leftRecord;
      updateHandCardUI('left', leftRecord.processed || leftRecord.original, leftRecord.approxSizeBytes);
    }
    if (rightRecord) {
      state.images.right = rightRecord;
      updateHandCardUI('right', rightRecord.processed || rightRecord.original, rightRecord.approxSizeBytes);
    }

    if (analysisRecord && analysisRecord.categories) {
      state.analysisResult = analysisRecord;
      const timeStr = new Date(analysisRecord.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      dom.aiStatusText.textContent = `분석 완료 (${timeStr})`;
    }

    const savedTag = getSelectedTag('overall');
    selectTag(savedTag, false);
    updateAnalyzeButtonState();

  } catch (err) {
    console.error('앱 상태 복원 중 오류 발생:', err);
    updateAnalyzeButtonState();
    selectTag('overall', false);
  }
}

/**
 * 파일 선택 및 전처리
 */
async function handleFileSelection(file, hand) {
  if (!file) return;

  try {
    const { img, originalDataUrl, warning } = await loadImageFromFile(file);
    if (warning) {
      alert(`⚠️ 안내: ${warning}`);
    }

    const { processedDataUrl, processedWidth, processedHeight, approxSizeBytes } = processImageForAI(img);

    const imageRecord = {
      original: originalDataUrl,
      processed: processedDataUrl,
      width: processedWidth,
      height: processedHeight,
      approxSizeBytes,
      fileType: file.type,
      fileName: file.name
    };

    state.images[hand] = imageRecord;
    updateHandCardUI(hand, processedDataUrl, approxSizeBytes);
    updateAnalyzeButtonState();

    // 새 사진이 업로드되면 기존 분석 결과 무효화 및 카테고리 캐시 정리
    if (state.analysisResult) {
      state.analysisResult = null;
      dom.aiStatusText.textContent = '사진 변경됨 (재분석 필요)';
      dom.btnAnalyzeText.textContent = '손금 분석 시작';
      // IndexedDB의 기존 분석 결과도 정리
      await saveAnalysisResult({ id: 'current_analysis', categories: {}, updatedAt: Date.now() });
      selectTag(state.selectedTag, false);
    }

    await saveHandImage(hand, imageRecord);

  } catch (err) {
    console.error(`이미지 처리 실패 (${hand}):`, err);
    alert(`이미지를 불러올 수 없습니다: ${err.message}`);
  }
}

/**
 * 카드 UI 갱신
 */
function updateHandCardUI(hand, dataUrl, approxBytes) {
  const isLeft = hand === 'left';
  const promptEl = isLeft ? dom.promptLeft : dom.promptRight;
  const previewWrap = isLeft ? dom.previewWrapLeft : dom.previewWrapRight;
  const imgEl = isLeft ? dom.imgPreviewLeft : dom.imgPreviewRight;
  const statusEl = isLeft ? dom.statusLeft : dom.statusRight;

  if (dataUrl) {
    imgEl.src = dataUrl;
    promptEl.classList.add('hidden');
    previewWrap.classList.remove('hidden');

    const sizeKb = approxBytes ? ` (${Math.round(approxBytes / 1024)}KB)` : '';
    statusEl.textContent = `사진 등록 완료${sizeKb}`;
    statusEl.classList.add('registered');
  } else {
    imgEl.src = '';
    previewWrap.classList.add('hidden');
    promptEl.classList.remove('hidden');
    statusEl.textContent = '사진 미등록';
    statusEl.classList.remove('registered');
  }
}

/**
 * 이미지 삭제
 */
async function removeHandImage(hand) {
  try {
    state.images[hand] = null;
    const input = hand === 'left' ? dom.inputLeft : dom.inputRight;
    input.value = '';

    updateHandCardUI(hand, null);
    updateAnalyzeButtonState();

    // 한 손이라도 삭제되면 기존 분석 결과 무효화 처리
    if (state.analysisResult) {
      state.analysisResult = null;
      dom.aiStatusText.textContent = '사진 변경됨 (재분석 필요)';
      dom.btnAnalyzeText.textContent = '손금 분석 시작';
      await saveAnalysisResult({ id: 'current_analysis', categories: {}, updatedAt: Date.now() });
      selectTag(state.selectedTag, false);
    }

    await deleteHandImage(hand);
  } catch (err) {
    console.error(`손 이미지 삭제 실패 (${hand}):`, err);
  }
}

/**
 * 분석 버튼 활성화 및 설명 텍스트 갱신
 */
function updateAnalyzeButtonState() {
  const hasLeft = Boolean(state.images.left);
  const hasRight = Boolean(state.images.right);
  const hasAny = hasLeft || hasRight;

  dom.btnAnalyze.disabled = !hasAny || state.isAnalyzing;

  if (hasAny) {
    if (hasLeft && hasRight) {
      dom.actionCaption.textContent = '양손 사진이 모두 등록되었습니다. 양손 종합 손금 분석을 시작할 수 있습니다.';
    } else if (hasLeft) {
      dom.actionCaption.textContent = '왼손 사진이 등록되었습니다. (선천적 잠재력 중심 분석)';
    } else {
      dom.actionCaption.textContent = '오른손 사진이 등록되었습니다. (후천적 개척운 중심 분석)';
    }
  } else {
    dom.actionCaption.textContent = '왼손과 오른손 중 최소 1장의 사진을 등록해 주세요.';
  }
}

/**
 * 백엔드 /api/analyze 호출 (단일 카테고리 분석)
 */
async function fetchCategoryAnalysis(category) {
  const leftImage = state.images.left ? (state.images.left.processed || state.images.left.original) : null;
  const rightImage = state.images.right ? (state.images.right.processed || state.images.right.original) : null;

  if (!leftImage && !rightImage) {
    throw new Error('분석할 손 사진이 등록되지 않았습니다.');
  }

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      images: {
        left: leftImage,
        right: rightImage
      },
      requestedCategory: category
    })
  });

  const resJson = await response.json();

  if (!response.ok || !resJson.success) {
    const errorMsg = resJson.error || 'AI 분석 서버 통신 중 오류가 발생했습니다.';
    const error = new Error(errorMsg);
    error.code = resJson.code;
    throw error;
  }

  return resJson.data; // 8개 필드를 포함한 정제 객체
}

/**
 * 태그 클릭 또는 전환 시 처리 (캐싱 검사 및 필요시 AI 호출)
 */
async function selectTag(tagKey, triggerAIIfNeeded = true) {
  if (!CATEGORY_MAP[tagKey]) return;
  state.selectedTag = tagKey;
  saveSelectedTag(tagKey);

  // 칩 활성화 상태 갱신
  const chips = dom.tagsContainer.querySelectorAll('.tag-chip');
  chips.forEach(chip => {
    const isSelected = chip.getAttribute('data-tag') === tagKey;
    chip.classList.toggle('active', isSelected);
    chip.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  });

  const meta = CATEGORY_MAP[tagKey];
  dom.resIcon.textContent = meta.icon;
  dom.resTitle.textContent = meta.title;
  dom.resSub.textContent = meta.sub;
  dom.resHandScope.textContent = meta.scope;

  // 1. 이미 IndexedDB / 메모리에 저장된 분석 결과가 존재하는지 확인 (캐시 재사용)
  if (state.analysisResult && state.analysisResult.categories && state.analysisResult.categories[tagKey]) {
    renderCategoryResult(state.analysisResult.categories[tagKey]);
    return;
  }

  // 2. 이미지가 있는 상태에서 새 태그를 눌렀을 때의 처리
  const hasImage = Boolean(state.images.left || state.images.right);

  if (hasImage && triggerAIIfNeeded && !state.isAnalyzing) {
    // 사진이 등록되어 있으면 해당 태그 분석을 즉시 실행
    await requestSpecificCategory(tagKey);
  } else {
    // 사진이 아직 등록되지 않은 경우 안내 화면 표시
    dom.resSummary.textContent = `사진을 등록한 후 [손금 분석 시작] 버튼이나 [${meta.title}] 태그를 누르면 AI가 특화된 정밀 손금 풀이를 생성합니다.`;
    dom.resDetails.innerHTML = `
      <div class="empty-state-notice">
        <p><strong>[${meta.title}]</strong> 카테고리의 분석 대기 중입니다.</p>
        <p class="sub-notice">손 사진을 먼저 업로드해 주세요.</p>
      </div>
    `;
  }
}

/**
 * 특정 카테고리에 대한 실제 AI 비전 분석 요청
 */
async function requestSpecificCategory(category) {
  state.isAnalyzing = true;
  updateAnalyzeButtonState();

  const meta = CATEGORY_MAP[category] || CATEGORY_MAP.overall;
  dom.aiStatusText.textContent = `${meta.title} AI 분석 중...`;
  dom.resSummary.textContent = `인공지능이 손바닥 사진의 ${meta.focus} 특징을 정밀 관찰하는 중입니다...`;
  dom.resDetails.innerHTML = `
    <div class="empty-state-notice">
      <div class="spinner" style="display:inline-block; width:20px; height:20px; border:3px solid #cbd5e1; border-top-color:var(--primary); border-radius:50%; animation:spin 1s linear infinite; margin-bottom:8px;"></div>
      <p>실제 손금의 형태와 선의 흐름을 분석하고 있습니다. 잠시만 기다려 주세요.</p>
    </div>
  `;

  try {
    const categoryData = await fetchCategoryAnalysis(category);

    // 상태 저장 및 IndexedDB 동기화
    if (!state.analysisResult) {
      state.analysisResult = {
        id: 'current_analysis',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        categories: {}
      };
    }

    state.analysisResult.categories[category] = categoryData;
    state.analysisResult.updatedAt = Date.now();
    await saveAnalysisResult(state.analysisResult);

    dom.aiStatusText.textContent = `분석 완료 (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    renderCategoryResult(categoryData);

  } catch (err) {
    console.error(`카테고리 분석 실패 (${category}):`, err);
    const parsedErr = parseAppError(err);

    dom.aiStatusText.textContent = '분석 오류 발생';
    dom.resSummary.textContent = parsedErr.title;
    dom.resDetails.innerHTML = `
      <div class="empty-state-notice" style="border-color:#fca5a5; background-color:#fef2f2; text-align:left; padding:1.25rem;">
        <p style="color:#b91c1c; font-weight:700; margin-bottom:0.35rem; display:flex; align-items:center; gap:6px;">
          <span>⚠️</span> ${parsedErr.title}
        </p>
        <p style="color:#991b1b; font-size:0.875rem; line-height:1.5;">${parsedErr.message}</p>
        <div style="margin-top:0.75rem; padding-top:0.75rem; border-top:1px dashed #fecaca; font-size:0.8125rem; color:#b91c1c;">
          💡 기존에 업로드하신 손 사진과 다른 카테고리의 저장 결과는 안전하게 보존되어 있습니다.
        </div>
      </div>
    `;
    alert(`[${parsedErr.title}]\n${parsedErr.message}`);
  } finally {
    state.isAnalyzing = false;
    updateAnalyzeButtonState();
  }
}

/**
 * 8개 구조화 필드를 화면에 미려하게 렌더링
 */
function renderCategoryResult(data) {
  if (!data) return;

  dom.resTitle.textContent = data.title || '손금 분석';
  dom.resSummary.textContent = data.summary || '';

  // 품질 경고 배지
  let qualityBadgeHtml = '';
  if (data.imageQuality && data.imageQuality.includes('재촬영')) {
    qualityBadgeHtml = `
      <div style="background-color:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px 14px; margin-bottom:14px; color:#92400e; font-size:0.875rem;">
        ⚠️ <strong>촬영 품질 안내:</strong> ${data.imageQuality}. 더 정확한 분석을 위해 밝은 곳에서 손바닥을 활짝 펴고 재촬영을 권장합니다.
      </div>
    `;
  }

  // 가시적 특징 관찰 목록
  const obsHtml = Array.isArray(data.observations) && data.observations.length > 0
    ? `
      <div style="margin-bottom: 1.25rem;">
        <h5 style="font-size:0.9rem; font-weight:700; color:var(--text-main); margin-bottom:0.5rem; display:flex; align-items:center; gap:6px;">
          <span>🔍</span> 사진에서 관찰된 가시적 특징
        </h5>
        <ul style="padding-left:1.25rem; font-size:0.875rem; line-height:1.6; color:#334155;">
          ${data.observations.map(obs => `<li style="margin-bottom:4px;">${obs}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  // 전통 손금 해석 목록
  const interpHtml = Array.isArray(data.interpretations) && data.interpretations.length > 0
    ? `
      <div style="margin-bottom: 1.25rem;">
        <h5 style="font-size:0.9rem; font-weight:700; color:var(--text-main); margin-bottom:0.5rem; display:flex; align-items:center; gap:6px;">
          <span>📜</span> 전통 손금학적 해석 및 풀이
        </h5>
        <ul style="padding-left:1.25rem; font-size:0.875rem; line-height:1.6; color:#334155;">
          ${data.interpretations.map(interp => `<li style="margin-bottom:4px;">${interp}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  // 성찰 및 조언 박스
  const reflectionHtml = data.reflection
    ? `
      <div style="background-color:var(--primary-light); border:1px solid var(--primary-border); border-radius:8px; padding:12px 14px; margin-top:1rem;">
        <strong style="color:var(--primary); font-size:0.875rem; display:block; margin-bottom:3px;">💌 손금이 전하는 따뜻한 조언</strong>
        <p style="color:#0f766e; font-size:0.875rem; line-height:1.55; margin:0;">${data.reflection}</p>
      </div>
    `
    : '';

  dom.resDetails.innerHTML = `
    ${qualityBadgeHtml}
    ${obsHtml}
    ${interpHtml}
    ${reflectionHtml}
  `;
}

/**
 * [손금 분석 시작] 메인 버튼 클릭: 최초 종합 분석(overall) 실행
 */
async function handleMainAnalyzeClick() {
  if (state.isAnalyzing) return;
  if (!state.images.left && !state.images.right) {
    alert('손 사진을 최소 1장 이상 등록해 주세요.');
    return;
  }

  // 중복 클릭 방지
  dom.btnAnalyze.disabled = true;
  dom.btnAnalyzeText.textContent = 'AI 손금 정밀 분석 중...';

  // 1. 종합 분석(overall) 탭 활성화 및 AI 호출
  await selectTag('overall', false);
  await requestSpecificCategory('overall');

  dom.btnAnalyzeText.textContent = '손금 분석 다시하기';

  // 결과 화면으로 부드럽게 스크롤 이동
  const resultSection = document.getElementById('result-section');
  if (resultSection) {
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * 전체 초기화 핸들러
 */
async function handleResetAll() {
  const confirmed = confirm('저장된 모든 손 사진, AI 분석 결과 및 설정을 완전히 삭제하시겠습니까?');
  if (!confirmed) return;

  try {
    await clearAllDBData();
    clearAllLocalStorage();

    state.images.left = null;
    state.images.right = null;
    state.analysisResult = null;
    state.selectedTag = 'overall';

    dom.inputLeft.value = '';
    dom.inputRight.value = '';
    updateHandCardUI('left', null);
    updateHandCardUI('right', null);
    updateAnalyzeButtonState();

    dom.aiStatusText.textContent = '대기 중';
    dom.btnAnalyzeText.textContent = '손금 분석 시작';
    selectTag('overall', false);

    alert('모든 데이터가 성공적으로 초기화되었습니다.');
  } catch (err) {
    console.error('초기화 중 오류 발생:', err);
    alert('초기화 도중 오류가 발생했습니다.');
  }
}

/**
 * 드래그 앤 드롭 및 클릭 선택 설정
 */
function setupDragAndDrop(dropZone, fileInput, hand) {
  // 드래그 오버 / 진입 시 시각 피드백
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'dragend'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  // 파일 드롭 처리
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');

    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFileSelection(dt.files[0], hand);
    }
  });

  // 키보드 접근성 (스페이스/엔터)
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
}

/**
 * 이벤트 리스너 등록
 */
function setupEventListeners() {
  // 왼손
  dom.inputLeft.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0], 'left');
    }
  });
  dom.btnReplaceLeft?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dom.inputLeft.value = ''; // 동일 파일 재선택 허용
    dom.inputLeft.click();
  });
  dom.btnDeleteLeft?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeHandImage('left');
  });
  setupDragAndDrop(dom.dropLeft, dom.inputLeft, 'left');

  // 오른손
  dom.inputRight.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0], 'right');
    }
  });
  dom.btnReplaceRight?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dom.inputRight.value = ''; // 동일 파일 재선택 허용
    dom.inputRight.click();
  });
  dom.btnDeleteRight?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeHandImage('right');
  });
  setupDragAndDrop(dom.dropRight, dom.inputRight, 'right');

  // 태그 선택 위임
  dom.tagsContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.tag-chip');
    if (chip) {
      const tagKey = chip.getAttribute('data-tag');
      selectTag(tagKey, true);
    }
  });

  // 분석 시작 메인 버튼
  dom.btnAnalyze.addEventListener('click', handleMainAnalyzeClick);

  // 모달
  dom.btnPrivacy.addEventListener('click', () => {
    dom.modalPrivacy.classList.remove('hidden');
  });
  dom.btnClosePrivacy.addEventListener('click', () => {
    dom.modalPrivacy.classList.add('hidden');
  });
  dom.btnConfirmPrivacy.addEventListener('click', () => {
    dom.modalPrivacy.classList.add('hidden');
  });
  dom.modalPrivacy.addEventListener('click', (e) => {
    if (e.target === dom.modalPrivacy) {
      dom.modalPrivacy.classList.add('hidden');
    }
  });

  // 초기화
  dom.btnReset.addEventListener('click', handleResetAll);
}
