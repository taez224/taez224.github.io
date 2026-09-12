import { z } from 'astro/zod';
import type { ImageMetadata } from 'astro';
import type { DevelopmentCategory } from './development.ts';
import type { NoteKind } from './kinds.ts';

const heading = z.object({ id: z.string(), level: z.number(), title: z.string() });

// 기존 컬렉션 검증과 조립 결과 타입이 공유하는 필드다.
export const noteDataSchema = z.object({
  path: z.string(), slug: z.string(), url: z.string(),
  kind: z.enum(['blog', 'slipbox', 'development']),
  category: z.enum(['Concepts', 'Troubleshooting', 'Tools']).nullable(),
  title: z.string(), displayTitle: z.string(), fileTitle: z.string(),
  status: z.string(), type: z.string(),
  contentMode: z.enum(['full', 'external']).default('full'),
  externalPublisher: z.string().default(''), published: z.string().default(''),
  tags: z.array(z.string()), publicTags: z.array(z.string()), topic: z.string(),
  date: z.string(), updated: z.string().default(''), summary: z.string(), summaryIsExplicit: z.boolean(),
  thumbnail: z.string().nullable().optional(),
  thumbnailStyle: z.enum(['plain', 'soft']).default('plain'),
  articleCards: z.array(z.object({ url: z.string(), title: z.string(), caption: z.string() })).default([]),
  headings: z.array(heading), publishedUrl: z.string(), bodyText: z.string(),
  outgoing: z.array(z.string()), incoming: z.array(z.string())
});

export type NoteData = z.infer<typeof noteDataSchema>;
export const publicNoteSchema = noteDataSchema.extend({
  thumbnail: z.string().nullable(), publication: z.string(), isEntry: z.boolean(),
  aliases: z.array(z.string()), readingMinutes: z.number(), topicTag: z.string(), bodyHtml: z.string()
});
export type PublicNote = z.infer<typeof publicNoteSchema>;

// 파일 경로를 Astro가 이미지 정보로 바꾼 뒤의 컬렉션 데이터다.
export type CollectionNote = Omit<PublicNote, 'bodyHtml' | 'thumbnail'> & { thumbnail?: ImageMetadata | null };

export const bookSchema = z.object({
  path: z.string(), fileTitle: z.string(), title: z.string(), slug: z.string(), url: z.string(),
  author: z.string(), publisher: z.string(), category: z.string(), publishDate: z.string(), coverUrl: z.string(),
  status: z.string(), startDate: z.string(), finishDate: z.string(), rate: z.number(),
  tier: z.enum(['S', 'A', 'B', 'C', 'D', '미분류']), note: z.string(), created: z.string()
});
export type Book = z.infer<typeof bookSchema>;

export interface Point { x: number; y: number }
export interface GraphEdge { source: string; target: string }
export type TopicFold = Record<string, string>;

export interface GraphNode {
  id: string; title: string; displayTitle?: string; url: string; type: string; topic: string;
  degree: number; isEntry: boolean;
}
export interface GardenGraphNode extends GraphNode {
  slug: string; mapKey: string; path: string; kind: NoteKind; status: string;
  tags: string[]; date: string; summary: string; summaryIsExplicit: boolean;
  headings: NoteData['headings']; excerpt: string; topicTag: string;
}

export interface PanelNote {
  path: string; title: string; url: string; kind: NoteKind; category: DevelopmentCategory | null;
  date: string; publicTags: string[]; summary: string; summaryIsExplicit: boolean;
}
export interface PanelData {
  notes: PanelNote[]; noteEdges: [number, number][]; topicFold: TopicFold;
}
