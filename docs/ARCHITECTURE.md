# Architecture — 냉장고 식음료 정보 정리 서비스

이 문서는 냉장고 사진 기반 식음료 정리 단계의 앱 구조와 작동 메커니즘을 설명합니다.

## 핵심 구조

```text
iOS App
  → API Gateway
  → Lambda
  → S3 / DynamoDB
  → Multimodal AI API
  → iOS Inventory UI
```

## 컴포넌트별 역할

### iOS App

- 냉장고 사진 선택 또는 촬영
- Presigned URL 요청
- S3로 원본 이미지 업로드
- 이미지 key와 사용자 메시지를 백엔드로 전송
- AI 응답 JSON 파싱
- `bbox` 좌표를 사용해 원본 이미지에서 아이템 썸네일 생성
- 카테고리별 인벤토리 UI 표시

### API Gateway

- iOS 앱의 HTTPS 진입점
- `/upload-url`, `/chat`, `/status` endpoint 제공
- Lambda proxy integration으로 요청 전달

### Lambda

- `generate-upload-url`: S3 Presigned URL 생성
- `chat-worker-sync`: 이미지 분석을 동기적으로 처리하는 단순 구조
- `chat-dispatcher`: 긴 작업을 위해 즉시 `202 Accepted`를 반환하고 worker를 비동기 호출
- `chat-worker-async`: S3 이미지 다운로드, AI 호출, DynamoDB 상태 업데이트
- `chat-status-check`: 앱이 polling으로 분석 상태를 확인하는 endpoint

### S3

- 원본 냉장고 사진 저장
- 앱은 Presigned URL을 통해 S3에 직접 업로드
- Lambda는 imageKey를 이용해 필요한 이미지를 가져옴

### DynamoDB

- 세션별 대화 및 분석 기록 저장
- Partition key: `sessionID` 또는 `sessionId`
- Sort key: `timestamp`
- 비동기 구조에서는 `status` 필드로 `processing`, `completed`, `failed` 추적

### Multimodal AI API

- 원본 이미지와 텍스트 프롬프트를 함께 분석
- 식음료 이름, 카테고리, 수량, 유통기한, 상태, 보관 가이드, bounding box를 JSON으로 반환

## AI 출력 구조

AI는 앱에서 안정적으로 파싱할 수 있도록 `<INVENTORY>` 태그 안에 JSON을 반환하도록 설계했습니다.

```json
{
  "categories": {
    "Dairy": [
      {
        "id": "item-001",
        "name": "Milk",
        "category": "Dairy",
        "quantity": "1 carton",
        "bbox": {
          "ymin": 0.18,
          "xmin": 0.24,
          "ymax": 0.52,
          "xmax": 0.46
        },
        "sourceImageIndex": 0,
        "expirationDate": "2025-12-10",
        "daysUntilExpiration": 6,
        "conditionWhenPhotographed": "sealed and fresh",
        "estimatedConditionNow": "fresh",
        "storageGuidance": "Keep refrigerated and consume soon after opening.",
        "aiNotes": "Use within 6 days.",
        "userNotes": ""
      }
    ]
  }
}
```

## Bounding Box → 썸네일 변환

AI가 반환하는 `bbox`는 0~1 사이의 정규화 좌표입니다.

```text
x = xmin × imageWidth
y = ymin × imageHeight
width = (xmax - xmin) × imageWidth
height = (ymax - ymin) × imageHeight
```

iOS 앱은 이 값을 사용해 원본 이미지에서 각 식음료 영역을 잘라 썸네일로 표시합니다.
