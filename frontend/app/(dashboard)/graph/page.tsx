"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ForwardRefExoticComponent,
  type KeyboardEvent,
  type RefAttributes,
} from "react";
import * as THREE from "three";
import { GlassCard } from "@/components/shared/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { useProjectStore } from "@/store/project";

interface GraphNode {
  id: string;
  type: string;
  label: string;
  author_id?: string | null;
  project_id?: string | null;
  updated_at?: string | null;
  size?: number;
  importance?: number;
  centrality?: number;
  cluster_id?: string | null;
  x?: number;
  y?: number;
  z?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  weight: number;
  reasons: string[];
  reason_primary?: string;
  style_hint?: "semantic" | "tag" | "contextual";
  distance?: number;
}

interface GraphMeta {
  total_nodes_before_trim: number;
  total_edges_before_trim: number;
  truncated: boolean;
  applied_limit_nodes: number;
  applied_min_weight: number;
  applied_knowledge_min_score: number;
  applied_edge_policy?: string;
  embedding_provider?: string;
  embedding_model?: string;
  embedding_enabled?: boolean;
  cluster_count?: number;
  dominant_cluster_id?: string | null;
  density_score?: number;
}

type EdgePolicy = "hybrid" | "tag_ai" | "tag_only" | "ai_only";
type GraphPresetId = "recommended" | "explore" | "focus" | "custom";

interface GraphRefHandle {
  cameraPosition?: (
    position: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    ms?: number
  ) => void;
  d3Force?: (forceName: string) => {
    distance?: (value: number | ((link: GraphLink) => number)) => void;
    strength?: (value: number | ((link: GraphLink) => number)) => void;
  } | null;
  d3VelocityDecay?: (value: number) => void;
  d3AlphaDecay?: (value: number) => void;
}

type ForceGraph3DComponent = ForwardRefExoticComponent<
  Record<string, unknown> & RefAttributes<GraphRefHandle>
>;

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
}) as unknown as ForceGraph3DComponent;

const TYPE_COLORS: Record<string, string> = {
  research_note: "#3b82f6",
  shared_post: "#22c55e",
  tag: "#f59e0b",
};

const EDGE_COLORS: Record<string, string> = {
  semantic: "#06b6d4",
  tag: "#f59e0b",
  contextual: "#a78bfa",
};

const TYPE_LABELS: Record<string, string> = {
  research_note: "Research Note",
  shared_post: "Shared Post",
  tag: "Tag",
};

const EDGE_LABELS: Record<string, string> = {
  semantic: "AI similarity",
  tag: "Tag link",
  contextual: "Context link",
};

const REASON_LABELS: Record<string, string> = {
  has_tag: "Direct tag match",
  shared_tag: "Shared tag",
  same_author: "Same author",
  same_project: "Same project",
  text_similarity: "Text similarity",
  semantic_similarity: "Knowledge similarity",
};

const REASON_BADGE_STYLE: Record<string, string> = {
  semantic_similarity: "bg-sky-100 text-sky-700 border-sky-200",
  has_tag: "bg-amber-100 text-amber-700 border-amber-200",
  shared_tag: "bg-amber-100 text-amber-700 border-amber-200",
  text_similarity: "bg-violet-100 text-violet-700 border-violet-200",
  same_author: "bg-emerald-100 text-emerald-700 border-emerald-200",
  same_project: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

function getNodeId(node: string | GraphNode): string {
  return typeof node === "string" ? node : node.id;
}

function edgeKey(link: GraphLink): string {
  const source = getNodeId(link.source);
  const target = getNodeId(link.target);
  return source < target ? `${source}::${target}` : `${target}::${source}`;
}

function edgeKeyFromIds(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length !== 6) {
    return `rgba(200, 200, 200, ${alpha})`;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function resolveNodePath(node: GraphNode): string {
  if (node.type === "research_note") {
    return `/research-notes/${node.id}`;
  }
  if (node.type === "shared_post") {
    return `/shared/feed/${node.id}`;
  }
  return "/graph";
}

function makeNodeDotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const cx = 48;
  const cy = 48;
  const outer = ctx.createRadialGradient(cx, cy, 6, cx, cy, 40);
  outer.addColorStop(0, "rgba(255,255,255,0.95)");
  outer.addColorStop(0.45, "rgba(255,255,255,0.35)");
  outer.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(cx, cy, 40, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.beginPath();
  ctx.arc(cx, cy, 7.4, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

function centroid(nodes: GraphNode[]): { x: number; y: number; z: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let count = 0;
  for (const node of nodes) {
    sx += node.x ?? 0;
    sy += node.y ?? 0;
    sz += node.z ?? 0;
    count += 1;
  }
  return {
    x: sx / count,
    y: sy / count,
    z: sz / count,
  };
}

function shortestPathNodeIds(
  startId: string,
  targetId: string,
  adjacency: Map<string, Set<string>>
): string[] {
  if (startId === targetId) return [startId];
  if (!adjacency.has(startId) || !adjacency.has(targetId)) return [];

  const queue: string[] = [startId];
  const prev = new Map<string, string | null>();
  prev.set(startId, null);

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const neighbors = adjacency.get(current);
    if (!neighbors) continue;

    for (const next of neighbors) {
      if (prev.has(next)) continue;
      prev.set(next, current);
      if (next === targetId) {
        const path: string[] = [targetId];
        let cursor: string | null = current;
        while (cursor) {
          path.push(cursor);
          cursor = prev.get(cursor) ?? null;
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }

  return [];
}

export default function GraphPage() {
  const { currentProjectId } = useProjectStore();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<GraphRefHandle | null>(null);
  const introPlayedRef = useRef(false);

  const [rawNodes, setRawNodes] = useState<GraphNode[]>([]);
  const [rawEdges, setRawEdges] = useState<GraphLink[]>([]);
  const [meta, setMeta] = useState<GraphMeta | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pathTargetId, setPathTargetId] = useState<string | null>(null);

  const [minWeight, setMinWeight] = useState(0.28);
  const [expandLevel, setExpandLevel] = useState<1 | 2 | 3>(1);
  const [limitNodes, setLimitNodes] = useState(450);
  const [includeTextSimilarity, setIncludeTextSimilarity] = useState(true);
  const [includeKnowledgeEdges, setIncludeKnowledgeEdges] = useState(true);
  const [knowledgeMinScore, setKnowledgeMinScore] = useState(0.35);
  const [edgePolicy, setEdgePolicy] = useState<EdgePolicy>("tag_ai");
  const [focusDepth, setFocusDepth] = useState<1 | 2>(1);
  const [activePreset, setActivePreset] = useState<GraphPresetId>("recommended");

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(true);

  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    new Set(Object.keys(TYPE_COLORS))
  );

  const [canvasSize, setCanvasSize] = useState({ width: 980, height: 680 });
  const [isMobile, setIsMobile] = useState(false);
  const dotTextureRef = useRef<ReturnType<typeof makeNodeDotTexture>>(null);

  useEffect(() => {
    if (dotTextureRef.current) return;
    dotTextureRef.current = makeNodeDotTexture();
    return () => {
      dotTextureRef.current?.dispose();
      dotTextureRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hostRef.current) return;

    const element = hostRef.current;
    const resize = () => {
      const width = Math.max(320, element.clientWidth);
      const height = Math.max(320, element.clientHeight);
      setCanvasSize({ width, height });
      setIsMobile(width < 980);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get("/graph", {
        params: {
          project_id: currentProjectId ?? undefined,
          min_weight: minWeight,
          expand_level: expandLevel,
          limit_nodes: limitNodes,
          include_text_similarity: includeTextSimilarity,
          include_knowledge_edges: includeKnowledgeEdges,
          knowledge_min_score: knowledgeMinScore,
          edge_policy: edgePolicy,
        },
      });

      setRawNodes(response.data?.data?.nodes ?? []);
      setRawEdges(response.data?.data?.edges ?? []);
      setMeta(response.data?.data?.meta ?? null);
      introPlayedRef.current = false;
    } catch {
      setRawNodes([]);
      setRawEdges([]);
      setMeta(null);
      setError("The knowledge graph could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [currentProjectId, minWeight, expandLevel, limitNodes, includeTextSimilarity, includeKnowledgeEdges, knowledgeMinScore, edgePolicy]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const nodeTypes = useMemo(
    () => Array.from(new Set(rawNodes.map((node) => node.type))),
    [rawNodes]
  );

  const query = search.trim().toLowerCase();

  const filteredNodes = useMemo(() => {
    return rawNodes
      .filter((node) => activeTypes.has(node.type))
      .filter((node) => !query || node.label.toLowerCase().includes(query));
  }, [rawNodes, activeTypes, query]);

  const filteredNodeIdSet = useMemo(
    () => new Set(filteredNodes.map((node) => node.id)),
    [filteredNodes]
  );

  const filteredEdges = useMemo(() => {
    return rawEdges.filter((edge) => {
      const source = getNodeId(edge.source);
      const target = getNodeId(edge.target);
      return filteredNodeIdSet.has(source) && filteredNodeIdSet.has(target);
    });
  }, [rawEdges, filteredNodeIdSet]);

  const rawNodeById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of rawNodes) {
      map.set(node.id, node);
    }
    return map;
  }, [rawNodes]);

  const visibleNodeById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of filteredNodes) {
      map.set(node.id, node);
    }
    return map;
  }, [filteredNodes]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of filteredNodes) {
      map.set(node.id, new Set<string>());
    }
    for (const edge of filteredEdges) {
      const source = getNodeId(edge.source);
      const target = getNodeId(edge.target);
      if (!map.has(source) || !map.has(target)) continue;
      map.get(source)?.add(target);
      map.get(target)?.add(source);
    }
    return map;
  }, [filteredNodes, filteredEdges]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return rawNodeById.get(selectedNodeId) ?? null;
  }, [selectedNodeId, rawNodeById]);

  const focusNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();

    const visited = new Set<string>([selectedNodeId]);
    let frontier: string[] = [selectedNodeId];
    for (let depth = 0; depth < focusDepth; depth += 1) {
      const next: string[] = [];
      for (const nodeId of frontier) {
        const neighbors = adjacency.get(nodeId);
        if (!neighbors) continue;
        for (const neighbor of neighbors) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return visited;
  }, [selectedNodeId, adjacency, focusDepth]);

  const selectedDirectEdgeKeys = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const keys = new Set<string>();
    for (const edge of filteredEdges) {
      const source = getNodeId(edge.source);
      const target = getNodeId(edge.target);
      if (source === selectedNodeId || target === selectedNodeId) {
        keys.add(edgeKey(edge));
      }
    }
    return keys;
  }, [selectedNodeId, filteredEdges]);

  const pathNodeIds = useMemo(() => {
    if (!selectedNodeId || !pathTargetId) return [];
    return shortestPathNodeIds(selectedNodeId, pathTargetId, adjacency);
  }, [selectedNodeId, pathTargetId, adjacency]);

  const pathEdgeKeys = useMemo(() => {
    const keys = new Set<string>();
    for (let idx = 1; idx < pathNodeIds.length; idx += 1) {
      keys.add(edgeKeyFromIds(pathNodeIds[idx - 1], pathNodeIds[idx]));
    }
    return keys;
  }, [pathNodeIds]);

  const selectedConnections = useMemo(() => {
    if (!selectedNodeId) return [];

    return filteredEdges
      .filter((edge) => {
        const source = getNodeId(edge.source);
        const target = getNodeId(edge.target);
        return source === selectedNodeId || target === selectedNodeId;
      })
      .map((edge) => {
        const source = getNodeId(edge.source);
        const target = getNodeId(edge.target);
        const peerId = source === selectedNodeId ? target : source;
        return {
          peerId,
          peerLabel: visibleNodeById.get(peerId)?.label ?? rawNodeById.get(peerId)?.label ?? peerId,
          peerType: visibleNodeById.get(peerId)?.type ?? rawNodeById.get(peerId)?.type ?? "unknown",
          peerNode: visibleNodeById.get(peerId) ?? rawNodeById.get(peerId) ?? null,
          weight: edge.weight,
          reasons: edge.reasons,
          reasonPrimary: edge.reason_primary,
          styleHint: edge.style_hint,
        };
      })
      .sort((a, b) => b.weight - a.weight);
  }, [selectedNodeId, filteredEdges, visibleNodeById, rawNodeById]);

  const searchMatches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return filteredNodes
      .filter((node) => node.label.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [search, filteredNodes]);

  const searchMatchIds = useMemo(() => new Set(searchMatches.map((node) => node.id)), [searchMatches]);
  const typeCountMap = useMemo(() => {
    const next: Record<string, number> = {};
    for (const node of filteredNodes) {
      next[node.type] = (next[node.type] ?? 0) + 1;
    }
    return next;
  }, [filteredNodes]);

  const graphData = useMemo(
    () => ({ nodes: filteredNodes, links: filteredEdges }),
    [filteredNodes, filteredEdges]
  );

  const lodMode = useMemo(() => {
    if (filteredNodes.length > 800) return "ultra";
    if (filteredNodes.length > 400) return "dense";
    return "full";
  }, [filteredNodes.length]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (rawNodeById.has(selectedNodeId)) return;
    setSelectedNodeId(null);
    setPathTargetId(null);
  }, [selectedNodeId, rawNodeById]);

  useEffect(() => {
    if (edgePolicy !== "hybrid" && includeTextSimilarity) {
      setIncludeTextSimilarity(false);
    }
  }, [edgePolicy, includeTextSimilarity]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const linkForce = graph.d3Force?.("link");
    if (linkForce && typeof linkForce.distance === "function") {
      linkForce.distance((link: GraphLink) => {
        if (typeof link.distance === "number") return link.distance;
        return 120;
      });
    }
    if (linkForce && typeof linkForce.strength === "function") {
      linkForce.strength((link: GraphLink) => {
        return Math.max(0.05, Math.min(0.95, link.weight ?? 0.3));
      });
    }

    const charge = graph.d3Force?.("charge");
    if (charge && typeof charge.strength === "function") {
      const strength =
        filteredNodes.length > 950
          ? -16
          : filteredNodes.length > 700
            ? -24
            : filteredNodes.length > 450
              ? -36
              : -54;
      charge.strength(strength);
    }

    if (typeof graph.d3VelocityDecay === "function") {
      graph.d3VelocityDecay(filteredNodes.length > 700 ? 0.36 : 0.28);
    }
    if (typeof graph.d3AlphaDecay === "function") {
      graph.d3AlphaDecay(filteredNodes.length > 700 ? 0.045 : 0.032);
    }
  }, [filteredNodes.length]);

  const focusNode = useCallback((node: GraphNode, duration = 900) => {
    const graph = graphRef.current;
    if (!graph || typeof graph.cameraPosition !== "function") return;

    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const z = node.z ?? 0;

    const centrality = typeof node.centrality === "number" ? node.centrality : 0;
    const distanceBase = isMobile ? 118 : 92;
    const distance = Math.max(72, distanceBase - (centrality * 16));
    const magnitude = Math.sqrt((x * x) + (y * y) + (z * z)) || 1;
    const ratio = 1 + (distance / magnitude);

    graph.cameraPosition(
      { x: x * ratio, y: y * ratio, z: z * ratio },
      { x, y, z },
      duration
    );
  }, [isMobile]);

  useEffect(() => {
    if (loading || filteredNodes.length === 0 || introPlayedRef.current) return;
    const graph = graphRef.current;
    if (!graph || typeof graph.cameraPosition !== "function") return;

    introPlayedRef.current = true;
    const introTimer = window.setTimeout(() => {
      graph.cameraPosition?.({ x: 0, y: 0, z: 520 }, { x: 0, y: 0, z: 0 }, 560);

      const targetNodes =
        meta?.dominant_cluster_id
          ? filteredNodes.filter((node) => node.cluster_id === meta.dominant_cluster_id)
          : filteredNodes.slice(0, 28);
      const center = centroid(targetNodes.length > 0 ? targetNodes : filteredNodes.slice(0, 24));
      const zoomTimer = window.setTimeout(() => {
        graph.cameraPosition?.(
          { x: center.x * 1.12, y: center.y * 1.12, z: (center.z * 1.12) + 148 },
          center,
          1000
        );
      }, 560);

      window.setTimeout(() => window.clearTimeout(zoomTimer), 1900);
    }, 240);

    return () => window.clearTimeout(introTimer);
  }, [loading, filteredNodes, meta?.dominant_cluster_id]);

  useEffect(() => {
    if (!selectedNodeId) {
      setMobileSheetOpen(false);
      return;
    }
    if (isMobile) {
      setMobileSheetOpen(true);
    }
  }, [selectedNodeId, isMobile]);

  const focusFirstMatch = useCallback(() => {
    const first = searchMatches[0];
    if (!first) return;
    setSelectedNodeId(first.id);
    setPathTargetId(null);
    focusNode(first);
  }, [searchMatches, focusNode]);

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    focusFirstMatch();
  };

  const pickSearchResult = (node: GraphNode) => {
    setSearch(node.label);
    setSelectedNodeId(node.id);
    setPathTargetId(null);
    focusNode(node);
  };

  const toggleType = (type: string) => {
    setActiveTypes((previous) => {
      const next = new Set(previous);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const increaseLimit = () => {
    setLimitNodes((previous) => Math.min(1200, previous + 300));
  };

  const applyPreset = useCallback((preset: GraphPresetId) => {
    if (preset === "recommended") {
      setMinWeight(0.28);
      setExpandLevel(2);
      setFocusDepth(1);
      setEdgePolicy("tag_ai");
      setKnowledgeMinScore(0.35);
      setIncludeKnowledgeEdges(true);
      setIncludeTextSimilarity(false);
      setLimitNodes(450);
      setActivePreset("recommended");
      return;
    }

    if (preset === "explore") {
      setMinWeight(0.22);
      setExpandLevel(3);
      setFocusDepth(2);
      setEdgePolicy("hybrid");
      setKnowledgeMinScore(0.28);
      setIncludeKnowledgeEdges(true);
      setIncludeTextSimilarity(true);
      setLimitNodes(750);
      setActivePreset("explore");
      return;
    }

    if (preset === "focus") {
      setMinWeight(0.40);
      setExpandLevel(1);
      setFocusDepth(1);
      setEdgePolicy("ai_only");
      setKnowledgeMinScore(0.5);
      setIncludeKnowledgeEdges(true);
      setIncludeTextSimilarity(false);
      setLimitNodes(360);
      setActivePreset("focus");
      return;
    }

    setActivePreset("custom");
  }, []);

  const resetToFriendlyDefault = useCallback(() => {
    setSearch("");
    setSelectedNodeId(null);
    setPathTargetId(null);
    setActiveTypes(new Set(Object.keys(TYPE_COLORS)));
    applyPreset("recommended");
  }, [applyPreset]);

  const graphHint =
    lodMode === "ultra"
      ? "Ultra dense mode: minimal labels and particles"
      : lodMode === "dense"
        ? "Dense mode: reduced visual effects"
        : "Standard mode";
  const presetDescription =
    activePreset === "recommended"
      ? "Recommended preset: balanced readability"
      : activePreset === "explore"
        ? "Explore preset: widen the network for browsing"
        : activePreset === "focus"
          ? "Focus preset: emphasize the strongest links"
          : "Custom preset";
  const embeddingProvider = (meta?.embedding_provider ?? "unknown").toString();
  const embeddingConnected = Boolean(meta?.embedding_enabled);
  const embeddingBadgeClass = embeddingProvider === "openai" && embeddingConnected
    ? "border-emerald-300/50 bg-emerald-100/80 text-emerald-700"
    : "border-amber-300/50 bg-amber-100/80 text-amber-700";
  const embeddingLabel = embeddingConnected
    ? `Embedding ${embeddingProvider.toUpperCase()}`
    : "Embedding fallback";

  const openNodeFromConnection = (node: GraphNode | null) => {
    if (!node) return;
    setSelectedNodeId(node.id);
    setPathTargetId(node.id);
    focusNode(node, 780);
  };

  const panel = selectedNode ? (
    <div className="space-y-3">
      <GlassCard variant="elevated" padding="md" className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span
              className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: TYPE_COLORS[selectedNode.type] ?? "#9ca3af" }}
            >
              {TYPE_LABELS[selectedNode.type] ?? selectedNode.type}
            </span>
            <h3 className="mt-2 text-sm font-semibold text-text-primary">{selectedNode.label}</h3>
            <p className="mt-1 font-mono text-[10px] text-text-muted">{selectedNode.id.slice(0, 16)}...</p>
          </div>
          <button
            onClick={() => {
              setSelectedNodeId(null);
              setPathTargetId(null);
            }}
            className="rounded px-2 py-1 text-xs text-text-muted hover:bg-black/[0.05]"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-black/[0.03] px-3 py-2 text-center">
            <p className="text-[10px] text-text-muted">Connections</p>
            <p className="text-lg font-semibold text-text-primary">{selectedConnections.length}</p>
          </div>
          <div className="rounded-xl bg-black/[0.03] px-3 py-2 text-center">
            <p className="text-[10px] text-text-muted">Centrality</p>
            <p className="text-lg font-semibold text-text-primary">
              {typeof selectedNode.centrality === "number" ? selectedNode.centrality.toFixed(2) : "0.00"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={resolveNodePath(selectedNode)}
            className="rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-xs text-text-secondary hover:bg-white"
          >
            Open source
          </Link>
          <button
            onClick={() => focusNode(selectedNode, 650)}
            className="rounded-lg border border-black/10 bg-white/80 px-3 py-1.5 text-xs text-text-secondary hover:bg-white"
          >
            Refocus
          </button>
        </div>
      </GlassCard>

      <GlassCard variant="default" padding="md" className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-text-primary">Connection detail</p>
          {pathTargetId && pathNodeIds.length > 1 ? (
            <span className="text-[10px] text-text-muted">Path length {pathNodeIds.length - 1}</span>
          ) : null}
        </div>

        {selectedConnections.length === 0 ? (
          <p className="text-xs text-text-muted">No connected nodes match the current filters.</p>
        ) : (
          selectedConnections.slice(0, 16).map((row) => (
            <button
              key={`${selectedNode.id}:${row.peerId}`}
              onClick={() => openNodeFromConnection(row.peerNode)}
              className="w-full rounded-lg border border-black/[0.06] bg-white/80 px-2.5 py-2 text-left transition-colors hover:bg-white"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-text-primary">{row.peerLabel}</p>
                <span className="text-[10px] text-text-muted">{(row.weight * 100).toFixed(0)}%</span>
              </div>
              <p className="mt-0.5 text-[10px] text-text-muted">
                {TYPE_LABELS[row.peerType] ?? row.peerType}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {row.reasons.slice(0, 3).map((reason) => (
                  <span
                    key={`${row.peerId}:${reason}`}
                    className={`rounded border px-1.5 py-0.5 text-[10px] ${REASON_BADGE_STYLE[reason] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}
                  >
                    {REASON_LABELS[reason] ?? reason}
                  </span>
                ))}
              </div>
            </button>
          ))
        )}
      </GlassCard>
    </div>
  ) : null;

  return (
    <div className="flex h-[calc(100vh-110px)] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Knowledge map</h1>
          <p className="text-sm text-text-muted">
            {filteredNodes.length} nodes | {filteredEdges.length} links
            {meta ? ` (from ${meta.total_nodes_before_trim} / ${meta.total_edges_before_trim})` : ""}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
            <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5">
              Cluster {meta?.cluster_count ?? 0}
            </span>
            <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5">
              Density {(meta?.density_score ?? 0).toFixed(3)}
            </span>
            <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5">
              Policy {meta?.applied_edge_policy ?? edgePolicy}
            </span>
            <span className={`rounded-full border px-2 py-0.5 ${embeddingBadgeClass}`}>
              {embeddingLabel}
            </span>
            <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5">
              {meta?.embedding_model ?? "-"}
            </span>
            <span className="rounded-full border border-black/10 bg-white/70 px-2 py-0.5">
              {graphHint}
            </span>
          </div>
        </div>

        <div className="relative w-full max-w-sm">
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search a node and press Enter"
              className="input flex-1 text-sm"
            />
            <button
              onClick={focusFirstMatch}
              className="rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-xs text-text-secondary hover:bg-white"
            >
              Focus
            </button>
          </div>
          {query && searchMatches.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-black/10 bg-white/95 p-1 shadow-xl backdrop-blur">
              {searchMatches.map((node) => (
                <button
                  key={node.id}
                  onClick={() => pickSearchResult(node)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-black/[0.04]"
                >
                  <span className="truncate text-text-primary">{node.label}</span>
                  <span className="ml-2 text-[10px] text-text-muted">{TYPE_LABELS[node.type] ?? node.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <GlassCard className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Graph Controls</p>
          <button
            onClick={() => setShowAdvanced((previous) => !previous)}
            className="rounded-lg border border-black/10 bg-white/80 px-2.5 py-1 text-xs text-text-secondary hover:bg-white"
          >
            {showAdvanced ? "Hide advanced" : "Show advanced"}
          </button>
        </div>
        <div className="rounded-xl border border-black/10 bg-white/70 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-text-secondary">Quick presets</span>
            <button
              onClick={() => applyPreset("recommended")}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                activePreset === "recommended"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-black/10 bg-white text-text-secondary"
              }`}
            >
              Recommended
            </button>
            <button
              onClick={() => applyPreset("explore")}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                activePreset === "explore"
                  ? "border-sky-300 bg-sky-50 text-sky-700"
                  : "border-black/10 bg-white text-text-secondary"
              }`}
            >
              Explore
            </button>
            <button
              onClick={() => applyPreset("focus")}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                activePreset === "focus"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-black/10 bg-white text-text-secondary"
              }`}
            >
              Focus
            </button>
            <button
              onClick={resetToFriendlyDefault}
              className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] text-text-secondary"
            >
              Reset filters
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-text-muted">
            {presetDescription} | sliders apply immediately.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div>
            <p className="mb-1 text-[11px] font-medium text-text-muted">Link threshold</p>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.05}
                max={0.95}
                step={0.01}
                value={minWeight}
                onChange={(event) => {
                  setMinWeight(Number.parseFloat(event.target.value));
                  setActivePreset("custom");
                }}
                className="w-full"
              />
              <span className="w-10 text-right text-xs text-text-secondary">{minWeight.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium text-text-muted">Density level</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3].map((level) => (
                <button
                  key={level}
                  onClick={() => {
                    setExpandLevel(level as 1 | 2 | 3);
                    setActivePreset("custom");
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    expandLevel === level
                      ? "bg-primary-500/15 text-primary-700"
                      : "bg-black/[0.04] text-text-secondary"
                  }`}
                >
                  L{level}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium text-text-muted">Focus depth</p>
            <div className="flex items-center gap-1">
              {[1, 2].map((depth) => (
                <button
                  key={depth}
                  onClick={() => {
                    setFocusDepth(depth as 1 | 2);
                    setActivePreset("custom");
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    focusDepth === depth
                      ? "bg-primary-500/15 text-primary-700"
                      : "bg-black/[0.04] text-text-secondary"
                  }`}
                >
                  {depth}-hop
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium text-text-muted">Link policy</p>
            <select
              value={edgePolicy}
              onChange={(event) => {
                setEdgePolicy(event.target.value as EdgePolicy);
                setActivePreset("custom");
              }}
              className="w-full rounded-md border border-black/10 bg-white/80 px-2 py-1.5 text-xs text-text-secondary"
            >
              <option value="tag_ai">Tag + AI</option>
              <option value="hybrid">Hybrid (all)</option>
              <option value="tag_only">Tag Only</option>
              <option value="ai_only">AI Only</option>
            </select>
          </div>

          <div className="flex items-end justify-end">
            <button
              onClick={increaseLimit}
              disabled={limitNodes >= 1200}
              className="rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-xs text-text-secondary hover:bg-white disabled:opacity-50"
            >
              Load more ({limitNodes}/1200)
            </button>
          </div>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <div>
              <p className="mb-1 text-[11px] font-medium text-text-muted">Knowledge threshold</p>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.1}
                  max={0.95}
                  step={0.01}
                  value={knowledgeMinScore}
                  onChange={(event) => {
                    setKnowledgeMinScore(Number.parseFloat(event.target.value));
                    setActivePreset("custom");
                  }}
                  className="w-full"
                />
                <span className="w-10 text-right text-xs text-text-secondary">{knowledgeMinScore.toFixed(2)}</span>
              </div>
            </div>

            <div className="lg:col-span-3">
              <p className="mb-1 text-[11px] font-medium text-text-muted">Link options</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeTextSimilarity}
                    onChange={(event) => {
                      setIncludeTextSimilarity(event.target.checked);
                      setActivePreset("custom");
                    }}
                    disabled={edgePolicy !== "hybrid"}
                  />
                  Use text-similarity links
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeKnowledgeEdges}
                    onChange={(event) => {
                      setIncludeKnowledgeEdges(event.target.checked);
                      setActivePreset("custom");
                    }}
                    disabled={edgePolicy === "tag_only"}
                  />
                  Use knowledge-index links
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {nodeTypes.map((type) => {
            const chipColor = TYPE_COLORS[type] ?? "#9ca3af";
            const isActive = activeTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  isActive
                    ? "text-text-primary"
                    : "border-black/5 bg-black/[0.03] text-text-muted"
                }`}
                style={isActive ? {
                  borderColor: hexToRgba(chipColor, 0.5),
                  backgroundColor: hexToRgba(chipColor, 0.14),
                } : undefined}
              >
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: chipColor }}
                />
                {TYPE_LABELS[type] ?? type}
              </button>
            );
          })}
          {meta?.truncated && (
            <span className="rounded-full border border-amber-300/50 bg-amber-100/80 px-2.5 py-1 text-[11px] text-amber-700">
              Some nodes were trimmed automatically
            </span>
          )}
          <button
            onClick={() => void loadGraph()}
            className="rounded-full border border-black/10 bg-white/80 px-2.5 py-1 text-[11px] text-text-secondary hover:bg-white"
          >
            Refresh
          </button>
        </div>
      </GlassCard>

      <div className="flex flex-1 gap-4 overflow-hidden">
        <div
          ref={hostRef}
          className="relative flex-1 overflow-hidden rounded-2xl border border-[#1b2738] bg-[#070c14] shadow-[0_24px_72px_rgba(0,0,0,0.52)]"
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 15% 22%, rgba(65, 176, 255, 0.20), transparent 42%), radial-gradient(circle at 84% 16%, rgba(48, 149, 218, 0.14), transparent 38%), linear-gradient(180deg, rgba(9, 14, 22, 0.98), rgba(6, 10, 16, 0.98))",
            }}
          />
          <div
            className="grok-aurora pointer-events-none absolute -inset-[18%] opacity-40 blur-3xl"
            style={{
              backgroundImage:
                "conic-gradient(from 140deg at 30% 42%, rgba(56,176,255,0.26), rgba(49,128,227,0.06), rgba(89,232,230,0.22), rgba(56,176,255,0.26))",
            }}
          />
          <div
            className="grok-scan pointer-events-none absolute inset-0 opacity-[0.10]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(125,177,227,0.32) 1px, transparent 1px), linear-gradient(to bottom, rgba(125,177,227,0.18) 1px, transparent 1px)",
              backgroundSize: "42px 42px, 42px 42px",
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_130%,rgba(115,173,231,0.14),transparent_56%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(1,5,10,0)_58%,rgba(1,5,10,0.28)_100%)]" />
          {!loading && filteredNodes.length > 0 && (
            <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/15 bg-black/40 p-3 backdrop-blur">
              <p className="text-[10px] font-semibold tracking-wide text-white/70">COLOR LEGEND</p>
              <div className="mt-2 space-y-1.5">
                {Object.entries(TYPE_LABELS)
                  .filter(([type]) => (typeCountMap[type] ?? 0) > 0)
                  .map(([type, label]) => (
                    <div key={type} className="flex items-center gap-2 text-[11px] text-white/90">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TYPE_COLORS[type] ?? "#9ca3af" }} />
                      <span className="min-w-[94px]">{label}</span>
                      <span className="text-white/70">{typeCountMap[type] ?? 0}</span>
                    </div>
                  ))}
              </div>
              <div className="mt-2 border-t border-white/10 pt-2 space-y-1.5">
                {(["semantic", "tag", "contextual"] as const).map((kind) => (
                  <div key={kind} className="flex items-center gap-2 text-[11px] text-white/85">
                    <span className="inline-block h-[2px] w-5 rounded-full" style={{ backgroundColor: EDGE_COLORS[kind] }} />
                    <span>{EDGE_LABELS[kind]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <Skeleton className="absolute inset-0 h-full w-full" />
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-white/90">{error}</p>
              <button
                onClick={() => void loadGraph()}
                className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/20"
              >
                Retry
              </button>
            </div>
          ) : filteredNodes.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-medium text-white/90">No graph nodes match the current view.</p>
              <p className="text-xs text-white/60">Relax the filters or add more content to the workspace.</p>
              <button
                onClick={resetToFriendlyDefault}
                className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/20"
              >
                Restore recommended preset
              </button>
            </div>
          ) : (
            <ForceGraph3D
              ref={graphRef}
              graphData={graphData}
              width={canvasSize.width}
              height={canvasSize.height}
              backgroundColor="rgba(0,0,0,0)"
              showNavInfo={false}
              warmupTicks={lodMode === "ultra" ? 20 : lodMode === "dense" ? 32 : 48}
              cooldownTicks={lodMode === "ultra" ? 90 : 130}
              enableNodeDrag
              nodeRelSize={4}
              nodeThreeObject={(node: GraphNode) => {
                const baseColor = TYPE_COLORS[node.type] ?? "#9ca3af";
                const inSearch = searchMatchIds.has(node.id);
                const inFocus = !selectedNodeId || focusNodeIds.has(node.id);
                const color = inSearch ? "#fef08a" : baseColor;
                const alpha = selectedNodeId ? (inFocus ? 0.95 : 0.16) : 0.9;
                const centrality = typeof node.centrality === "number" ? node.centrality : 0;
                const size = 5.8 + (centrality * 8.2) + (inSearch ? 2.2 : 0);

                const material = new THREE.SpriteMaterial({
                  map: dotTextureRef.current ?? undefined,
                  color,
                  transparent: true,
                  opacity: alpha,
                  depthWrite: false,
                  toneMapped: false,
                });

                const sprite = new THREE.Sprite(material);
                sprite.scale.set(size, size, 1);
                return sprite;
              }}
              nodeThreeObjectExtend={false}
              nodeVal={(node: GraphNode) => {
                const value = typeof node.size === "number" ? node.size : 5;
                const scale = lodMode === "ultra" ? 5.6 : lodMode === "dense" ? 4.8 : 4.3;
                return Math.max(1.6, value / scale);
              }}
              nodeColor={(node: GraphNode) => {
                const color = TYPE_COLORS[node.type] ?? "#9ca3af";
                const isSearchHit = searchMatchIds.has(node.id);
                if (!selectedNodeId) {
                  if (isSearchHit) return hexToRgba(color, 1);
                  return color;
                }
                if (focusNodeIds.has(node.id)) {
                  return isSearchHit ? color : hexToRgba(color, 0.95);
                }
                return hexToRgba(color, 0.10);
              }}
              nodeLabel={(node: GraphNode) => {
                if (lodMode === "ultra" && !focusNodeIds.has(node.id) && !searchMatchIds.has(node.id)) {
                  return "";
                }
                if (lodMode === "dense" && !focusNodeIds.has(node.id) && !searchMatchIds.has(node.id)) {
                  return "";
                }
                const type = TYPE_LABELS[node.type] ?? node.type;
                const importance = typeof node.importance === "number" ? node.importance.toFixed(2) : "0.00";
                const centrality = typeof node.centrality === "number" ? node.centrality.toFixed(2) : "0.00";
                return `${node.label}<br/>${type}<br/>importance ${importance} / centrality ${centrality}`;
              }}
              linkColor={(link: GraphLink) => {
                const key = edgeKey(link);
                const hint = link.style_hint ?? "contextual";
                const baseColor = EDGE_COLORS[hint] ?? EDGE_COLORS.contextual;

                if (pathEdgeKeys.has(key)) {
                  return hexToRgba("facc15", 0.95);
                }

                if (!selectedNodeId) {
                  const alpha = hint === "semantic"
                    ? Math.max(0.18, link.weight * 0.52)
                    : Math.max(0.12, link.weight * 0.4);
                  return hexToRgba(baseColor, alpha);
                }

                const source = getNodeId(link.source);
                const target = getNodeId(link.target);
                const inFocus = focusNodeIds.has(source) && focusNodeIds.has(target);
                if (inFocus) {
                  if (selectedDirectEdgeKeys.has(key)) {
                    return hexToRgba(baseColor, Math.max(0.42, link.weight * 0.7));
                  }
                  return hexToRgba(baseColor, Math.max(0.18, link.weight * 0.36));
                }

                return "rgba(255,255,255,0.04)";
              }}
              linkWidth={(link: GraphLink) => {
                const key = edgeKey(link);
                const base = 0.35 + (link.weight * 1.55);
                if (pathEdgeKeys.has(key)) {
                  return base * 1.35;
                }
                if (!selectedNodeId) return base;
                if (selectedDirectEdgeKeys.has(key)) return base * 1.18;

                const source = getNodeId(link.source);
                const target = getNodeId(link.target);
                const inFocus = focusNodeIds.has(source) && focusNodeIds.has(target);
                return inFocus ? Math.max(0.34, base * 0.72) : 0.12;
              }}
              linkOpacity={0.64}
              linkDirectionalParticles={(link: GraphLink) => {
                const key = edgeKey(link);
                if (pathEdgeKeys.has(key)) {
                  return lodMode === "ultra" ? 1 : 2;
                }
                return 0;
              }}
              linkDirectionalParticleWidth={(link: GraphLink) => Math.max(0.6, link.weight * 1.2)}
              linkDirectionalParticleSpeed={(link: GraphLink) => {
                const key = edgeKey(link);
                if (pathEdgeKeys.has(key)) return 0.003;
                return 0.0012 + (link.weight * 0.0015);
              }}
              onNodeClick={(node: GraphNode) => {
                setSelectedNodeId(node.id);
                setPathTargetId(null);
                focusNode(node);
              }}
              onBackgroundClick={() => {
                setSelectedNodeId(null);
                setPathTargetId(null);
              }}
            />
          )}

          {!loading && filteredNodes.length > 0 && (
            <div className="pointer-events-none absolute bottom-4 right-4 rounded-xl border border-white/15 bg-black/35 px-2.5 py-1.5 text-[10px] text-white/80 backdrop-blur-sm">
              Drag to orbit | wheel to zoom | right-click to pan
            </div>
          )}
        </div>

        {!isMobile && selectedNode && (
          <div className="w-80 flex-shrink-0 overflow-auto">{panel}</div>
        )}
      </div>

      {isMobile && selectedNode && mobileSheetOpen && (
        <div className="fixed inset-x-3 bottom-3 z-40 max-h-[58vh] overflow-auto rounded-2xl border border-black/10 bg-white/96 p-3 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-text-secondary">Node Detail</p>
            <button
              onClick={() => setMobileSheetOpen(false)}
              className="rounded px-2 py-1 text-xs text-text-muted hover:bg-black/[0.05]"
            >
              Collapse
            </button>
          </div>
          {panel}
        </div>
      )}

      {isMobile && selectedNode && !mobileSheetOpen && (
        <button
          onClick={() => setMobileSheetOpen(true)}
          className="fixed bottom-4 right-4 z-40 rounded-full border border-black/10 bg-white/90 px-3 py-2 text-xs text-text-secondary shadow-lg"
        >
          Open node detail
        </button>
      )}

      <style jsx>{`
        .grok-aurora {
          animation: grokAuroraDrift 22s ease-in-out infinite alternate;
          transform-origin: 42% 38%;
        }

        .grok-scan {
          animation: grokScanShift 28s linear infinite;
        }

        @keyframes grokAuroraDrift {
          0% {
            transform: translate3d(-4%, -2%, 0) rotate(0deg) scale(1);
            opacity: 0.34;
          }
          50% {
            transform: translate3d(2%, -5%, 0) rotate(7deg) scale(1.05);
            opacity: 0.46;
          }
          100% {
            transform: translate3d(6%, 3%, 0) rotate(-4deg) scale(0.98);
            opacity: 0.30;
          }
        }

        @keyframes grokScanShift {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-42px, -42px, 0);
          }
        }
      `}</style>
    </div>
  );
}
