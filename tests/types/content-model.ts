import type { PublicNote, CollectionNote, GardenGraphNode, GraphEdge, Book } from '../../src/lib/content-model.ts';
import { inlineGraph, inlinePanelNotes } from '../../src/lib/graph-data.ts';

declare const note: PublicNote;
declare const collection: CollectionNote;
declare const nodes: GardenGraphNode[];
declare const edges: GraphEdge[];
declare const book: Book;
const rawThumbnail: string | null = note.thumbnail;
const imageWidth: number | undefined = collection.thumbnail?.width;
const map = inlineGraph(nodes, edges, { extra: ['path', 'mapKey'] });
const mapKey: string = map.nodes[0]!.mapKey;
const panel = inlinePanelNotes([note], edges);
const indexedEdge: [number, number] | undefined = panel.noteEdges[0];
void [rawThumbnail, imageWidth, mapKey, indexedEdge, book.rate];
// @ts-expect-error 조립 단계의 이미지는 파일 경로이며 이미지 메타데이터가 아니다.
note.thumbnail?.width;
// @ts-expect-error 패널에는 본문을 전달하지 않는다.
panel.notes[0]!.bodyHtml;
// @ts-expect-error 그래프에 없는 추가 필드는 선택할 수 없다.
inlineGraph(nodes, edges, { extra: ['bodyHtml'] });
// @ts-expect-error 추가 필드를 지정하지 않은 홈 데이터에는 mapKey가 없다.
inlineGraph(nodes, edges).nodes[0]!.mapKey;
