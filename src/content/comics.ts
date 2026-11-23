import type { ComicWork } from '../lib/comics.ts';

const manaOpening = '/comics/soft-mana-core/page-1-blog.webp';

// 오래된 작품부터 등록한다. 이미지와 이 항목을 추가하면 목록·작품 경로·앞뒤 이동이 함께 생긴다.
// 첫 장이 목록 표지다. 표지 파일을 따로 두지 않는다.
export const comics: readonly ComicWork[] = [
  {
    slug: 'soft-mana-core',
    title: '말랑한 마력핵',
    paper: '#ffffff',
    pages: [
      { src: manaOpening, width: 1080, height: 1350, alt: '말랑한 마력핵. 주인공이 한 손으로 연보라색 마력핵을 주무른다. 손 옆 작은 이름표에 ‘마력핵’이라고 적혀 있다.' },
      { src: '/comics/soft-mana-core/page-2.webp', width: 1080, height: 1350, alt: '주인공은 책상 앞에 앉아 모니터를 바라보며 계속 핵을 주무른다. ‘주무르면 마력이 찬다.’' },
      { src: '/comics/soft-mana-core/page-3.webp', width: 1080, height: 1350, alt: '말랑말랑하던 핵이 ‘팅!’ 하고 각진 결정으로 굳는다. ‘※ 마력이 다 차면 단단해진다.’' },
      { src: '/comics/soft-mana-core/page-4-blog.webp', width: 1080, height: 1350, alt: '주인공이 딱딱해진 핵을 두 손으로 잡고 뾰루퉁하게 내려다본다.' },
      { src: '/comics/soft-mana-core/page-5.webp', width: 1080, height: 1350, alt: '모니터에 ‘계속할까요?’가 뜬다. 주인공이 눈을 감고 두 손을 펴자 핵이 ‘둥실’ 떠오른다.' },
      { src: '/comics/soft-mana-core/page-6.webp', width: 1080, height: 1350, alt: '핵이 손바닥 위에서 빛난다. 뒤에 커다란 마법진이 펼쳐지고 주인공의 망토와 머리카락이 휘날린다.' },
      { src: '/comics/soft-mana-core/page-7.webp', width: 1080, height: 1350, alt: '키보드의 엔터 키 위에 조그만 마름모가 빛난다. ‘톡.’ 키가 한 번 눌린다.' },
      { src: '/comics/soft-mana-core/page-8.webp', width: 1080, height: 1350, alt: '주인공이 핵을 ‘꾹’ 눌러 본다. 다시 말랑해진 핵을 주무르며 눈을 감고 활짝 웃는다. ‘말랑말랑.’' }
    ]
  },
  {
    slug: 'id-photo',
    title: '사원증 사진',
    pages: [
      { src: '/comics/id-photo/cover.webp', width: 1080, height: 1350, alt: '사원증 사진. 선배의 폰 카메라 화면에 주인공이 비친다.' },
      { src: '/comics/id-photo/page-1.webp', width: 1080, height: 1350, alt: '사원증 사진. 옷깃을 잡은 주인공에게 선배가 찍을게요~ 한다.' },
      { src: '/comics/id-photo/page-2.webp', width: 1080, height: 1350, alt: '선배가 하나~ 둘~ 하고 세는 동안 주인공은 평소 표정으로 카메라를 본다.' },
      { src: '/comics/id-photo/page-3.webp', width: 1080, height: 1350, alt: '첫 찰칵. 주인공 얼굴이 근엄하게 굳는다.' },
      { src: '/comics/id-photo/page-4.webp', width: 1080, height: 1350, alt: '힘 좀 빼봐요~ 뺀건데요. 저 왼얼사라…' },
      { src: '/comics/id-photo/page-5.webp', width: 1080, height: 1350, alt: '선배가 반대쪽에서 다시 찍자 주인공의 표정이 굳는다.' },
      { src: '/comics/id-photo/page-6.webp', width: 1080, height: 1350, artworkLayer: 'gaze', alt: '오른쪽에서 선배의 “흠…” 소리가 들린다. 주인공의 눈길을 따라 점선이 이어진다.' },
      { src: '/comics/id-photo/page-7.webp', width: 1080, height: 1350, artworkLayer: 'badge', alt: '점선 끝에 선배의 사원증이 걸려 있다. 케이스에 비친 빛이 사진을 덮는다.' },
      { src: '/comics/id-photo/page-8.webp', width: 1080, height: 1350, alt: '선배의 사원증을 가까이 보니 턱을 괴고 찍은 옛 셀카가 보인다.' },
      { src: '/comics/id-photo/page-9.webp', width: 1080, height: 1350, alt: '주인공이 푸핫 웃자 오른쪽 폰에서 찰칵 소리가 난다.' },
      { src: '/comics/id-photo/page-10.webp', width: 1080, height: 1350, alt: '선배가 폰을 확인한다. 두 사람은 화면을 보고 웃는 사진을 고른다.' },
      { src: '/comics/id-photo/page-11.webp', width: 1080, height: 1350, alt: '책상 위 두 사원증. 선배의 옛 셀카와 주인공의 웃는 사진.' }
    ]
  }
];
