# E5 Embedding Service

`multilingual-e5-small` INT8 모델을 실행하는 독립 Vercel Function입니다. 모델은
첫 추론 시 Hugging Face에서 다운로드하고 Vercel 인스턴스의 `/tmp` 공간에 캐시합니다.

## Vercel 배포

1. 현재 GitHub 저장소를 Vercel의 새 프로젝트로 Import합니다.
2. **Root Directory**를 `services/e5-embedding`으로 지정합니다.
3. 환경변수 `E5_API_KEY`에 충분히 긴 임의 문자열을 등록합니다.
4. Node.js 22.x와 Fluid Compute가 활성화되었는지 확인하고 배포합니다.
5. 현재 웹 프로젝트에는 `E5_EMBEDDING_URL=https://<새 프로젝트>.vercel.app/api/embed`와 같은 `E5_API_KEY`를 등록합니다.

`vercel.json`의 설치 명령은 `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`을 지정해 CPU Vercel
Function에 불필요한 CUDA·TensorRT 네이티브 라이브러리가 설치되는 것을
막습니다. CPU ONNX Runtime은 계속 사용합니다.

GitHub Desktop에서 이 폴더만 별도 저장소로 만들거나 내부에 `.git`을 추가하지 않습니다. 같은 저장소를 두 Vercel 프로젝트가 서로 다른 Root Directory로 배포합니다.

## API

- `GET /api/embed`: 모델명, 차원, 런타임 로딩 상태 확인(모델 추론은 실행하지 않음)
- `POST /api/embed`: Bearer 인증 필요

```json
{
  "inputType": "document",
  "texts": ["회의록 청크 1", "회의록 청크 2"]
}
```

E5 검색 규칙에 맞춰 서버가 문서에는 `passage:`, 질문에는 `query:` 접두사를 자동으로 붙입니다.
