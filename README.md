# Veylcore

> **2D 탑다운 온라인 PvP 아레나 슈터 (Top-down Online PvP Arena Shooter)**

Veylcore는 데스크톱 웹 브라우저 기반의 실시간 2D 멀티플레이어 탑다운 아레나 슈터 게임입니다. 게임 엔진(Unity, Phaser 등)에 의존하지 않고 **순수 HTML5 Canvas 2D + TypeScript**와 고정 타임스텝 물리 엔진을 기반으로 설계되었습니다.

현재 프로젝트는 `IMPLEMENTATION_PLAN.md`의 **P2(서버 권한 단일 방 온라인 멀티플레이어)** 단계까지 구현되어 있습니다. Cloudflare Workers + Durable Objects 기반 서버와 브라우저 클라이언트 간 WebSocket 통신을 통해 실시간 서버 판정 게임을 플레이할 수 있습니다.

---

## 1. 아키텍처 및 모듈 구조

npm workspaces 기반의 모노레포 구조로 설계되어 있습니다:

- **`shared/`**: 클라이언트와 서버가 함께 사용하는 순수 TypeScript 모듈 (DOM/Workers API 미의존)
  - `constants.ts`: 30Hz 틱레이트, 15Hz 스냅샷, 1280x720 고정 시야, 32u 타일, 플레이어 반지름 14u 등
  - `map/`: 64×40 (2048u×1280u) 타일맵 데이터, DDA 광선 질의, 충돌 박스 질의
  - `weapons/`: 무기 수치 데이터 (권총, K2, AK-47, AWP, RPG, 화염방사기, 수류탄 등)
  - `sim/`: 30Hz 고정 시뮬레이션 (이동 벡터 정규화, 축 분리 벽 미끄러짐, 고속 투사체 스윕 판정)
  - `protocol/`: 네트워크 패킷 타입 및 버튼 비트마스크 명세
- **`client/`**: Vite + Canvas 2D 기반 게임 클라이언트
  - `render/`: 1280×720 고정 월드 시야를 모니터 비율에 맞춰 유지하는 카메라, 바닥 사전 렌더링, 프로시저럴 스프라이트 렌더러
  - `input/`: 키보드/마우스 이벤트 샘플링 및 `InputCmd` 생성
  - `ui/`: 메인 메뉴, ESC 일시정지 모달, 게임 HUD (HP 바, 무기 슬롯, 탄약 카운터, 재장전 인디케이터)
  - `net/`: 추후 Cloudflare Workers + Durable Objects WebSocket 클라이언트로 교체 가능한 `NetworkClient` 인터페이스 및 로컬 연결 모듈
  - `game/`: 30Hz 고정 누적기 루프 + rAF 렌더 루프 및 로컬 가짜 서버
- **`server/`**: Cloudflare Worker + Durable Objects 서버 (P2 이후 단계)
- **`tools/`**: 헤드리스 클라이언트 및 부하 테스트 도구 (P6/P10 단계)

---

## 2. 게임 조작법

| 입력 | 동작 |
|---|---|
| **W, A, S, D** | 8방향 캐릭터 이동 (대각선 정규화 적용) |
| **마우스 이동** | 조준 (캐릭터가 커서를 조준, 전술 크로스헤어) |
| **마우스 좌클릭** | 사격 (K2 자동 연사 / 권총 반자동) |
| **마우스 우클릭** | 줌 조작 |
| **R** | 재장전 (진행 상황 프로그레스 표시) |
| **1 / 2 / 마우스 휠** | 주무기(K2) &harr; 보조무기(권총) 전환 |
| **Esc** | 일시 정지 메뉴 / 메인 메뉴 복귀 |

---

## 3. 로컬 개발 및 실행 방법

### 사전 요구 사항
- **Node.js**: v18.0.0 이상 (LTS 권장, 예: v20.x)
- **npm**: v9.0.0 이상

### 1) 의존성 설치
```bash
npm install
```

### 2) 단위 테스트 실행
물리 시뮬레이션(대각선 정규화, 맵 경계 제약, 벽 모서리 미끄러짐, 고속 투사체 스윕 터널링 방지)을 검증합니다:
```bash
npm test
```

### 3) 로컬 개발 서버 실행
- **오프라인 클라이언트 개발 서버 (Vite)**:
  ```bash
  npm run dev
  ```
  브라우저에서 `http://localhost:3000`으로 접속하여 **"오프라인 연습 시작 (P1 모드)"**을 플레이할 수 있습니다.

- **온라인 서버 + 클라이언트 전체 로컬 실행 (Wrangler Dev)**:
  ```bash
  npm run build
  npx wrangler dev
  ```
  브라우저에서 `http://localhost:8787`로 접속하여 2개 이상의 탭 또는 브라우저 창에서 **"온라인 대전 참가 (P2 서버 권한)"**를 클릭하면 서버 판정 기반 2인 이상 실시간 멀티플레이를 테스트할 수 있습니다.

### 4) 타입 검사, 빌드 및 배포
```bash
# TypeScript 타입 검사 (shared, client, server)
npm run typecheck

# 프로덕션 빌드 (shared 빌드 후 client 번들링)
npm run build

# Cloudflare Workers 라이브 배포
npm run deploy
```

---

## 4. 설계 문서
- [GAME_DESIGN.md](GAME_DESIGN.md): 게임 규칙, 조작, 맵 규격, 무기 수치 명세
- [ARCHITECTURE.md](ARCHITECTURE.md): 시스템 아키텍처, 넷코드(예측/보간), 클라우드플레어 DO 비용 구조
- [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md): 클라이언트-서버 간 메시지 봉투 및 프로토콜 명세
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): 마일스톤별(P0 ~ P10) 상세 구현 로드맵
