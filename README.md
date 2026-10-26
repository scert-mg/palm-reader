# 손금 분석 웹 애플리케이션 (Palm Reading AI Web App)

인공지능 비전 모델(Cloudflare Workers AI `@cf/meta/llama-3.2-11b-vision-instruct`)을 활용하여 사용자의 왼손과 오른손 손바닥 사진을 시각적으로 관찰하고, 전통 손금학 기반의 정밀하고 건전한 해석을 제공하는 풀스택 웹 애플리케이션입니다.

---

## 1. 프로젝트 소개
- **선천운과 후천운의 조화**: 왼손(선천적 잠재력 및 내면 성향)과 오른손(후천적 현실 개척운)을 개별 또는 양손 종합으로 분석합니다.
- **철저한 프라이버시 보호**: 사용자의 손 사진과 분석 결과는 중앙 서버나 데이터베이스에 영구 보관되지 않고 사용자의 **브라우저 로컬 저장소(IndexedDB)**에만 안전하게 영속 보관됩니다.
- **완전한 API 키 보안 격리**: 브라우저에 AI API 키나 비밀 토큰이 노출되지 않으며, 모든 AI 모델 호출은 **Vercel Serverless Functions 백엔드**를 통해서만 안전하게 수행됩니다.
- **엄격한 윤리 및 안전 정책 준수**: 본 프로그램은 오락 및 자기 성찰용 콘텐츠로서, 손금으로 질병을 진단하거나 범죄 성향을 판정하지 않으며, 단정적 예언을 배제합니다.

---

## 2. 주요 기능
1. **양손 사진 업로드 및 드래그 앤 드롭**: JPEG, PNG, WebP 지원, 실시간 미리보기, 교체 및 삭제 기능.
2. **단독 손 및 양손 종합 분석 지원**: 한 손만 업로드해도 분석 가능하며, 양손 업로드 시 조화로운 종합 풀이 제공.
3. **브라우저 내 Canvas 최적화 전처리**: 최대 1280px 리사이징 및 고품질 JPEG(0.85) 압축으로 Vercel 요청 바디 4.5MB 제한 대비 최적화.
4. **10개 카테고리 태그별 정밀 분석**:
   - `종합 분석`, `연애`, `운세`, `직업`, `재물`, `성격`, `건강`, `범죄`, `인간관계`, `결혼`
5. **8개 필수 구조화 응답**:
   - `category`, `title`, `summary`, `imageQuality`, `observations`, `interpretations`, `reflection`, `disclaimer`
6. **지능형 브라우저 캐싱 & 비용 절감**: 이미 한 번 분석된 카테고리는 IndexedDB에 저장되어 탭 전환 시 중복 API 호출 없이 즉시 표시.
7. **새로고침 및 재방문 시 완벽한 복원**: 업로드한 사진, 분석 결과, 마지막 선택 태그가 그대로 유지.
8. **전체 데이터 초기화**: 상단 [초기화] 버튼을 통해 브라우저 내 모든 이미지 및 분석 기록 완전 삭제.
9. **반응형 인터페이스**: 모바일 세로 1열 레이아웃 최적화 및 데스크톱 2열 나란한 배치 지원.
10. **서버 측 보안 및 속도 제한**: IP당 분당 10회 제한(Rate Limiting), 비허용 메서드 차단, 입력 크기 검증.

---

## 3. 기술 스택
- **프런트엔드**: HTML5 (시맨틱 웹), CSS3 (반응형 Flexbox/Grid, Pretendard 웹폰트), Vanilla JavaScript (ES Modules)
- **브라우저 영속성**: IndexedDB (`PalmReadingDB` - 이미지 및 분석 결과), localStorage (설정 및 선택 태그)
- **백엔드**: Node.js 기반 Vercel Serverless Functions (`api/analyze.js`)
- **AI 비전 모델**: Cloudflare Workers AI `@cf/meta/llama-3.2-11b-vision-instruct`
- **배포 플랫폼**: GitHub + Vercel

---

## 4. 로컬 개발 환경 준비

### 필수 요구사항
- **Node.js**: v18.0.0 이상 권장
- **npm**: v8.0.0 이상

### 5. 의존성 설치
프로젝트 루트 디렉터리에서 다음 명령어를 실행합니다:
```bash
npm install
```

---

## 6. `.env.local` 작성 방법

로컬 개발 환경에서 AI 분석 백엔드를 동작시키려면 프로젝트 루트에 `.env.local` 파일을 생성해야 합니다.

`.env.example` 파일을 복사하여 생성할 수 있습니다:
```bash
cp .env.example .env.local
```

`.env.local` 파일 내용:
```env
# Cloudflare Workers AI 계정 정보
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id_here
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here

# 사용할 비전 모델 (기본값)
CLOUDFLARE_MODEL=@cf/meta/llama-3.2-11b-vision-instruct
```

---

## 7. `.env.local` 보안 주의사항
- `.env.local` 파일에는 실제 발급받은 비밀 키가 포함되므로 **절대로 GitHub 등 공개 저장소에 커밋하거나 공유하지 마십시오.**
- `.gitignore` 파일에 `.env*` 패턴이 포함되어 있어 Git 추적에서 자동 제외됩니다. 커밋 전 `git status`를 통해 포함 여부를 반드시 확인하십시오.

---

## 8. Cloudflare Workers AI API 설정 및 키 발급 방법
1. [Cloudflare 대시보드](https://dash.cloudflare.com/)에 로그인합니다.
2. 좌측 메뉴에서 **Workers & Pages** -> **Overview**로 이동하여 우측 상단의 **Account ID**를 복사합니다. (`CLOUDFLARE_ACCOUNT_ID`)
3. 우측 상단 프로필 아이콘 클릭 -> **My Profile** -> **API Tokens**로 이동합니다.
4. **Create Token** 버튼 클릭 후 **Workers AI Read and Write** 권한(또는 AI run 실행 권한)을 가진 토큰을 생성하고 토큰 값을 복사합니다. (`CLOUDFLARE_API_TOKEN`)

---

## 9. 모델 라이선스 동의 절차
- Meta의 Llama 3.2 모델 제품군은 최초 사용 시 라이선스 동의가 필요할 수 있습니다.
- Cloudflare 대시보드의 **Workers AI** 섹션에서 `@cf/meta/llama-3.2-11b-vision-instruct` 모델 카드를 열고 약관 동의를 완료하거나, 개발자용 1회성 초기화 호출(`{"prompt": "agree"}`)을 통해 활성화할 수 있습니다.

---

## 10. 로컬 실행 명령

### (1) 단위 및 통합 테스트 실행
```bash
npm test
```

### (2) Vercel CLI 로컬 개발 서버 실행 (추천: 프런트엔드 + 백엔드 API 동시 구동)
Vercel Functions(`/api/analyze`)를 로컬에서 테스트하려면 Vercel CLI 사용을 권장합니다:
```bash
npx vercel dev
```
브라우저에서 `http://localhost:3000`으로 접속합니다.

### (3) 정적 프런트엔드 UI만 실행 (API 미연동 화면 테스트)
```bash
npm start
# 또는 npx serve .
```

---

## 11. HTML 실행 관련 중요 안내
- `index.html` 파일을 로컬 탐색기에서 더블클릭(`file:///...`)하여 실행할 경우, 브라우저 보안 정책(CORS 및 ES Module 규격)으로 인해 자바스크립트 모듈 로딩 및 백엔드 API 통신이 차단됩니다.
- 전체 기능을 온전히 테스트하려면 반드시 **Node.js 로컬 서버(`npx vercel dev` 또는 `npx serve .`)**를 통해 실행해야 합니다.
- 실제 AI 손금 분석은 백엔드 환경 변수(`.env.local` 또는 Vercel 환경 변수)가 구성되어 있어야만 동작합니다.

---

## 12. GitHub 업로드 방법

프로젝트 루트 디렉터리에서 Git 저장소를 초기화하고 원격 저장소로 푸시합니다:

```bash
# 1. Git 저장소 초기화
git init

# 2. 파일 추가 (.gitignore가 .env.local을 자동 제외함)
git add .

# 3. 비밀 파일 제외 여부 최종 점검
git status

# 4. 첫 커밋 작성
git commit -m "feat: 손금 분석 웹 애플리케이션 초기 구축 (1~8단계 완료)"

# 5. GitHub 원격 저장소 연결 및 푸시
git branch -M main
git remote add origin https://github.com/사용자이름/저장소명.git
git push -u origin main
```

---

## 13. Vercel 프로젝트 생성 및 배포 방법

1. [Vercel 대시보드](https://vercel.com/)에 로그인하고 **Add New...** -> **Project**를 클릭합니다.
2. 위에서 푸시한 **GitHub 저장소**를 찾아 **Import**를 누릅니다.
3. **Framework Preset**은 `Other`로 설정합니다. (루트 디렉터리 기본값 유지)
4. **Environment Variables** 설정 섹션에 아래 2개의 환경 변수를 등록합니다:
   - `CLOUDFLARE_ACCOUNT_ID`: 발급받은 Cloudflare 계정 ID
   - `CLOUDFLARE_API_TOKEN`: 발급받은 Cloudflare API 토큰
   - *(선택)* `CLOUDFLARE_MODEL`: `@cf/meta/llama-3.2-11b-vision-instruct`
5. **Deploy** 버튼을 클릭하여 배포를 완료합니다.

> **💡 환경 변수 변경 시 유의사항**:
> Vercel 대시보드 `Settings` -> `Environment Variables`에서 키 값을 수정하거나 추가한 경우, 기존 배포에 즉시 반영되지 않으므로 **Deployments** 탭에서 **Redeploy**를 실행해야 적용됩니다.

---

## 14. 무료 사용량 및 과금 방지 유의사항
- Cloudflare Workers AI는 무료 플랜 계정당 매일 기본 무료 뉴런(약 10,000 Neurons)을 제공합니다.
- 하루 무료 할당량을 초과하면 백엔드에서 `429 RATE_LIMITED` 오류를 감지하여 사용자에게 안내하며, **유료 결제로 자동 전환되지 않습니다.**
- 또한 자체 백엔드에 **IP당 1분 10회 요청 제한(Rate Limiting)**이 적용되어 있어 비정상적인 대량 트래픽 및 악용을 방지합니다.

---

## 15. 개인정보 및 데이터 저장 안내
- **일시적 전송**: 손 사진은 암호화된 HTTPS 연결을 통해 Cloudflare Workers AI로 전송되어 분석 텍스트를 생성한 뒤 즉시 파기됩니다.
- **브라우저 보관**: 사진과 분석 결과는 사용자의 기기(IndexedDB)에만 저장되므로 다른 기기와 동기화되지 않으며, 브라우저 캐시를 삭제하면 사라집니다.
- **언제든 초기화 가능**: 우측 상단 [초기화] 버튼으로 저장된 모든 데이터를 즉시 영구 삭제할 수 있습니다.

---

## 16. 오류 해결 가이드 (Troubleshooting)

| 발생 오류 | 원인 | 해결 방법 |
| :--- | :--- | :--- |
| **503 CONFIG_MISSING** | 서버에 Cloudflare 환경 변수 미설정 | `.env.local` 또는 Vercel 대시보드에 `CLOUDFLARE_ACCOUNT_ID`와 `CLOUDFLARE_API_TOKEN` 등록 후 재시작/재배포 |
| **429 RATE_LIMITED** | 분당 요청 제한(10회) 또는 Cloudflare 무료 할당량 소진 | 약 1분 후 다시 시도하거나 다음 날 무료 할당량 리셋 후 이용 |
| **502 AI_AUTH_FAILED** | API 토큰 권한 부족 또는 오타 | Cloudflare 대시보드에서 Workers AI 권한을 가진 토큰을 재발급하여 교체 |
| **504 TIMEOUT** | AI 응답 시간 초과 (28초) | 사진 해상도가 과도하게 높거나 일시적 네트워크 지연. 재시도 시 브라우저가 자동 압축 전송함 |
| **재촬영 권장 알림** | 사진이 너무 어둡거나 손금이 흐릿함 | 밝은 조명 아래에서 손바닥을 평평하게 펴고 손금이 선명하게 보이도록 재촬영 |
