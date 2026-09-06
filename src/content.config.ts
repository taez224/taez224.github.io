import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { vaultLoader, bookLoader } from './loaders/vault.mjs';

const heading = z.object({ id: z.string(), level: z.number(), title: z.string() });

export const collections = {
  notes: defineCollection({
    loader: vaultLoader(),
    schema: z.object({
      path: z.string(), slug: z.string(), url: z.string(),
      kind: z.enum(['blog', 'slipbox', 'development']),
      category: z.enum(['Concepts', 'Troubleshooting', 'Tools']).nullable(),
      title: z.string(), displayTitle: z.string(), fileTitle: z.string(),
      status: z.string(), type: z.string(),
      tags: z.array(z.string()), publicTags: z.array(z.string()), topic: z.string(),
      date: z.string(), summary: z.string(), summaryIsExplicit: z.boolean(),
      headings: z.array(heading), publishedUrl: z.string(), bodyText: z.string(),
      outgoing: z.array(z.string()), incoming: z.array(z.string())
    }).passthrough()
  }),
  books: defineCollection({ loader: bookLoader(), schema: z.object({ slug: z.string(), title: z.string() }).passthrough() })
};
