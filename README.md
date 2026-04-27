# 미생물 키우기

HTML5/Vite로 만든 미생물 배양 게임입니다.

월간 랭킹은 운영 서버의 SQLite DB에 저장됩니다.

## 로컬 실행

```bash
npm install
npm run dev
```

## 검증

```bash
npm test
npm run build
```

## 배포

정적 빌드 결과물은 `dist/`에 생성됩니다.

```bash
npm run build
```

운영 서버는 `npm run start`로 `dist/`를 서비스합니다.

```bash
MICROBE_HOST=127.0.0.1 MICROBE_PORT=4130 npm run start
```

현재 배포 대상 도메인은 `https://microbe.monosaccharide180.com/`입니다. 랭킹 API는 같은 서버의 `/api/leaderboard`를 사용합니다. 자세한 배포 순서는 [DEPLOYMENT.md](./DEPLOYMENT.md)를 참고하세요.
