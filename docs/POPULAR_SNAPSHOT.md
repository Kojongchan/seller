# 인기검색어 스냅샷 임포트 (C안)

데이터랩 인기검색어는 공개 API가 없어 **쇼핑인사이트 화면의 XHR을 크롤**해야 한다.
크롤 요청 자체는 언어 무관(POST + 헤더)이지만, **실행하는 네트워크가 막혀 있으면 실패**한다.

- 현재 **원격 개발 샌드박스는 egress 정책으로 `datalab.naver.com` 차단**(Node·Python·VBA 무엇이든 403).
- **프로덕션 Vercel 등 egress 허용 환경에서는 라이브 크롤이 그대로 동작**한다(B안).
- 그 외에는 **막히지 않은 PC에서 데이터를 뽑아 파일로 넣는다(C안).**

## 데이터 소스 우선순위 (스냅샷 우선 — C-자동 메인, 2026-06-19 결정)

`lib/popular.ts` 는 아래 순서로 시도한다:

1. **snapshot** — `data/popular.json` (GitHub Actions cron 이 매일 갱신) ← **메인**
2. **datalab** — 라이브 크롤 (`lib/datalab.ts`, 스냅샷이 없을 때만 부트스트랩)
3. **sample** — 통념 샘플(최후 폴백)

**네이버를 긁는 건 cron 한 곳뿐** → 사용자 요청은 네이버를 긁지 않고 로컬 JSON 만
서빙한다(차단 위험↓·페이지 빠름·데이터 git 버전관리). 즉 `data/popular.json` 만
있으면 **egress가 막혀도 실데이터**가 뜬다.

> 왜 스냅샷 우선인가: 쇼핑인사이트 인기검색어는 **일 단위 집계**라 실시간 재크롤의
> 이점이 없다. 매일 cron 이 원본 주기와 정확히 맞고, 사용자 트래픽이 네이버를
> 긁지 않아 안전·장기적으로 유리하다.

## 스냅샷 파일 형식 (`data/popular.json`)

```json
{
  "asOf": "2026-06-19",
  "cid": "50000159",
  "ranks": [
    { "rank": 1, "keyword": "수박" },
    { "rank": 2, "keyword": "참외" }
  ],
  "related": {
    "수박": [{ "rank": 1, "keyword": "꿀수박" }, { "rank": 2, "keyword": "씨없는수박" }]
  }
}
```

- `ranks` (필수): 인기검색어 TOP. `rank` 가 없거나 어긋나도 로더가 순서대로 재번호한다.
- `related` (선택): 메인 키워드별 연관 인기검색어 → 황금키워드 추출에 사용. 없으면
  `ranks` 안에서 메인명을 포함하는 롱테일만 황금으로 뽑는다.
- `asOf`/`cid` (선택): 화면 표기/메모용.

> 템플릿: `data/popular.example.json` 을 `data/popular.json` 으로 복사해 채운 뒤 커밋.

## 뽑는 방법 (막히지 않은 네트워크에서)

### 1) Node 스크립트 (권장 — TOP500 페이지네이션 포함)

```bash
node scripts/fetch-popular.mjs > data/popular.json          # 과일 TOP500
CID=50000159 TOP=100 node scripts/fetch-popular.mjs > data/popular.json
git add data/popular.json && git commit -m "data: 인기검색어 스냅샷 갱신" && git push
```

### 2) 엑셀 VBA (사용자가 제안한 방식)

엑셀이 특별해서가 아니라 **VBA가 본인 PC(차단 없는 망)에서 같은 HTTP 요청을 보내기 때문**에 된다.
아래 매크로는 결과를 `data/popular.json` 형식으로 시트가 아닌 파일로 저장한다(간단화 버전).

```vba
Sub FetchDatalabPopular()
    Dim http As Object, body As String, json As String
    Dim cid As String, sDate As String, eDate As String
    cid = "50000159"
    eDate = Format(Date - 1, "yyyy-mm-dd")
    sDate = Format(Date - 30, "yyyy-mm-dd")
    body = "cid=" & cid & "&timeUnit=date&startDate=" & sDate & "&endDate=" & eDate & _
           "&age=&gender=&device=&page=1&count=20"

    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "POST", "https://datalab.naver.com/shoppingInsight/getCategoryKeywordRank.naver", False
    http.setRequestHeader "Content-Type", "application/x-www-form-urlencoded; charset=UTF-8"
    http.setRequestHeader "X-Requested-With", "XMLHttpRequest"
    http.setRequestHeader "Referer", "https://datalab.naver.com/shoppingInsight/sCategory.naver"
    http.send body
    json = http.responseText      ' { "ranks": [ {rank, keyword, linkId}, ... ] }

    ' json 의 ranks 를 파싱해 위 '스냅샷 파일 형식'대로 data/popular.json 으로 저장.
    ' (page 를 1→25 로 반복하면 TOP500. 파싱은 시트 셀에 적거나 JSON 라이브러리 사용.)
    Debug.Print json
End Sub
```

> VBA로 page 1~25 반복 + JSON 조립이 번거로우면 Node 스크립트(1번)가 가장 간단하다.
> 어떤 방법이든 **결과 JSON 형식만 맞추면** 사이트가 자동으로 실데이터로 표시한다.

## 자동 최신화 (수동 X)

스냅샷의 단점은 "수동"이라는 것 → **GitHub Actions 로 자동화**한다.
`.github/workflows/refresh-popular.yml` 가 **매일 06:00 KST 에 GitHub 러너
(인터넷 egress 열림)에서** `scripts/fetch-popular.mjs` 를 돌려 `data/popular.json`
을 **자동 커밋**한다. 사람이 손댈 필요가 없다.

- 크롤이 막히거나(403) 실패하면 임시파일이 비어 검증에서 걸러지므로 **깨진
  데이터는 커밋되지 않는다**(마지막 정상 스냅샷 유지).
- ⚠️ 스케줄 워크플로는 **기본 브랜치(main 등)에서만** 동작 → 이 브랜치를 머지해야 켜진다.
  머지 전 테스트는 Actions 탭에서 **Run workflow(workflow_dispatch)** 로 수동 실행.

### "자동"의 두 경로 정리

| 방법 | 실행 위치 | 자동? | 비고 |
|---|---|---|---|
| **C-자동. GH Actions cron (채택)** | GitHub 러너 | ✅ 매일 자동 커밋 | **메인.** Vercel 없이도 동작, 데이터 git 버전관리, 사용자 트래픽이 네이버 안 긁음 |
| B. Vercel ISR | Vercel(egress 열림) | ✅ 6h마다 자동 재크롤 | 스냅샷 없을 때 부트스트랩 폴백으로만 |
| C-수동. 직접 실행 | 본인 PC(VBA/Node) | ❌ 수동 | 위 자동이 안 될 때 백업 |

> **채택: C-자동(스냅샷 우선).** 인기검색어 원본이 일 단위라 실시간 재크롤 이점이
> 없고, cron 한 곳만 네이버를 긁어 안전·장기적으로 유리. "자동 최신화"는 HTML/JSON
> 파싱 방식이 아니라 '안 막힌 곳(GitHub 러너)에서 주기 실행'으로 달성.
>
> ⚠️ **러너 IP 검증 필요:** GitHub 러너도 데이터센터 IP라 네이버가 막을 수 있다.
> 머지 후 Actions 탭에서 **Run workflow** 1회 실행해 성공(=커밋 발생) 확인이 진짜 검증.
> 실패하면 C-수동(본인 PC에서 뽑아 커밋)으로 폴백.
