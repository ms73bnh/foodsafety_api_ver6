# E5 임베딩 서버·Gemini 역할 분리·DB 백업

## 권장 저장소/배포 구조

```text
foodsafety_api_ver6/                 # 하나의 GitHub 저장소
├─ app/                              # 기존 웹: Vercel 프로젝트 A
├─ lib/
├─ prisma/
└─ services/
   └─ e5-embedding/                  # E5 API: Vercel 프로젝트 B
```

GitHub Desktop에서는 현재 저장소 전체를 그대로 Push합니다. `services/e5-embedding` 내부에 별도 `.git`을 만들지 않습니다. Vercel에서 같은 GitHub 저장소를 새 프로젝트로 한 번 더 Import하고 새 프로젝트의 **Root Directory**만 `services/e5-embedding`으로 지정합니다.

## 환경변수

E5 프로젝트:

- `E5_API_KEY`: 웹과 E5 서버만 공유하는 충분히 긴 비밀키

기존 웹 프로젝트:

- `E5_EMBEDDING_URL`: `https://<E5 프로젝트>.vercel.app/api/embed`
- `E5_API_KEY`: E5 프로젝트와 동일한 값
- `E5_REQUEST_TIMEOUT_MS`(선택): 첫 모델 다운로드를 고려한 요청 제한 시간. 기본값 `280000`
- `GEMINI_API_KEY`: 질문 분석·조건부 근거 검증·최종 답변용
- `GEMINI_FAST_MODEL`(선택): 기본 `gemini-3.5-flash-lite`, 키워드·검증용
- `GEMINI_ANSWER_MODEL`(선택): 기본 `gemini-3.6-flash`, 최종 답변용

## 차원이란?

임베딩은 문장을 숫자 좌표로 바꾼 것입니다. 2차원 지도에서 위치를 `(가로, 세로)` 두 숫자로 표현하듯이 E5-small은 문장 하나를 384개의 숫자로 표현하고, 현재 Gemini 임베딩은 768개의 숫자로 표현합니다.

차원이 많다고 항상 더 정확한 것은 아닙니다. 모델이 그 좌표 공간을 어떻게 학습했는지가 더 중요합니다. 서로 다른 모델의 좌표는 지도 자체가 다르므로 384차원 E5 문서와 768차원 Gemini 질문을 직접 비교할 수 없습니다. 문서와 질문은 반드시 같은 모델·같은 차원이어야 합니다.

384차원은 768차원보다 벡터 저장공간과 유사도 계산량이 대략 절반입니다.

## 전환 순서

1. `scripts/backup-database.ps1`로 현재 Gemini 임베딩까지 전체 백업
2. E5 Vercel 프로젝트 배포 및 인증된 `POST /api/embed`로 첫 런타임 모델 다운로드와 실제 384차원 응답 확인
3. 두 Vercel 프로젝트에 환경변수 등록
4. 기존 웹 배포
5. `prisma/committee_rag_v2.sql`이 미적용 상태라면 먼저 실행하고, 이어서 `prisma/committee_rag_e5.sql`과 `prisma/committee_chat_feedback.sql` 실행
6. 관리자 화면에서 `재임베딩` 실행

E5 전환 SQL은 기존 Gemini 벡터를 비우고 모든 청크를 `pending`으로 바꿉니다. 전환 직전에 반드시 백업합니다.

## Gemini 호출 정책

- 질문당 키워드·검색 문장·의도 분석: 1회, 동일 질문은 warm instance에서 30분 캐시
- 검색: E5 질문 임베딩 0~1회
- 근거 검증: 질문이 모호하거나 의미 검색 점수가 낮을 때만 1회
- 최종 답변: 근거가 확인된 경우 1회
- 근거가 없거나 조건부 검증에서 탈락하면 최종 답변 LLM을 호출하지 않음

## 전체 DB 백업

PowerShell에서 프로젝트 루트 기준으로 실행합니다.

```powershell
$env:DATABASE_URL = "postgresql://..."
.\scripts\backup-database.ps1
```

`database.dump`는 스키마, 모든 테이블 데이터, JSON 임베딩, pgvector 컬럼, 질문·답변·검색 근거·Y/N 평가가 저장된 `committee_chat_feedback` 테이블을 포함합니다. PDF가 Supabase Storage 등 DB 외부에 저장돼 있다면 원본 PDF 파일은 별도의 Storage 백업이 필요합니다.

Supabase를 사용한다면 트랜잭션 풀러 주소보다 Dashboard의 Direct connection 또는 Session pooler 연결 문자열을 백업에 사용하는 편이 안정적입니다. 백업 파일에는 회원정보 등 민감 데이터가 포함될 수 있으므로 Git에 커밋하지 않습니다.
