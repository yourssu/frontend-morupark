# 로그인

- **url**: /api/auth/login
- **method**: POST

## 요청

```json
{
	"studentId": 20260101,
	"phoneNumber": 01012345678
}
```

## 응답

`201 CREATED` 

```json
{
	"accessToken": "eyJhbGciOiJIU...",
	"expiredIn" : 86400000,
}
```
