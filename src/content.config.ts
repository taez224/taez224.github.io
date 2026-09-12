import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { noteDataSchema } from './lib/content-model.ts';
import { vaultLoader, bookLoader } from './loaders/vault.ts';

export const collections = {
  notes: defineCollection({
    loader: vaultLoader(),
    schema: ({ image }) => noteDataSchema.extend({ thumbnail: image().nullable().optional() }).loose()
  }),
  books: defineCollection({ loader: bookLoader(), schema: z.object({ slug: z.string(), title: z.string() }).loose() })
};
