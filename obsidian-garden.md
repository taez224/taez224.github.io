---
created: 2026-09-06
tags:
  - 프로젝트/obsidian-garden
  - 개발/프론트엔드
title: Obsidian Garden
project_id: obsidian-garden
status: active
started: 2026-09-05
ended: null
aliases:
  - 노트 정원
  - 공개 위키
---

# 🚀 Obsidian Garden

이 vault의 공개 가능한 부분(Slipbox, 발행한 글, 개발 노트, 책장)을 정적 사이트로 내보내는 프로젝트다. 공개 주소는 https://taez224.github.io/obsidian/ 이고, 소스는 이 폴더(`20_Projects/obsidian-garden`)의 Astro 프로젝트다.

## 🎯 목표

- 노트 지도(연결 그래프)가 사이트의 얼굴이 되게 한다. 홈 첫 화면은 라이브 그래프 히어로.
- 공개 범위는 vault 안에서 폴더·frontmatter로만 결정한다. 사이트 코드에 노트를 하나씩 등록하지 않는다.
- 새 노트를 vault에 쓰고 push하면 그대로 사이트에 반영된다. 사람이 할 일은 노트를 쓰고 `summary`를 다는 것뿐이다.

## 📌 현재 상태

2026-09-06 기준 리디자인과 Astro 이관을 마치고 main에 배포 중이다.

- 홈: 라이브 그래프 히어로 + About 한 문장, 대표 글 1편, 최근 기록 8개.
- 노트 지도: 무대 픽셀 크기로 배치, 제목은 확대와 무관하게 13px, 자리 후보 4개로 겹침 없이 배치, 호버는 선택의 예고편, 범례는 주제·허브 토글 필터. 데스크톱 패널·모바일 바텀시트.
- 리더: 메타 줄(종류 링크 · 날짜 · 읽는 시간 · 주제 · 발행처) → 제목 → 본문 → 이전·다음 편 카드와 목록 링크. 사이드바에 목차 레일, 연재 목록, 로컬 그래프, 참조·역참조.
- 공유·유입: 노트마다 OG 카드(빌드 생성), RSS 세 피드, Umami Cloud 방문 통계.
- 공개 범위: Slipbox 전체, 발행된 글, `Development/Concepts·Troubleshooting·Tools` 전체(2026-09-06 검토 목록에서 전체 공개로 전환), 책장.

## 🔜 다음 액션

- [ ] Umami 대시보드에서 한 주 데이터가 쌓인 뒤 어떤 노트가 읽히는지 한 번 본다.
- [ ] 도구 노트 두 편처럼 `summary`가 없는 공개 노트에 한 줄 요약을 단다.

보류 후보(조건이 오면 다시 본다):
- 노트가 100개를 넘으면 지도의 첫 화면이 빽빽해진다 → 2배 캔버스 + 확대 시 제목 노출, 또는 주제별 묶음 보기.
- 허브의 이웃이 20개를 넘으면 선택만으로 이웃 제목을 다 보이기 어렵다 → "펼쳐 보기"(전용 배치) 재검토.
- 첫 방문 때 글꼴이 바뀌는 순간이 거슬리면 폰트 셀프 호스팅.

## 🔧 기술 스택

- Astro 7 정적 출력, Content Layer 커스텀 로더(vault 파일 → 노트 컬렉션), `@astrojs/sitemap`.
- 바닐라 JS 모듈: 그래프 엔진(`src/graph/engine.mjs`), 결정적 힘 배치(`src/graph/layout.mjs`), 제스처, 검색 다이얼로그.
- 빌드 시 생성물: `data/site.json`·`search.json`, 그래프 스냅샷 SVG, OG 카드 PNG(`@resvg/resvg-js`).
- GitHub Pages, main push 시 GitHub Actions 배포. 로컬은 Node 22, `npm test`(node:test) + `npm run build`(`check-dist` 포함).

## 🚧 마일스톤 / 작업 기록

- 2026-09-05 첫 공개 빌드(정적 HTML 템플릿 + 빌드 스크립트).
- 2026-09-06 UI/UX 리뷰 → 시안 → 스펙·계획 → Astro 이관과 리디자인 구현·배포. 같은 날 지도 상호작용(제목 배치·호버·필터), 리더 내비, OG 카드, RSS, 방문 통계까지 반영.

## 🧾 근거

- 스펙·구현 계획: `20_Projects/obsidian-garden/docs/` (로컬 전용, Git 제외).
- 배포 워크플로: `.github/workflows/obsidian-garden-pages.yml`.
- 개념·도구 정리: [[그래프의 노드 제목이 겹치지 않게 놓는 방법]], [[정적 사이트의 OG 카드를 빌드 때 만들고 Umami로 방문을 센다]].
- 지도 제목 실측(2026-09-06, 무대 830×598px·노드 33·간선 87): 두 줄 제목 상자 면적 합이 무대의 58%, 밀어내기 후처리 뒤에도 겹침 28쌍, 캔버스 2배(약 1660×1200)에서 0. 제목 13px 고정·노출 문턱 1.2배 기준으로 맞춤에서 허브 3개, 1.25배 29개, 1.95배 33개 전부 노출. 이웃 15개 허브는 맞춤 11개, 1.4배 14개. 첫 화면 전체 노출은 22개가 나와 빽빽해 되돌림 → 보류 후보 '2배 캔버스'의 근거.

## 🌱 파생된 결과물

- Slipbox:
- Blog:
- Career:

## 📂 프로젝트 파일

![[_project-files.base#📂 이 폴더 노트]]

## 📎 외부 링크

- 공개 사이트: https://taez224.github.io/obsidian/
- 저장소: https://github.com/taez224/obsidian
