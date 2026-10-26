/**
 * app.js - 손금 분석 웹 애플리케이션 메인 컨트롤러 (5단계: 실제 AI 비전 분석 연결 및 카테고리 캐싱)
 */

import {
  openDB,
  saveHandImage,
  getHandImage,
  deleteHandImage,
  saveAnalysisResult,
  getAnalysisResult,
  clearAllDBData
} from './js/db.js';

import {
  checkSchemaVersion,
  saveSelectedTag,
  getSelectedTag,
  clearAllLocalStorage
} from './js/storage.js';

import {
  loadImageFromFile,
  processImageForAI
} from './js/image-processor.js';

import { parseAppError } from './js/error-handler.js';

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
