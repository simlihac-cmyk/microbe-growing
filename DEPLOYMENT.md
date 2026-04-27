# 배포 메모

## 목표

- 서비스 주소: `https://microbe.monosaccharide180.com/`
- 빌드 명령: `npm run build`
- 배포 폴더: `dist`
- 앱은 클라이언트 전용 정적 사이트입니다.

## Cloudflare Pages 권장 절차

현재 `monosaccharide180.com`은 Cloudflare 쪽 IP를 사용하고 있으므로, Cloudflare Pages가 가장 단순합니다.

1. 이 폴더를 GitHub 저장소로 푸시합니다.
2. Cloudflare Dashboard에서 `Workers & Pages` -> `Create application` -> `Pages`를 선택합니다.
3. Git 저장소를 연결합니다.
4. 빌드 설정을 아래처럼 지정합니다.
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Pages 프로젝트 배포 후 `Custom domains`에서 `microbe.monosaccharide180.com`을 추가합니다.
6. Cloudflare가 안내하는 DNS 레코드를 생성합니다.

## DNS 확인

DNS가 연결되면 아래 명령에서 값이 나와야 합니다.

```bash
dig +short microbe.monosaccharide180.com
```

## 직접 배포 선택지

Cloudflare Pages CLI를 쓰는 경우:

```bash
npm install
npm run build
npx wrangler pages deploy dist --project-name microbe-growing
```

그 다음 Cloudflare Pages 프로젝트 설정에서 `microbe.monosaccharide180.com` 커스텀 도메인을 연결합니다.
