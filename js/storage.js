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
export function checkSchemaVersion() {
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
export function saveSelectedTag(tagKey) {
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
export function getSelectedTag(defaultTag = 'overall') {
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
export function saveUISettings(settings) {
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
export function getUISettings() {
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
export function clearAllLocalStorage() {
  try {
    localStorage.removeItem(STORAGE_KEYS.SELECTED_TAG);
    localStorage.removeItem(STORAGE_KEYS.UI_SETTINGS);
    localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, CURRENT_SCHEMA_VERSION);
  } catch (err) {
    console.warn('localStorage 초기화 실패:', err);
  }
}
