# 배포 메모

## 현재 운영 방식

- 서비스 주소: `https://microbe.monosaccharide180.com/`
- 로컬 서비스: `http://127.0.0.1:4130`
- 실행 방식: macOS LaunchAgent
- 외부 연결: Cloudflare Tunnel
- 랭킹 DB: `data/leaderboard.sqlite`
- 빌드 명령: `npm run build`
- 배포 폴더: `dist`

`owcs.monosaccharide180.com`과 같은 방식으로, 이 Mac에서 정적 서버를 띄우고 Cloudflare Tunnel이 서브도메인 트래픽을 로컬 포트로 전달합니다.

랭킹은 브라우저 `localStorage`가 아니라 서버의 SQLite DB에 저장됩니다. 월간 랭킹은 서버 시간 기준 `Asia/Seoul` 월 단위로 나뉩니다.

## 로컬 운영 서버

```bash
npm install
npm run build
MICROBE_HOST=127.0.0.1 MICROBE_PORT=4130 npm run start
```

`start-prod.sh`는 위 과정을 자동화합니다.

```bash
chmod +x start-prod.sh
./start-prod.sh
```

## LaunchAgent

현재 운영 등록 위치:

```txt
/Users/sg_mac/Library/LaunchAgents/com.sg_mac.microbe-growing.plist
```

수동 재시작:

```bash
launchctl kickstart -k gui/$(id -u)/com.sg_mac.microbe-growing
```

상태 확인:

```bash
launchctl print gui/$(id -u)/com.sg_mac.microbe-growing
curl -I http://127.0.0.1:4130/
curl http://127.0.0.1:4130/api/leaderboard
```

## 랭킹 DB

DB 파일:

```txt
/Users/sg_mac/microbe-growing/data/leaderboard.sqlite
```

백업 예시:

```bash
cp /Users/sg_mac/microbe-growing/data/leaderboard.sqlite \
  /Users/sg_mac/microbe-growing/data/leaderboard.sqlite.$(date +%Y%m%d-%H%M%S).bak
```

API:

```txt
GET  /api/leaderboard
POST /api/leaderboard
```

## Cloudflare Tunnel

현재 터널:

```txt
afc86512-488b-439f-bfb1-473e84b266eb
```

`/Users/sg_mac/.cloudflared/config.yml`의 ingress에 아래 항목이 필요합니다.

```yaml
- hostname: microbe.monosaccharide180.com
  service: http://127.0.0.1:4130
```

DNS 라우트 생성:

```bash
cloudflared tunnel route dns --overwrite-dns afc86512-488b-439f-bfb1-473e84b266eb microbe.monosaccharide180.com
```

cloudflared 재시작:

```bash
launchctl kickstart -k gui/$(id -u)/com.sg_mac.cloudflared
```

검증:

```bash
dig @1.1.1.1 +short microbe.monosaccharide180.com
curl -I https://microbe.monosaccharide180.com/
```
