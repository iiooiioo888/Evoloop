/**
 * Archify 簡化檢視器 — 將 architecture IR 渲染為 SVG 拓撲圖。
 */
export interface ArchifyNode {
  id: string;
  label: string;
  role?: string;
}

export interface ArchifyEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ArchifyIR {
  meta?: { title?: string; type?: string; locale?: string; source?: string };
  nodes: ArchifyNode[];
  edges: ArchifyEdge[];
}

const ROLE_COLORS: Record<string, string> = {
  frontend: '#007AFF',
  api: '#5856D6',
  service: '#34C759',
  data: '#FF9500',
  external: '#FF2D55',
};

function layoutNodes(nodes: ArchifyNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const cols = Math.max(2, Math.ceil(Math.sqrt(nodes.length)));
  const cellW = 168;
  const cellH = 72;
  nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.set(node.id, { x: 40 + col * cellW, y: 36 + row * cellH });
  });
  return positions;
}

export default function ArchifyViewer({ ir }: { ir: ArchifyIR }) {
  const positions = layoutNodes(ir.nodes);
  const posList = [...positions.values()];
  const width = Math.max(320, ...posList.map((p) => p.x + 140));
  const height = Math.max(200, ...posList.map((p) => p.y + 56));

  return (
    <div className="apple-card overflow-hidden">
      <div className="apple-card__head">
        <h2 className="apple-title">{ir.meta?.title ?? '架構圖'}</h2>
        <span className="text-[10px] font-bold text-[#8E8E93]">Archify IR</span>
      </div>
      <div className="apple-card__body apple-card__body--static overflow-x-auto p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-full"
          role="img"
          aria-label={ir.meta?.title ?? '架構圖'}
        >
          <defs>
            <marker
              id="archify-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="rgba(174,174,178,0.9)" />
            </marker>
          </defs>
          {ir.edges.map((edge, i) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            const x1 = from.x + 120;
            const y1 = from.y + 22;
            const x2 = to.x;
            const y2 = to.y + 22;
            const mx = (x1 + x2) / 2;
            return (
              <g key={`${edge.from}-${edge.to}-${i}`}>
                <path
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth="1.2"
                  markerEnd="url(#archify-arrow)"
                />
                {edge.label && (
                  <text
                    x={mx}
                    y={(y1 + y2) / 2 - 4}
                    textAnchor="middle"
                    fill="#8E8E93"
                    fontSize="9"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {ir.nodes.map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const color = ROLE_COLORS[node.role ?? 'service'] ?? ROLE_COLORS.service;
            return (
              <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
                <rect
                  x="0"
                  y="0"
                  width="120"
                  height="44"
                  rx="10"
                  fill="rgba(28,28,30,0.95)"
                  stroke={color}
                  strokeWidth="1.2"
                />
                <circle cx="12" cy="22" r="4" fill={color} />
                <text x="22" y="18" fill="#F5F5F7" fontSize="10" fontWeight="600">
                  {node.label.length > 14 ? `${node.label.slice(0, 13)}…` : node.label}
                </text>
                <text x="22" y="32" fill="#636366" fontSize="8">
                  {node.role ?? 'node'}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
