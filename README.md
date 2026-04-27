# 미생물 키우기

HTML5/Vite로 만든 미생물 배양 게임입니다.

월간 랭킹은 운영 서버의 SQLite DB에 저장됩니다. 랭킹 등록은 서버가 발급한 진행 검증 run id와 최소 플레이 시간 검사를 통과해야 합니다.

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

## 이미지 최적화

원본 미생물 이미지는 `assets/microbes-source/`에 보관하고, 실제 서비스 이미지는 `public/microbes/`와 `public/microbes-optimized/`에 생성합니다.

```bash
npm run optimize:images
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

릴리스 버전까지 올리고 GitHub push 후 운영 서버에 바로 적용하려면 아래처럼 실행합니다.

```bash
npm run release -- v1.0.1
```

더 짧게 직접 실행해도 됩니다.

```bash
./scripts/release.sh v1.0.1
```

이 명령은 `package.json`, `package-lock.json`, 시작 화면 버전 표기를 입력한 버전으로 바꾸고, 테스트와 빌드를 통과하면 커밋, 태그 생성, push, LaunchAgent 재시작, 로컬 운영 포트 확인까지 진행합니다.

현재 배포 대상 도메인은 `https://microbe.monosaccharide180.com/`입니다. 랭킹 API는 같은 서버의 `/api/leaderboard`를 사용합니다. 자세한 배포 순서는 [DEPLOYMENT.md](./DEPLOYMENT.md)를 참고하세요.

## Google AdSense

- 게시자 ID: `pub-1148471265184249`
- 빌드 시 `index.html`의 `<head>`에 AdSense 계정 메타 태그와 스크립트가 자동 삽입됩니다.
- `public/ads.txt`가 `https://microbe.monosaccharide180.com/ads.txt`로 배포됩니다.
- 개인정보처리방침, 이용약관, 광고/제휴 고지, 문의 페이지는 `public/policy/`와 `public/contact/`에 정적 페이지로 배포됩니다.
- 수동 디스플레이 광고 슬롯을 쓰려면 빌드 전에 `VITE_ADSENSE_BOTTOM_SLOT`에 AdSense 광고 단위의 slot ID를 넣습니다. 광고 영역은 게임 화면 바깥쪽 하단에만 렌더링됩니다.
