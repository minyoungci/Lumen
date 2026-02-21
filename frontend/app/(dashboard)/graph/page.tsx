"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { GlassCard } from "@/components/shared/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: string;
  label: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  type: string;
}

const TYPE_COLORS: Record<string, string> = {
  research_note: "#0071e3",
  shared_post:   "#34c759",
  tag:           "#ff9f0a",
};
const TYPE_LABELS: Record<string, string> = {
  research_note: "Research Note",
  shared_post:   "Shared Post",
  tag:           "Tag",
};

function getRadius(type: string): number {
  if (type === "research_note") return 9;
  if (type === "shared_post") return 7;
  return 5;
}

function resolveId(d: string | GraphNode): string {
  return typeof d === "object" ? d.id : d;
}

export default function GraphPage() {
  const svgRef  = useRef<SVGSVGElement>(null);
  const simRef  = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);

  const [rawNodes, setRawNodes] = useState<GraphNode[]>([]);
  const [rawEdges, setRawEdges] = useState<GraphLink[]>([]);
  const [loading, setLoading]   = useState(true);

  const [selected, setSelected]     = useState<GraphNode | null>(null);
  const [search, setSearch]         = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    new Set(Object.keys(TYPE_COLORS))
  );

  /* ── Load data ─────────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    api.get("/graph")
      .then((res) => {
        if (!alive) return;
        setRawNodes(res.data?.data?.nodes ?? []);
        setRawEdges(res.data?.data?.edges ?? []);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  /* ── Build / rebuild D3 graph ──────────────────────────── */
  useEffect(() => {
    if (loading || !svgRef.current) return;

    /* filter */
    const q = search.toLowerCase();
    const nodes: GraphNode[] = rawNodes
      .filter((n) => activeTypes.has(n.type))
      .filter((n) => !q || n.label.toLowerCase().includes(q))
      .map((n) => ({ ...n })); // clone so D3 can mutate x/y

    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: GraphLink[] = rawEdges
      .filter((e) => {
        const s = resolveId(e.source as string | GraphNode);
        const t = resolveId(e.target as string | GraphNode);
        return nodeIds.has(s) && nodeIds.has(t);
      })
      .map((e) => ({ ...e }));

    /* dimensions */
    const el     = svgRef.current;
    const width  = el.clientWidth  || 900;
    const height = el.clientHeight || 600;

    /* wipe */
    const svg = d3.select(el);
    svg.selectAll("*").remove();
    simRef.current?.stop();

    if (nodes.length === 0) return;

    /* zoom container */
    const g = svg.append("g");
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.08, 5])
        .on("zoom", (ev) => g.attr("transform", ev.transform))
    );
    /* double-click resets zoom */
    svg.on("dblclick.zoom", () =>
      svg.transition().duration(500)
        .call(d3.zoom<SVGSVGElement, unknown>().transform, d3.zoomIdentity)
    );

    /* ── simulation ── */
    const sim = d3.forceSimulation<GraphNode>(nodes)
      .force("link",
        d3.forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(100)
          .strength(0.4)
      )
      .force("charge", d3.forceManyBody<GraphNode>().strength(-220))
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force("collision", d3.forceCollide<GraphNode>().radius((d) => getRadius(d.type) + 6));
    simRef.current = sim;

    /* ── edges ── */
    const linkSel = g.append("g").attr("class", "links")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", "rgba(0,0,0,0.10)")
      .attr("stroke-width", 1.5)
      .attr("stroke-linecap", "round");

    /* ── node groups ── */
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on("start", (ev, d) => {
        if (!ev.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on("end", (ev, d) => {
        if (!ev.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      });

    const nodeSel = g.append("g").attr("class", "nodes")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "grab")
      .call(drag);

    /* glow filter */
    const defs = svg.append("defs");
    const filter = defs.append("filter").attr("id", "glow");
    filter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
    const merge = filter.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    /* circle */
    nodeSel.append("circle")
      .attr("r", (d) => getRadius(d.type))
      .attr("fill", (d) => TYPE_COLORS[d.type] ?? "#8e8e93")
      .attr("stroke", "white")
      .attr("stroke-width", 2)
      .style("filter", "drop-shadow(0 2px 6px rgba(0,0,0,0.18))");

    /* pulse ring on hover */
    nodeSel
      .on("mouseenter", function () {
        d3.select(this).select("circle")
          .transition().duration(150)
          .attr("r", (d) => getRadius((d as GraphNode).type) + 3);
      })
      .on("mouseleave", function () {
        d3.select(this).select("circle")
          .transition().duration(150)
          .attr("r", (d) => getRadius((d as GraphNode).type));
      });

    /* label */
    nodeSel.append("text")
      .attr("dy", (d) => getRadius(d.type) + 13)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "#1d1d1f")
      .attr("pointer-events", "none")
      .attr("font-family", "Pretendard Variable, Pretendard, sans-serif")
      .text((d) => d.label.length > 22 ? d.label.slice(0, 20) + "…" : d.label);

    /* ── click: highlight neighbours ── */
    const highlight = (d: GraphNode | null) => {
      if (!d) {
        nodeSel.select("circle").attr("opacity", 1);
        linkSel.attr("opacity", 1).attr("stroke", "rgba(0,0,0,0.10)");
        return;
      }
      const neighbours = new Set<string>([d.id]);
      links.forEach((e) => {
        const s = resolveId(e.source as string | GraphNode);
        const t = resolveId(e.target as string | GraphNode);
        if (s === d.id) neighbours.add(t);
        if (t === d.id) neighbours.add(s);
      });
      nodeSel.select("circle")
        .attr("opacity", (n) => neighbours.has((n as GraphNode).id) ? 1 : 0.15);
      linkSel
        .attr("opacity", (e) => {
          const s = resolveId(e.source as string | GraphNode);
          const t = resolveId(e.target as string | GraphNode);
          return (s === d.id || t === d.id) ? 1 : 0.05;
        })
        .attr("stroke", (e) => {
          const s = resolveId(e.source as string | GraphNode);
          const t = resolveId(e.target as string | GraphNode);
          return (s === d.id || t === d.id) ? (TYPE_COLORS[d.type] ?? "#0071e3") : "rgba(0,0,0,0.10)";
        });
    };

    nodeSel.on("click", (ev, d) => {
      ev.stopPropagation();
      setSelected((prev) => {
        const next = prev?.id === d.id ? null : d;
        highlight(next);
        return next;
      });
    });
    svg.on("click", () => { setSelected(null); highlight(null); });

    /* ── tick ── */
    sim.on("tick", () => {
      linkSel
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);
      nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { sim.stop(); };
  }, [rawNodes, rawEdges, loading, activeTypes, search]);

  /* ── derived ── */
  const nodeTypes = [...new Set(rawNodes.map((n) => n.type))];
  const connCount = selected
    ? rawEdges.filter((e) => {
        const s = resolveId(e.source as string | GraphNode);
        const t = resolveId(e.target as string | GraphNode);
        return s === selected.id || t === selected.id;
      }).length
    : 0;

  return (
    <div className="flex h-[calc(100vh-110px)] flex-col gap-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Knowledge Graph</h1>
          <p className="text-sm text-text-muted">
            {rawNodes.length} 노드 · {rawEdges.length} 연결
          </p>
        </div>
        <input
          type="text"
          placeholder="🔍 노드 검색..."
          className="input w-48 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Graph canvas */}
        <div className="relative flex-1 overflow-hidden rounded-2xl border border-black/[0.07] bg-white/50 shadow-sm backdrop-blur-sm">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : rawNodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-3xl">🕸️</p>
              <p className="text-sm font-medium text-text-primary">그래프가 비어 있습니다</p>
              <p className="text-xs text-text-muted/70">Research Note 또는 태그를 추가해보세요.</p>
            </div>
          ) : (
            <svg
              ref={svgRef}
              className="h-full w-full select-none"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 50%, rgba(0,113,227,0.04) 0%, rgba(0,0,0,0) 70%)",
              }}
            />
          )}

          {/* ── Legend / type filter ── */}
          {!loading && rawNodes.length > 0 && (
            <div className="absolute bottom-4 left-4 rounded-2xl border border-black/[0.07] bg-white/90 p-3 shadow-sm backdrop-blur-md">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                유형 필터
              </p>
              {nodeTypes.map((type) => (
                <button
                  key={type}
                  onClick={() =>
                    setActiveTypes((prev) => {
                      const next = new Set(prev);
                      next.has(type) ? next.delete(type) : next.add(type);
                      return next;
                    })
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-all ${
                    activeTypes.has(type) ? "opacity-100" : "opacity-30"
                  }`}
                >
                  <div
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ background: TYPE_COLORS[type] ?? "#8e8e93" }}
                  />
                  <span className="text-text-secondary">
                    {TYPE_LABELS[type] ?? type}
                  </span>
                  <span className="ml-auto text-[10px] text-text-muted">
                    {rawNodes.filter((n) => n.type === type).length}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Hint */}
          {!loading && rawNodes.length > 0 && (
            <div className="absolute bottom-4 right-4 rounded-xl border border-black/[0.07] bg-white/80 px-2.5 py-1.5 text-[10px] text-text-muted backdrop-blur-sm">
              스크롤 확대 · 드래그 이동 · 더블클릭 초기화
            </div>
          )}
        </div>

        {/* ── Detail panel ── */}
        {selected && (
          <div className="w-60 flex-shrink-0">
            <GlassCard variant="elevated" padding="md">
              <div className="mb-3 flex items-start justify-between">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
                  style={{ background: TYPE_COLORS[selected.type] ?? "#8e8e93" }}
                >
                  {TYPE_LABELS[selected.type] ?? selected.type}
                </span>
                <button
                  onClick={() => setSelected(null)}
                  className="ml-2 text-xs text-text-muted hover:text-text-primary"
                >
                  ✕
                </button>
              </div>

              <h3 className="text-sm font-semibold leading-snug text-text-primary">
                {selected.label}
              </h3>

              <p className="mt-1 font-mono text-[10px] text-text-muted">
                {selected.id.slice(0, 12)}…
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-black/[0.03] px-3 py-2 text-center">
                  <p className="text-[10px] text-text-muted">연결 수</p>
                  <p className="text-xl font-bold text-text-primary">{connCount}</p>
                </div>
                <div className="rounded-xl bg-black/[0.03] px-3 py-2 text-center">
                  <p className="text-[10px] text-text-muted">유형</p>
                  <p className="text-xs font-medium text-text-primary mt-0.5">
                    {TYPE_LABELS[selected.type] ?? selected.type}
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        )}
      </div>
    </div>
  );
}
