// Dynamic flow diagram of the whole guide using React Flow. Auto-lays the steps
// in a vertical track, colour-coded by badge, with branch edges labelled.

import { useMemo } from 'react';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
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

  return (
    <div className="flow glass" style={{ height: Math.min(560, 140 + guide.steps.length * 108) }}>
      <ReactFlow
        nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onSelect?.(n.id)}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable
      >
        <Background color="#3a2c1a" gap={22} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
