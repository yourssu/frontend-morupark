# 대기열 진입

- **url**: /api/queues
- **method**: POST

## 요청

### Request Header

| 변수명 | 타입 | 필수여부 | 설명 | 예시 |
| --- | --- | --- | --- | --- |
| Authorization | string | O | 로그인 API를 통해 
발급 받은 액세스 토큰 | Authorization: Bearer {accessToken} |

## 응답

`202 Accepted` 

```json
{
	"waitingToken": "eyJhbGciOiJIUzI1NiJ9..." 
}
```

| 변수명 | 타입 | 설명 | 예시 |
| --- | --- | --- | --- |
| waitingToken |  | 번호표 - 대기 상태 확인 API 요청 시 사용 |  |

`401 Unauthorized`

```json
{
	"error": "InvalidCredentials", 
	"message": "인증 정보가 유효하지 않습니다."
}
```
