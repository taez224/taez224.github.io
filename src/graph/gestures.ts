import type { Point, Transform } from './types.ts';
interface Pointer extends Point { id: number; touch?: boolean; onNode?: boolean }

export function createGraphGesture({ getMinScale = () => .65, maxScale = 3.2 }: { getMinScale?: () => number; maxScale?: number } = {}) {
  const pointers = new Map<number, Point>();
  let baseline: (Point & { distance: number; transform: Transform }) | null = null;
  let current: Transform | null = null;
  let suppressClick = false;
  const measure = () => {
    const [a, b] = [...pointers.values()];
    return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }
      : { x: a.x, y: a.y, distance: 0 };
  };
  const rebase = () => { baseline = pointers.size ? { ...measure(), transform: { ...current! } } : null; };
  return {
    down(pointer: Pointer, transform: Transform) {
      if (!pointers.size) suppressClick = false;
      if (!pointer.touch && pointer.onNode) return false;
      pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
      current = { ...transform };
      rebase();
      if (pointers.size > 1) suppressClick = true;
      return true;
    },
    move(pointer: Pointer, threshold = 3) {
      if (!pointers.has(pointer.id)) return null;
      pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
      const now = measure();
      const before = baseline!.transform;
      if (pointers.size > 1) {
        const scale = Math.max(getMinScale(), Math.min(maxScale, before.scale * now.distance / baseline!.distance));
        current = {
          scale,
          x: now.x - (baseline!.x - before.x) / before.scale * scale,
          y: now.y - (baseline!.y - before.y) / before.scale * scale
        };
        suppressClick = true;
      } else {
        const dx = now.x - baseline!.x, dy = now.y - baseline!.y;
        if (Math.hypot(dx, dy) <= threshold && !suppressClick) return null;
        current = { ...before, x: before.x + dx, y: before.y + dy };
        suppressClick = true;
      }
      return { ...current };
    },
    end(id: number) {
      if (!pointers.delete(id)) return;
      rebase();
    },
    active: () => pointers.size > 0,
    shouldSuppressClick: () => suppressClick
  };
}
