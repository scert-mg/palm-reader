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
export function openDB() {
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
export async function saveHandImage(hand, imageData) {
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
export async function getHandImage(hand) {
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
export async function deleteHandImage(hand) {
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
export async function saveAnalysisResult(analysisData) {
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
export async function getAnalysisResult() {
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
export async function clearAllDBData() {
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
