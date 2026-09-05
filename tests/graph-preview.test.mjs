import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { graphTitleLines } from '../client/graph-focus.mjs';
const source = fs.readFileSync(new URL('../client/site.js', import.meta.url), 'utf8');
const fn = (name) => { const start=source.indexOf(`function ${name}(`); return source.slice(start,source.indexOf('\n}',start)+2); };

test('hover transitions only paint a separate label and leave the base layout untouched', () => {
  const labels=['a','b'].map(id=>({dataset:{node:id},transform:`translate(${id==='a'?20:140} 80)`,classList:{toggle(){}}}));
  const before=labels.map(label=>label.transform);
  let rendered=null, placements=0;
  const context=vm.createContext({graphHoverNode:null,graphFocusNode:null,document:{querySelectorAll:()=>labels},renderGraphHover:id=>{rendered=id;},layoutGraphLabels:()=>{placements++;}});
  vm.runInContext(fn('previewGraphNode')+'\n'+fn('updateGraphPreview'),context);
  for(let i=0;i<20;i++){context.previewGraphNode('a');context.previewGraphNode(null);context.previewGraphNode('b');}
  assert.equal(rendered,'b');assert.equal(placements,0);assert.deepEqual(labels.map(label=>label.transform),before);
  context.graphFocusNode='a';context.previewGraphNode(null);assert.equal(rendered,'a');
});

test('full hover title stays centered below its node, regardless of title length', () => {
  const node={id:'n',title:'아주 긴 노드 제목을 여러 줄로 보여주더라도 노드 바로 아래에 유지한다',degree:2,type:'permanent'};
  const context=vm.createContext({window:{matchMedia:()=>({matches:false})},graphTitleLines,DATA:{nodes:[node]},state:{positions:new Map([['n',{x:200,y:150}]]),graphTransform:{x:30,y:40,scale:1.5},selected:'n'},document:{querySelector:()=>({getScreenCTM:()=>({a:.5,b:0})})},nodeDisplayTitle:n=>n.title,escapeHtml:value=>value});
  vm.runInContext(fn('isGraphWorkspace')+'\n'+fn('graphNodeRadius')+'\n'+fn('wrapGraphLabel')+'\n'+fn('graphLabelMarkup'),context);
  const normal=context.graphLabelMarkup('n');const full=context.graphLabelMarkup('n',true);
  const transform=markup=>markup.match(/transform="([^"]+)"/)[1];
  assert.equal(transform(normal),transform(full));
  assert.ok(transform(full).startsWith('translate(330 '));
  assert.match(full,/text-anchor="middle"/);
  assert.ok((full.match(/<tspan/g)||[]).length>2);
});
