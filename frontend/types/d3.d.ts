declare module "d3" {
  // Force simulation types
  export interface SimulationNodeDatum {
    index?: number | undefined;
    x?: number | undefined;
    y?: number | undefined;
    vx?: number | undefined;
    vy?: number | undefined;
    fx?: number | null | undefined;
    fy?: number | null | undefined;
  }

  export interface SimulationLinkDatum<NodeDatum extends SimulationNodeDatum> {
    source: NodeDatum | string | number;
    target: NodeDatum | string | number;
    index?: number | undefined;
  }

  export interface Simulation<
    NodeDatum extends SimulationNodeDatum,
    LinkDatum extends SimulationLinkDatum<NodeDatum> | undefined,
  > {
    force(name: string, force?: any): this;
    on(typenames: string, listener: (this: Simulation<NodeDatum, LinkDatum>) => void): this;
    alpha(alpha?: number): this;
    alphaMin(min?: number): this;
    alphaTarget(target?: number): this;
    restart(): this;
    stop(): this;
    tick(iterations?: number): this;
    nodes(): NodeDatum[];
    nodes(nodes: NodeDatum[]): this;
  }

  // Selection types
  export interface Selection<
    GElement extends Element | null,
    Datum,
    PElement extends Element | null,
    PDatum,
  > {
    append(type: string): Selection<any, Datum, PElement, PDatum>;
    attr(name: string, value?: any): this;
    attr(name: string, value: (d: Datum, i: number, g: any) => any): this;
    style(name: string, value?: any): this;
    style(name: string, value: (d: Datum, i: number, g: any) => any): this;
    text(value?: any): this;
    text(value: (d: Datum, i: number, g: any) => string): this;
    classed(names: string, value?: boolean | ((d: Datum, i: number, g: any) => boolean)): this;
    select(selector: string): Selection<any, Datum, GElement, Datum>;
    selectAll(selector: string): Selection<any, any, GElement, Datum>;
    data<NewDatum>(
      data: NewDatum[],
      key?: (d: NewDatum | Datum, i: number, g: any) => string,
    ): Selection<GElement, NewDatum, PElement, PDatum>;
    join(enter: string | ((enter: any) => any), update?: (update: any) => any, exit?: (exit: any) => any): Selection<any, Datum, PElement, PDatum>;
    call(fn: (selection: any, ...args: any[]) => void, ...args: any[]): this;
    on(typenames: string, listener: (this: GElement, event: any, d: Datum) => void): this;
    on(typenames: string, listener: null): this;
    remove(): this;
    lower(): this;
    raise(): this;
    node(): GElement;
    each(fn: (this: GElement, d: Datum, i: number, g: any) => void): this;
    filter(selector: string | ((d: Datum, i: number, g: any) => boolean)): this;
  }

  // Zoom
  export interface ZoomBehavior<ZoomRefElement extends Element, Datum> {
    on(typenames: string, listener: (this: ZoomRefElement, event: any, d: Datum) => void): this;
    transform(selection: any, transform: any): void;
    scaleExtent(extent: [number, number]): this;
    translateExtent(extent: [[number, number], [number, number]]): this;
  }

  export interface ZoomTransform {
    x: number;
    y: number;
    k: number;
    toString(): string;
  }

  export const zoomIdentity: ZoomTransform;

  export function select<GElement extends Element>(selector: GElement): Selection<GElement, unknown, null, undefined>;
  export function select<GElement extends Element>(selector: string): Selection<GElement, unknown, HTMLElement, unknown>;

  export function zoom<ZoomRefElement extends Element, Datum>(): ZoomBehavior<ZoomRefElement, Datum>;

  export function forceSimulation<
    NodeDatum extends SimulationNodeDatum,
    LinkDatum extends SimulationLinkDatum<NodeDatum> | undefined = undefined,
  >(nodes?: NodeDatum[]): Simulation<NodeDatum, LinkDatum>;

  export function forceLink<
    NodeDatum extends SimulationNodeDatum,
    LinkDatum extends SimulationLinkDatum<NodeDatum>,
  >(links?: LinkDatum[]): any;

  export function forceManyBody<NodeDatum extends SimulationNodeDatum>(): any;
  export function forceCenter(x?: number, y?: number): any;
  export function forceCollide<NodeDatum extends SimulationNodeDatum>(radius?: any): any;

  export function drag<GElement extends Element, Datum>(): any;
}
