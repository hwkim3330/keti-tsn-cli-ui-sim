# TSN Switch Manager Dashboard
## 발표 자료

---

# 목차

1. TSN 기술 개요
2. 시스템 구성
3. 대시보드 기능 소개
4. 개발 결과물
5. 시연

---

# 1. TSN 기술 개요

---

## TSN (Time-Sensitive Networking) 이란?

- IEEE 802.1 표준 기반의 **결정론적 이더넷** 기술
- 기존 이더넷에 **시간 동기화**, **트래픽 스케줄링**, **대역폭 보장** 기능 추가
- 산업 자동화, 자동차, 오디오/비디오 스트리밍 분야에 적용

### 핵심 특징
| 특징 | 설명 |
|------|------|
| 저지연 | 마이크로초 단위의 예측 가능한 지연 |
| 시간 동기화 | 네트워크 전체 1μs 이하 동기화 |
| 대역폭 보장 | 중요 트래픽에 대한 대역폭 예약 |
| 공존성 | 일반 이더넷 트래픽과 공존 가능 |

---

## TSN 핵심 프로토콜

### 1. PTP (Precision Time Protocol) - IEEE 802.1AS
- 네트워크 전체 **시간 동기화**
- Grandmaster(GM) 클럭 기준으로 모든 노드 동기화
- 나노초(ns) 단위 정밀도

### 2. TAS (Time-Aware Shaper) - IEEE 802.1Qbv
- **시간 기반 트래픽 스케줄링**
- Gate Control List(GCL)로 전송 시점 제어
- 트래픽 클래스별 전용 시간 슬롯 할당

### 3. CBS (Credit-Based Shaper) - IEEE 802.1Qav
- **크레딧 기반 대역폭 제어**
- SR Class A/B 트래픽에 대역폭 보장
- 버스트 트래픽 제어

---

## PTP 동작 원리

```
┌─────────────┐         ┌─────────────┐
│  Grandmaster │ ──────► │    Slave    │
│   (Board 1)  │  Sync   │  (Board 2)  │
│              │ ◄────── │             │
│  Clock: 0ns  │ Delay   │ Clock: ±50ns│
└─────────────┘  Req/Resp└─────────────┘
```

### 동기화 과정
1. GM이 Sync 메시지 전송
2. Slave가 Delay Request 전송
3. 경로 지연(Path Delay) 계산
4. 클럭 오프셋 보정

### 주요 파라미터
- **Clock Offset**: 클럭 차이 (목표: ±50ns 이내)
- **Path Delay**: 네트워크 전송 지연 (~5μs)
- **Sync Interval**: 동기화 주기 (125ms)

---

## TAS 동작 원리

```
시간 →  0ms    125ms   250ms   375ms   500ms   625ms   750ms   875ms  1000ms
        ├───────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤
TC0     ████████████████████████████████████████████████████████████████  (항상 열림)
TC1     ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
TC2     ░░░░░░░░████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
TC3     ░░░░░░░░░░░░░░░░████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
...
```

### Gate Control List (GCL)
- 8개 Traffic Class (TC0~TC7)
- 각 슬롯에서 열림/닫힘 상태 제어
- 1초 사이클, 8개 슬롯 × 125ms

### 트래픽 클래스
| TC | 이름 | 용도 |
|----|------|------|
| TC0 | BE(BG) | Best Effort (Background) |
| TC5 | Voice | 음성 트래픽 (SR Class A) |
| TC6 | Video | 영상 트래픽 (SR Class B) |
| TC7 | NC | Network Control |

---

## CBS 동작 원리

```
크레딧
  ▲
  │    ╱╲    ╱╲    ╱╲
  │   ╱  ╲  ╱  ╲  ╱  ╲   ← idleSlope (충전)
──┼──╱────╲╱────╲╱────╲──────► 시간
  │ ╲    ╱ ╲    ╱ ╲    ╱
  │  ╲  ╱   ╲  ╱   ╲  ╱  ← sendSlope (소비)
  │   ╲╱     ╲╱     ╲╱
```

### 파라미터
- **idleSlope**: 대기 시 크레딧 충전 속도
- **sendSlope**: 전송 시 크레딧 소비 속도
- 크레딧 > 0 일 때만 전송 가능

### 대역폭 할당 예시
| Traffic Class | 할당 대역폭 |
|--------------|------------|
| TC5 (Voice)  | 250 Mbps (25%) |
| TC6 (Video)  | 375 Mbps (37.5%) |
| Best Effort  | 375 Mbps (37.5%) |

---

# 2. 시스템 구성

---

## 하드웨어 구성

### TSN 스위치 보드
- **칩셋**: Microchip LAN9692
- **포트**: 9포트 TSN 지원
- **속도**: 1Gbps

### 네트워크 토폴로지
```
┌─────────────────┐              ┌─────────────────┐
│  TSN Board #1   │              │  TSN Board #2   │
│    (LAN9692)    │◄────────────►│    (LAN9692)    │
│                 │    1 Gbps    │                 │
│  Role: GM       │              │  Role: Slave    │
│  IP: 192.168.1.101             │  IP: 192.168.1.102
└─────────────────┘              └─────────────────┘
```

### 역할 분담
| 보드 | 역할 | 설명 |
|------|------|------|
| Board #1 | Grandmaster (GM) | 기준 클럭 제공 |
| Board #2 | Slave | GM에 동기화 |

---

## 소프트웨어 구성

### 웹 대시보드
- **프론트엔드**: HTML5, CSS3, JavaScript (Vanilla)
- **배포**: GitHub Pages
- **실시간 업데이트**: 8Hz (125ms 주기)

### 주요 기능
1. PTP 동기화 모니터링
2. TAS Gate Control List 관리
3. CBS 대역폭 모니터링
4. 디바이스 상태 확인

---

# 3. 대시보드 기능 소개

---

## PTP Dashboard

### 실시간 모니터링 항목
| 항목 | 설명 | 단위 |
|------|------|------|
| Clock Offset | GM과의 시간 차이 | ns |
| Path Delay | 네트워크 전송 지연 | μs |
| Steps Removed | GM으로부터의 홉 수 | - |
| Clock Class | IEEE 1588 클럭 등급 | - |

### 그래프
- Clock Offset History (실시간 그래프)
- 200 샘플 유지, 8Hz 업데이트

### 상태 표시
- **Locked**: 동기화 완료 (|offset| < 50ns)
- **Acquiring**: 동기화 진행 중

---

## TAS Dashboard

### Gate Control List (GCL) 매트릭스
- 8개 슬롯 × 8개 Traffic Class
- 각 셀: 게이트 열림(●) / 닫힘(○)
- 슬롯당 125ms 지속

### GCL Timeline
- 1초 사이클 시각화
- TC별 게이트 열림 구간 표시

### Traffic Test
- 모든 TC에 트래픽 발생
- 지연시간, 지터 측정
- Shaped/Direct 상태 확인

---

## CBS Dashboard

### Queue Configuration
- 8개 큐 (TC0~TC7) 설정 표시
- idleSlope, sendSlope 값
- CBS 활성화 상태

### Credit Level Monitor
- TC5, TC6 크레딧 변화 그래프
- 실시간 업데이트

### Bandwidth Allocation
- TC별 대역폭 할당 비율
- 막대 그래프 시각화

### Bandwidth Test
- 지정 대역폭으로 트래픽 발생
- 달성률, 손실률 측정

---

## Device Status

### 디바이스 카드
- 보드별 상태 (Online/Offline)
- 역할, IP, MAC, 포트 수
- Uptime 표시

### Network Topology
- PTP 계층 구조 시각화
- GM → Slave 연결 표시

### Port Status
- 포트별 링크 상태
- RX/TX 바이트, 패킷 카운트
- PTP 역할 (Master/Slave)

---

# 4. 개발 결과물

---

## 개발 범위

### 완료 항목
- [x] 웹 기반 TSN 대시보드 UI
- [x] PTP 동기화 시뮬레이션
- [x] TAS GCL 시각화
- [x] CBS 크레딧 모니터링
- [x] 디바이스 상태 모니터링
- [x] 실시간 그래프 (Canvas)
- [x] Retina 디스플레이 지원
- [x] GitHub Pages 배포

### 기술 스택
| 구분 | 기술 |
|------|------|
| Frontend | HTML5, CSS3, JavaScript |
| 그래프 | Canvas API |
| 배포 | GitHub Pages |
| 버전관리 | Git |

---

## 화면 구성

```
┌──────────────────────────────────────────────────────────┐
│ ┌─────────┐  ┌─────────────────────────────────────────┐ │
│ │         │  │                                         │ │
│ │  KETI   │  │         PTP Dashboard                   │ │
│ │  Logo   │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │ │
│ │         │  │  │Offset│ │Delay│ │Steps│ │Class│       │ │
│ ├─────────┤  │  └─────┘ └─────┘ └─────┘ └─────┘       │ │
│ │Dashboard│  │  ┌─────────────────────────────────┐   │ │
│ │ - PTP   │  │  │     Clock Offset Graph          │   │ │
│ │ - TAS   │  │  │     ~~~~~~~~~~~~~~~~~~~~~~~~    │   │ │
│ │ - CBS   │  │  └─────────────────────────────────┘   │ │
│ ├─────────┤  │                                         │ │
│ │Overview │  │  ┌───────────────┐ ┌───────────────┐   │ │
│ │ -Device │  │  │Clock Properties│ │Port Config    │   │ │
│ │         │  │  └───────────────┘ └───────────────┘   │ │
│ └─────────┘  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 주요 특징

### 1. 실시간 시뮬레이션
- 8Hz 주기로 데이터 업데이트
- 현실적인 PTP 오프셋 값 (±50ns)
- 크레딧 레벨 변동 시뮬레이션

### 2. 직관적 UI
- 무채색 톤다운 디자인
- 명확한 상태 표시
- 반응형 레이아웃

### 3. 고품질 그래프
- Retina 디스플레이 지원
- Canvas 기반 실시간 렌더링
- 부드러운 애니메이션

---

## 접속 정보

### 웹 대시보드 URL
**https://hwkim3330.github.io/keti-tsn-cli-ui-sim/**

### GitHub Repository
**https://github.com/hwkim3330/keti-tsn-cli-ui-sim**

---

# 5. 시연

---

## 시연 시나리오

### 1. PTP Dashboard
- 보드 선택 → 오프셋 값 확인
- 실시간 그래프 동작 확인
- Locked/Acquiring 상태 전환

### 2. TAS Dashboard
- GCL 매트릭스 확인
- Timeline 시각화 확인
- Traffic Test 실행 → 결과 확인

### 3. CBS Dashboard
- Queue Configuration 확인
- Credit Monitor 그래프 확인
- Bandwidth Test 실행

### 4. Device Status
- 보드 상태 확인
- 토폴로지 확인
- 포트 상태 확인

---

# 감사합니다

## Q&A

---

# 부록

---

## 용어 정리

| 용어 | 설명 |
|------|------|
| TSN | Time-Sensitive Networking |
| PTP | Precision Time Protocol |
| TAS | Time-Aware Shaper |
| CBS | Credit-Based Shaper |
| GCL | Gate Control List |
| GM | Grandmaster |
| TC | Traffic Class |
| SR | Stream Reservation |

---

## 참고 자료

- IEEE 802.1AS-2020 (PTP)
- IEEE 802.1Qbv-2015 (TAS)
- IEEE 802.1Qav-2009 (CBS)
- Microchip LAN9692 Datasheet
