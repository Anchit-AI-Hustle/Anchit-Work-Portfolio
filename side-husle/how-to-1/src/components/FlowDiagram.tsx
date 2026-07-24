// Dynamic flow diagram of the whole guide using React Flow. Auto-lays the steps
// in a vertical track, colour-coded by badge, with branch edges labelled.

import { useMemo } from 'react';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import type { MasterGuide } from '../types';

const COLOR: Record<string, string> = {
  start: '#2ee5ac', action: '#5b8cff', 'watch-out': '#ff8a3d', checkpoint: '#c9a96e', finish: '#ff5fd2',
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
        border: `2px solid ${COLOR[s.badge] || '#5b8cff'}`,
        background: activeId === s.id ? 'rgba(255,255,255,0.14)' : 'rgba(20,18,28,0.72)',
        color: '#f5f2ff', borderRadius: 14, padding: 10, width: 200, fontSize: 12,
        backdropFilter: 'blur(8px)',
      },
    })),
    [guide, activeId],
  );

  const edges: Edge[] = useMemo(
    () => guide.edges.map((e, i) => ({
      id: `e${i}`, source: e.from, target: e.to, label: e.label,
      animated: true, style: { stroke: '#6b62a8' }, labelStyle: { fill: '#c9c4e6', fontSize: 10 },
    })),
    [guide],
  );

  return (
    <div className="flow glass" style={{ height: Math.min(560, 140 + guide.steps.length * 108) }}>
      <ReactFlow
        nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onSelect?.(n.id)}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable
      >
        <Background color="#2a2540" gap={22} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
