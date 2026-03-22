# 대기 상태 확인 (Polling)

- **url**: /api/queues/status
- **method**: GET

## 요청

### Request Header

| 변수명 | 타입 | 필수여부 | 설명 | 예시 |
| --- | --- | --- | --- | --- |
| Authorization | String  | O | 로그인 API를 통해 
발급 받은 액세스 토큰 | Authorization: Bearer {accessToken} |
| X-Waiting-Token | String | O | 대기열 진입 API를 통해 
발급 받은 번호표 | X-Waiting-Token: {waitingToken} |

## 응답

`200 OK` (status: WAITING, PROCESSING, SUCCESS, FAILED)

1. `WAITING`: 대기열 내부에서 대기 중 (Redis Sorted Set 안)
    
    ```json
    { 
    	"status": "WAITING", 
    	"rank": 2010, // 대기 순번
    	"estimatedWaitSeconds": 54, // 예상대기시간(초 단위)
    }
    ```
    
    - UI 예시
        
        ![스크린샷 2026-02-19 오후 2.03.39.png](attachment:11aa0374-c9aa-4add-bd27-429ec327d68f:스크린샷_2026-02-19_오후_2.03.39.png)
        
2. `PROCESSING`: 대기열 통과 후, 처리 중 
    
    ```json
    {
      "status": "PROCESSING" 
    }
    ```
    
    - UI 예시
        
        ![스크린샷 2026-02-19 오후 1.43.54.png](attachment:0f452323-9307-499c-bde4-81b0ff9dffc6:스크린샷_2026-02-19_오후_1.43.54.png)
        
3. `SUCCESS`: 완료
    
    ```json
    {
      "status": "SUCCESS" // 결과 페이지 이동
    }
    ```
    
4. `FAILED`: 실패
    
    ```json
    {
      "status": "FAILED",
      "message": "재고 없음"
    }
    ```
    

`401 Unauthorized`

```json
{
	"error": "InvalidCredentials", 
	"message": "인증 정보가 유효하지 않습니다."
}
```

`401 Unauthorized`

```json
{
	"error": "InvalidWaitingToken", 
	"message": "유효하지 않은 번호표입니다. 다시 시도해주세요."
}
```
