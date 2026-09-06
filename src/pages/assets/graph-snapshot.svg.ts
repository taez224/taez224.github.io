import type { APIRoute } from 'astro';
import { getGarden } from '../../lib/get-garden.mjs';
import { layoutGraph } from '../../graph/layout.mjs';
import { renderSnapshotSvg } from '../../graph/snapshot.mjs';

export const GET: APIRoute = async () => {
  const { nodes, edges } = await getGarden();
  const positions = layoutGraph(nodes, edges, { width: 1000, height: 640 });
  return new Response(renderSnapshotSvg(nodes, edges, positions, { width: 1000, height: 640 }), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
};
