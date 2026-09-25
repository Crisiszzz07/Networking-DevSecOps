import {
  Anchor,
  Box as BoxIcon,
  Cable,
  ChevronsRight,
  Cloud,
  Container,
  Cpu,
  Database,
  Globe,
  LayoutGrid,
  Network,
  Radar,
  Router,
  Server,
  Signpost,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { NodeKind } from "@/lib/types";

export const KIND: Record<NodeKind, { label: string; Icon: LucideIcon }> = {
  netns: { label: "network namespace", Icon: BoxIcon },
  router: { label: "router Linux", Icon: Router },
  host: { label: "host", Icon: Server },
  bridge: { label: "bridge L2", Icon: Network },
  segment: { label: "segmento L2", Icon: Cable },
  "k8s-node": { label: "nodo Kubernetes", Icon: Server },
  pod: { label: "pod", Icon: Container },
  service: { label: "Service", Icon: Waypoints },
  workload: { label: "workload", Icon: Cpu },
  dns: { label: "servidor DNS", Icon: Signpost },
  hook: { label: "hook eBPF", Icon: Anchor },
  map: { label: "mapa eBPF", Icon: Database },
  collector: { label: "colector", Icon: Radar },
  stage: { label: "etapa del datapath", Icon: ChevronsRight },
  vpc: { label: "VPC", Icon: Cloud },
  subnet: { label: "subred", Icon: LayoutGrid },
  external: { label: "origen externo", Icon: Globe },
};

export const LINK_LABEL: Record<string, string> = {
  wire: "enlace L2/veth",
  route: "gateway / ruta",
  underlay: "underlay entre nodos",
  datapath: "datapath",
  state: "estado (mapa)",
};
