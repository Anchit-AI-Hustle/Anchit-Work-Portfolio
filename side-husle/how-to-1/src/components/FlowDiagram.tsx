// Dynamic flow diagram of the whole guide using React Flow. Auto-lays the steps
// in a vertical track, colour-coded by badge, with branch edges labelled.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import ReactFlow, { Background, Controls, type Edge, type Node, type ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';
import type { MasterGuide } from '../types';

// Warm, on-theme palette (black / orange / gold) — every badge stays in family
// but is still distinguishable.
const COLOR: Record<string, string> = {
  start: '#FFB736', action: '#FF6940', 'watch-out': '#FF4D1F', checkpoint: '#c9a96e', finish: '#FF8A3D',
};

export default function FlowDiagram({ guide, activeId, onSelect }: {
  guide: MasterGuide; activeId?: string; onSelect?: (id: string) => void;
}) {
  const nodes: Node[] = useMemo(
    () => guide.steps.map((s, i) => ({
      id: s.id,
      position: { x: (i % 2) * 220, y: i * 108 },
      data: { label: `${s.index}. ${s.title}` },
      style: {
        border: `2px solid ${COLOR[s.badge] || '#FF6940'}`,
        background: activeId === s.id ? 'rgba(255,105,64,0.18)' : 'rgba(22,18,14,0.78)',
        color: '#FBF5EC', borderRadius: 14, padding: 10, width: 200, fontSize: 12,
        backdropFilter: 'blur(8px)', cursor: 'pointer',
      },
    })),
    [guide, activeId],
  );

  const edges: Edge[] = useMemo(
    () => guide.edges.map((e, i) => ({
      id: `e${i}`, source: e.from, target: e.to, label: e.label,
      animated: true, style: { stroke: '#7a5a2e' }, labelStyle: { fill: '#c9a96e', fontSize: 10 },
    })),
    [guide],
  );

  // fitView only runs once on mount, so the map stays framed for whatever size
  // it had then. The stylesheet gives it a much shorter box on phones, which
  // cropped the first and last nodes — re-fit whenever the box actually resizes.
  const wrap = useRef<HTMLDivElement>(null);
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);
  useEffect(() => {
    if (!rf || !wrap.current || typeof ResizeObserver === 'undefined') return;
    const refit = () => rf.fitView({ padding: 0.16, duration: 160 });
    const ro = new ResizeObserver(refit);
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [rf]);
  // Re-frame when the step count changes too (a new guide = a new node set).
  useEffect(() => { rf?.fitView({ padding: 0.16 }); }, [rf, guide.steps.length]);

  return (
    // Height travels as a CSS custom property so the stylesheet can shrink the
    // map on narrow screens instead of it eating the whole viewport.
    <div
      ref={wrap}
      className="flow glass"
      style={{ '--flow-h': `${Math.min(560, 140 + guide.steps.length * 108)}px` } as CSSProperties}
    >
      <ReactFlow
        nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.16 }}
        /* default minZoom is 0.5, which clamps fitView on a short phone-sized
           box and crops the first/last nodes — let it zoom out far enough that
           the whole flow always fits, however many steps the guide has. */
        minZoom={0.25}
        onInit={setRf} proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onSelect?.(n.id)}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable
      >
        <Background color="#3a2c1a" gap={22} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
