import { mountHeroGraph } from './hero-graph.ts';

const box = document.querySelector<HTMLElement>('.hero-graph[data-graph]');
if (box) mountHeroGraph(box, window);
