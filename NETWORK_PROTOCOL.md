# Veylcore — NETWORK_PROTOCOL

> 상태: **초안 v0.1 — 승인 대기** · 프로토콜 버전 `1`
> 관련 문서: [GAME_DESIGN.md](GAME_DESIGN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
>
> 아래 타입 표기는 형식을 설명하기 위한 명세다. 실제 정의는 `shared/protocol/` 에 한 벌만 두고 클라·서버가 같이 쓴다.

---

## 1. 기본 규칙

| 항목 | 규칙 |
|---|---|
| 전송 | HTTPS(REST) + WSS(게임). WebSocket 텍스트 프레임 1개 = 메시지 1개 |
| 형식 | JSON. 봉투 `{ "t": 타입, "d": 데이터 }`. 대기실 heartbeat만 예외(문자열 `"hb"`) |
| 버전 | `hello` 에만 `proto` 포함. 다르면 `err BAD_VERSION` 후 연결 종료 |
| 좌표 | 월드 유닛(u), 정수로 반올림 |
| 각도 | 라디안, 소수 둘째 자리 반올림. 0 = +x 방향, 시계 방향 증가(캔버스 좌표계) |
| 시간 | 서버 틱 번호(30Hz, 매치 시작 = 0). 대기실 타이머만 epoch ms |
| ID | `playerId`: 방 안에서 유일한 짧은 문자열(예: `"p7"`), 재접속해도 유지. `eid`: 매치 안의 엔티티 번호(정수). 플레이어 캐릭터도 `eid` 를 가지며 `roster` 로 연결 |
| 크기 제한 | 클라→서버 메시지 **최대 1KB**. 초과 시 파싱 없이 폐기 |
| 빈도 제한 | 클라→서버 초당 60개 초과분 폐기. 3초 연속 초과 시 `4008` 으로 종료 |

---

## 2. HTTP API

### `POST /api/rooms` — 방 만들기
```
요청  { name: string(1~24), public: boolean }
응답  201 { code: "K7Q2MX" }
오류  429 RATE_LIMITED
```
방 설정은 대기실에서 WebSocket으로 바꾼다. 만든 사람은 이후 첫 번째로 `hello` 를 보내면 방장이 된다.

### `GET /api/rooms` — 공개 방 목록
```
응답  200 { rooms: RoomSummary[] }   (최대 3초 캐시)

RoomSummary {
  code: string, name: string,
  humans: number, bots: number, max: number,
  mode: "ffa", weaponMode: "pickup" | "loadout" | "gungame",
  phase: "lobby" | "countdown" | "playing" | "results",
  midJoin: boolean
}
```

### `GET /api/rooms/:code` — 방 확인
```
응답  200 RoomSummary  |  404 ROOM_NOT_FOUND
```

### `GET /ws/:code` — WebSocket 연결
`Upgrade: websocket` 필수, `Origin` 허용 목록 검사. 연결 후 **5초 안에 `hello`** 를 보내지 않으면 `4003` 으로 종료.

---

## 3. 연결 수명

```
클라                                서버(RoomDO)
 │── WS 연결 ───────────────────────▶│
 │── hello{name, token?} ───────────▶│  토큰 일치 → 기존 플레이어 복귀
 │◀────────────── welcome{you,token} │  토큰 없음/불일치 → 새 플레이어
 │◀────────────── room{...}          │
 │        … 대기실 …                  │  "hb" ⇄ "hb" (20초마다, DO 깨우지 않음)
 │◀────────────── start{roster,...}  │
 │── in{c:[cmd]} (30Hz) ────────────▶│
 │◀────────────── snap{...} (15Hz)   │
 │◀────────────── ping{n} (1Hz)      │
 │── pong{n} ───────────────────────▶│
 │◀────────────── end{rows,...}      │
 │◀────────────── room{phase:lobby}  │
```

---

## 4. 클라이언트 → 서버

| `t` | 데이터 | 허용 단계 | 권한 |
|---|---|---|---|
| `hello` | `{ proto: 1, name: string, token?: string }` | 연결 직후 1회 | 모두 |
| `settings` | `{ patch: Partial<RoomSettings> }` | lobby | 방장 |
| `kick` | `{ pid: string }` | lobby, playing | 방장 |
| `start` | `{}` | lobby | 방장 |
| `loadout` | `{ pri: WeaponId, eq: EquipId }` | lobby, playing(사망 중) | 로드아웃 방식일 때 |
| `in` | `{ c: InputCmd[] }` (1~2개) | playing | 슬롯이 있는 사람 |
| `pong` | `{ n: number }` | playing | 모두 |
| `leave` | `{}` | 모두 | 모두 |
| `"hb"` | 문자열 그대로 (JSON 아님) | 모두 | 모두 |

### 4.1 InputCmd
```
InputCmd {
  s:  number   // seq. 1부터 증가하는 정수. 재접속 시 welcome의 lastSeq 다음부터
  mx: number   // 이동 x  -1 ~ 1
  my: number   // 이동 y  -1 ~ 1   (서버가 벡터 길이를 1 이하로 고정)
  a:  number   // 조준각(라디안)
  d:  number   // 조준 거리(u) 0 ~ 2000  (투척 거리 계산용. 서버가 무기 최대 사거리로 다시 제한)
  b:  number   // 버튼 비트
  w:  0 | 1    // 들고 있을 무기: 0 = 주무기, 1 = 보조무기(권총)
}
```

| 비트 | 이름 | 의미 |
|---|---|---|
| 1 | `FIRE` | 누르고 있음 (자동 무기는 유지 시 연사) |
| 2 | `ZOOM` | 누르고 있음 (AWP) |
| 4 | `RELOAD` | 이번 틱에 눌림 (엣지) |
| 8 | `EQUIP` | 이번 틱에 눌림 (엣지) — 투척 / 설치 / C4 기폭 |
| 16 | `PICKUP` | 이번 틱에 눌림 (엣지) |

- 엣지 비트(4·8·16)는 서버가 넘치는 입력을 버릴 때 **다음 입력에 OR로 합쳐서** 잃어버리지 않게 한다.
- 비용 절약 모드(ARCHITECTURE §9.3)에서는 2틱 분량을 묶어 `c` 에 2개를 넣어 15Hz로 보낸다.

### 4.2 RoomSettings
| 필드 | 타입 | 범위 / 값 | 기본 |
|---|---|---|---|
| `name` | string | 1~24자 | — |
| `public` | boolean | | true |
| `max` | number | 2~8, 현재 사람 수 이상 | 8 |
| `mode` | string | `"ffa"` | `"ffa"` |
| `weaponMode` | string | `"pickup"` · `"loadout"` · `"gungame"` | `"pickup"` |
| `fillBots` | boolean | | true |
| `botCount` | number | 0 ~ max−사람 수 (`fillBots=false` 일 때만 의미) | 0 |
| `botLevel` | string | `"easy"` · `"normal"` · `"hard"` | `"normal"` |
| `replace` | string | `"immediate"` · `"onDeath"` · `"nextMatch"` | `"onDeath"` |
| `midJoin` | boolean | | true |
| `timeLimit` | number | 180~600 (초) | 300 |
| `killTarget` | number | 10~50 | 20 |
| `map` | string | 맵 ID 목록 중 하나 | 첫 맵 |

잘못된 값이 하나라도 있으면 패치 전체를 거부하고 `err INVALID_SETTINGS` (어떤 필드인지 포함).

---

## 5. 서버 → 클라이언트

| `t` | 시점 | 받는 사람 |
|---|---|---|
| `welcome` | hello 직후 | 본인 |
| `room` | 대기실 상태가 바뀔 때마다 (전체 상태) | 방 전체 |
| `start` | 카운트다운 종료, Playing 진입 | 방 전체 (+ 중간 참가자에게 개별) |
| `snap` | Playing 중 15Hz | 개인별 (시야 필터링) |
| `roster` | 매치 중 참가자 변경 (봇 교체, 입장, 퇴장) | 방 전체 |
| `score` | 점수 변경 시 (최대 초당 2회) | 방 전체 |
| `end` | 매치 종료 | 방 전체 |
| `ping` | Playing 중 1초마다 | 개인 |
| `notice` | 안내성 사건 | 해당자 또는 전체 |
| `err` | 요청 거부 | 요청자 |
| `"hb"` | 클라의 `"hb"` 에 자동 응답 | 본인 |

### 5.1 welcome
```
{
  proto: 1,
  you: string,          // 내 playerId
  token: string,        // 재접속 토큰 (재접속 시 같은 값 유지)
  lastSeq: number,      // 서버가 받은 내 마지막 입력 seq (새 플레이어는 0)
  tickRate: 30, snapRate: 15
}
```

### 5.2 room — RoomState (대기실 전체 상태)
```
{
  code: string, name: string, public: boolean,
  phase: "lobby" | "countdown" | "playing" | "results",
  phaseEndsAt?: number,             // countdown/results 끝나는 시각 (epoch ms)
  host: string,                     // playerId
  settings: RoomSettings,
  slots: [{ i: number,
            kind: "human" | "bot" | "takeover" | "empty",
            pid?: string, name?: string, level?: string }],
  queue: [{ pid: string, name: string, reason: "onDeath" | "nextMatch" | "midJoinOff" }]
}
```

### 5.3 start
```
{
  matchId: string,
  map: string, mapHash: string,      // 클라가 가진 맵 데이터와 해시가 다르면 새로고침 안내
  tick: number,                      // 현재 서버 틱 (중간 참가자는 0이 아님)
  endTick: number,                   // 시간 제한 종료 틱
  rules: { weaponMode, killTarget, gunGameOrder?: WeaponId[] },
  roster: Roster[],
  you: number | null                 // 내 eid (관전 대기 중이면 null)
}

Roster { pid: string, eid: number, name: string, bot: boolean, away: boolean }
```

### 5.4 snap — 스냅샷
```
{
  k: number,              // 서버 틱
  ack: number,            // 처리 완료한 내 마지막 입력 seq
  you?: You,              // 내 캐릭터 (관전 중이면 없음, 대신 view 필드로 따라가는 대상 eid)
  view?: number,
  e: Entity[],            // 내 시야 안의 엔티티 전부 (없으면 클라에서 제거)
  ev: Event[]             // 직전 스냅샷 이후 발생한 이벤트, 틱 순서
}
```

**You — 예측과 HUD에 필요한 내 상태 전부**
```
{
  eid: number, x: number, y: number,
  hp: number,
  st: "alive" | "dead",
  respawnAt?: number,                    // 리스폰 틱
  protUntil?: number,                    // 스폰 보호 끝나는 틱
  w: 0 | 1,                              // 들고 있는 슬롯
  pri: { id: WeaponId, mag: number, res: number } | null,   // 화염방사기는 mag = 연료
  sec: { id: "pistol", mag: number },
  eq:  { id: EquipId, n: number } | null,
  reloadUntil?: number, nextFireAt?: number,
  speedMul: number,                      // 무기·줌·상태이상 반영 최종 이동 배율 (예측에 필수)
  zoom: boolean,
  burn?: number, poison?: boolean,       // 상태이상 (끝나는 틱 / 가스 안 여부)
  rtt: number,                           // 서버가 측정한 내 RTT (ms)
  gg?: number                            // 건게임 현재 단계
}
```

**Entity — 위치 기반 배열 (JSON이지만 바이너리 전환을 쉽게 하기 위해 고정 순서)**

| 종류 코드 | 형식 | 설명 |
|---|---|---|
| 1 플레이어 | `[eid, 1, x, y, aim, hp, weaponId, flags]` | 다른 플레이어 (내 캐릭터는 `you`) |
| 2 바닥 아이템 | `[eid, 2, x, y, itemId]` | 무기, 장비, 구급상자, 드롭 무기 |
| 3 투척물 | `[eid, 3, x, y, itemId]` | 날아가는 수류탄·독가스 |
| 4 설치물 | `[eid, 4, x, y, itemId, ownerEid, fuseEndTick?]` | C4, 지뢰, 시한폭탄 (시한폭탄만 fuseEndTick) |
| 5 구역 | `[eid, 5, x, y, radius, zoneId]` | 독가스 구름 |

플레이어 `flags` 비트:

| 비트 | 의미 |
|---|---|
| 1 | 사망 |
| 2 | 스폰 보호 중 |
| 4 | 화염 분사 중 (클라가 화염 파티클 그림) |
| 8 | AWP 줌 |
| 16 | 재장전 중 |
| 32 | 화상 |
| 64 | 중독 |
| 128 | 봇이 임시 조종 중 |

**Event — 객체 형식 (빈도가 낮음)**

| `k` | 필드 | 의미 |
|---|---|---|
| `shot` | `prj, o, s, w, x, y, a, v, r, tk` | 투사체 생성. `o`=쏜 사람 eid, `s`=그 사람의 입력 seq(임시 투사체 교체용), `v`=속도, `r`=남은 사거리, `tk`=(앞당김 반영 후) 기준 틱. 클라는 직선으로 직접 계산 |
| `pend` | `prj, x, y, why` | 투사체 소멸. `why`: `"wall"` · `"hit"` · `"range"` |
| `hit` | `v, a, dmg, w` | 피해. `v`=맞은 사람, `a`=공격자, `w`=원인 (히트마커·피격 방향 표시용) |
| `boom` | `x, y, r, w` | 폭발 연출 |
| `kill` | `killer, victim, w` | 킬 피드. 시야와 무관하게 **전원**에게 |
| `spawn` | `e, x, y` | 리스폰 |
| `pick` | `e, item` | 아이템 획득 |
| `snd` | `x, y, s` | 화면 밖 소리. 위치는 ±100u 뭉갬. `s`: `"gun"` · `"boom"` |
| `deny` | `s, why` | 내 입력 seq `s` 의 행동이 거부됨 (예: `"cooldown"`, `"noAmmo"`) — 내 임시 투사체 즉시 제거용 |

### 5.5 roster / score / end
```
roster  { roster: Roster[] }
score   { rows: [eid, kills, deaths, score, ggStep?][], timeLeft: number }
end     { reason: "time" | "kills" | "gungame" | "aborted",
          rows: [{ pid, name, bot, kills, deaths, score }],   // 순위순
          winners: string[],                                  // 공동 1위 가능
          lobbyAt: number }                                   // 대기실 복귀 시각(epoch ms)
```

### 5.6 ping / notice / err
```
ping    { n: number }     → 클라는 즉시 pong { n } 으로 답함
notice  { code: string, p?: object }
err     { code: string, msg?: string, field?: string }
```

**notice 코드**: `HOST_CHANGED{pid}` · `BOT_REPLACED{slot, pid}` · `WAITING_FOR_SLOT{reason}` · `TAKEOVER_STARTED{pid}` · `TAKEOVER_ENDED{pid}` · `MOVED_TO_SPECTATOR{reason:"afk"}` · `MATCH_ABORTED`

---

## 6. 오류와 종료 코드

### 6.1 err 코드
| 코드 | 의미 | 연결 유지? |
|---|---|---|
| `BAD_VERSION` | 프로토콜 버전 불일치 | 종료 (4003) |
| `BAD_MESSAGE` | 형식 오류·알 수 없는 타입. 10초 안에 5회 누적 시 종료 | 유지 → 종료 |
| `ROOM_NOT_FOUND` | 방 없음 | 종료 (4004) |
| `ROOM_FULL` | 사람 수 = 최대 인원 + 관전 대기 4명도 가득 | 종료 (4004) |
| `NAME_INVALID` | 닉네임 규칙 위반 | 종료 (4003) |
| `NOT_HOST` | 방장 전용 요청 | 유지 |
| `INVALID_SETTINGS` | 설정 값 오류 (`field` 포함) | 유지 |
| `WRONG_PHASE` | 지금 단계에서 불가능한 요청 | 유지 |
| `BANNED` | 이 방에서 강퇴됨 | 종료 (4001) |
| `RATE_LIMITED` | 빈도 초과 | 유지 → 종료 (4008) |

### 6.2 WebSocket 종료 코드
| 코드 | 의미 | 클라 동작 |
|---|---|---|
| 1000 | 정상 퇴장 | 메인으로 |
| 4001 | 강퇴됨 | 메인으로 + 안내 |
| 4002 | 같은 토큰의 새 연결로 대체됨 (다른 탭에서 접속) | 재접속하지 않음 |
| 4003 | 프로토콜 오류 | 재접속하지 않음, 새로고침 안내 |
| 4004 | 방 없음 / 가득 참 / 방 종료 | 메인으로 |
| 4005 | 자리 비움으로 퇴장 | 메인으로 |
| 4008 | 빈도 제한 초과 | 재접속하지 않음 |
| 그 외 (1006 등) | 비정상 끊김 | **자동 재접속** |

---

## 7. 주요 시나리오

### 7.1 재접속
```
(연결 끊김) 서버: 슬롯 → takeover, notice TAKEOVER_STARTED 전원 전송
클라: 0.5s → 1s → 2s → 4s … 간격으로 재시도 (60초까지)
클라 ── hello{name, token} ──▶ 서버: 토큰 해시 일치 + 유예 중 확인
                                     예전 소켓이 남아 있으면 4002로 닫음
클라 ◀── welcome{lastSeq} ── 서버
클라 ◀── room / start / snap ── 서버: takeover → human, TAKEOVER_ENDED
클라: seq를 lastSeq+1부터 재개, pending 입력 폐기
```
유예가 지난 뒤 같은 토큰으로 오면 새 플레이어로 입장(점수 없음).

### 7.2 봇 교체 — "봇 사망 시" 규칙
```
새 사람 ── hello ──▶ 서버: 빈칸 없음, replace=onDeath
새 사람 ◀── welcome, start{you:null}, notice WAITING_FOR_SLOT ── 서버 (관전 시작)
   … 봇 B가 사망 (또는 15초 경과 → 즉시 규칙으로 처리) …
서버: 슬롯 B → human, roster 전원 전송, notice BOT_REPLACED
새 사람 ◀── snap{you:{st:"dead", respawnAt}} ── 3초 후 스폰
```

### 7.3 매치 중 DO 재시작
```
DO 재시작 → 생성자: 저장된 phase = playing 발견 → lobby로 되돌림
클라: 연결 끊김 감지 → 토큰으로 재접속 → welcome + room{phase:"lobby"} + notice MATCH_ABORTED
```

---

## 8. 검증 규칙 (서버)

모든 메시지는 다음 순서로 처리한다. 한 단계라도 실패하면 이후 단계를 실행하지 않는다.

1. 길이 ≤ 1KB (파싱 전에)
2. `JSON.parse` 성공, 최상위가 객체이고 `t` 가 알려진 타입
3. 필드 타입·범위 검사 (`shared/protocol` 검증기). 숫자는 `Number.isFinite` 필수
4. 현재 단계에서 허용되는 타입인지
5. 권한(방장, 슬롯 보유) 확인
6. 메시지 안의 어떤 ID도 신원으로 믿지 않는다. 보낸 사람은 **소켓에 묶인 playerId** 로만 판단

닉네임: 앞뒤 공백 제거, 제어문자·줄바꿈 제거, 1~16자, 방 안에서 중복이면 `#2` 를 붙임.

---

## 9. 대역폭 추정 (JSON, 8인 방)

| 방향 | 계산 | 1인당 |
|---|---|---|
| 서버→클라 | 스냅샷 약 1KB(플레이어 7 × 45B + 기타 엔티티 10 × 30B + you 200B + 이벤트) × 15Hz | 약 15KB/s |
| 클라→서버 | 입력 약 70B × 30Hz | 약 2KB/s |

데스크톱 환경에서 충분히 감당 가능한 수준. 서버 쪽 나가는 트래픽은 과금되지 않는다.

---

## 10. 이후 변경 계획
- **바이너리 스냅샷 (P10)**: `Codec` 인터페이스의 구현만 교체. 엔티티를 이미 고정 순서 배열로 정의했으므로 그대로 DataView 필드로 옮긴다. 협상은 `hello` 에 `codec: "json" | "bin1"` 추가.
- **델타 압축**: 마지막으로 확인된 스냅샷 대비 바뀐 필드만 전송. 바이너리 전환 후 필요하면 검토.
- 하위 호환은 유지하지 않는다. 버전이 바뀌면 클라 새로고침으로 해결(웹 배포라 가능).
