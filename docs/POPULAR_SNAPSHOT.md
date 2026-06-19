# 인기검색어 스냅샷 임포트 (C안)

데이터랩 인기검색어는 공개 API가 없어 **쇼핑인사이트 화면의 XHR을 크롤**해야 한다.
크롤 요청 자체는 언어 무관(POST + 헤더)이지만, **실행하는 네트워크가 막혀 있으면 실패**한다.

- 현재 **원격 개발 샌드박스는 egress 정책으로 `datalab.naver.com` 차단**(Node·Python·VBA 무엇이든 403).
- **프로덕션 Vercel 등 egress 허용 환경에서는 라이브 크롤이 그대로 동작**한다(B안).
- 그 외에는 **막히지 않은 PC에서 데이터를 뽑아 파일로 넣는다(C안).**

## 데이터 소스 우선순위

`lib/popular.ts` 는 아래 순서로 시도한다:

1. **datalab** — 라이브 크롤 (`lib/datalab.ts`, egress 허용 환경)
2. **snapshot** — `data/popular.json` (이 문서)
3. **sample** — 통념 샘플(최후 폴백)

즉 `data/popular.json` 만 있으면 **egress가 막혀도 실데이터**가 뜬다.

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
