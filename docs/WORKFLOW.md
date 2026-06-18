# 🔁 워크플로우 (WORKFLOW)

> 여러 대화창(Claude Code 세션)이 한 저장소에서 충돌 없이 협업하기 위한 규칙.
> 최초 작성: 2026-06-18

---

## 1. 핵심 원칙

1. **docs/가 단일 진실 공급원.** 모든 창은 시작 시 `docs/`를 읽고, 끝나면 관련 문서를 갱신한다.
2. **창은 기능(Epic)으로 나눈다.** 프론트/백엔드로 나누지 않는다 (Next.js 풀스택).
3. **한 번에 하나의 Epic/작업**만 진행해 브랜치 충돌을 줄인다.
4. **비밀값(키)은 절대 커밋/문서/채팅에 남기지 않는다.**

---

## 2. 표준 개발 루프 (검증됨 ✅)

```
1. main 최신화      : git checkout main && git pull origin main
2. 기능 브랜치 생성 : git checkout -b feature/<epic>-<요약>
3. 구현 + 로컬 빌드 : npm run build  (통과 확인)
4. 커밋 & 푸시      : git push -u origin <branch>
5. PR 생성          : base=main  (제목/본문에 무엇을/왜)
6. Vercel Preview   : PR에 자동 생성되는 Preview URL로 화면 확인
7. 머지(squash)     : 확인되면 main에 머지 → 자동 프로덕션 배포
8. 문서 갱신        : docs/PLAN.md 체크박스, 필요 시 ARCHITECTURE/README STATUS
```

> 문서만 바꾸는 경우(기획/설계 정리)는 PR 없이 `main` 직접 커밋도 허용.

---

## 3. 브랜치 네이밍

- 기능: `feature/e1-keyword-grade`, `feature/e2-order-automation` …
- 수정: `fix/...`, 문서: `docs/...`

---

## 4. 새 대화창 시작 체크리스트

- [ ] `docs/README.md` 읽기 → 현재 상태/구조 파악
- [ ] 내 창 역할에 맞는 문서 읽기 (PLAN / DESIGN / ARCHITECTURE)
- [ ] 진행할 Epic의 **범위와 '열린 질문'** 확인 → 모호하면 사용자에게 질문
- [ ] 작업 → 루프(2번) → 문서 갱신

---

## 5. 환경/배포 주의사항 (실전에서 겪은 것)

- **환경변수는 넣은 뒤 재배포해야 적용**된다 (빈 커밋 푸시로 트리거 가능).
- 네이버 키는 **ID/Secret 자리**를 헷갈리지 말 것. 의심되면 `/api/trend?...&debug=1`의 `keyInfo` 확인.
- 프로덕션 브랜치 = `main`. **다른 브랜치에 머지해도 라이브는 안 바뀐다.**
- 라이브 동작 확인: `https://chan-seller.vercel.app/api/trend?fruit=watermelon&debug=1`

---

## 6. 상태 추적

- 진행 현황은 `docs/PLAN.md`의 Epic 체크박스로 관리.
- 큰 상태 변화(새 기능 라이브, 연동 추가 등)는 `docs/README.md`의 "현재 상태"에 반영.
