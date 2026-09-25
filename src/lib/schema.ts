import { z } from "zod";
import { parseCidr } from "./cidr";

// Contract for /content/modules/*.md. The content model writes these files; the
// build fails loudly (with file + path) when one drifts from the contract.

const Cidr = z.string().refine((v) => parseCidr(v) !== null, { message: "IPv4 o CIDR inválido" });
const CidrWithPrefix = z.string().refine((v) => parseCidr(v)?.prefix != null, { message: "se esperaba CIDR con prefijo (/n)" });
const NamedCidr = z.string().regex(/^[\w.-]+=\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/, "formato esperado nombre=a.b.c.d/n");
const Proto = z.string().regex(/^(tcp|udp)\/\d{1,5}$/i, "formato esperado tcp/PUERTO o udp/PUERTO");
const Port = z.number().int().min(1).max(65535);
const Scalar = z.union([z.string(), z.number(), z.boolean()]);

export const FrontmatterSchema = z
  .object({
    id: z.string().regex(/^modulo-\d{2}$/, "id debe ser modulo-NN"),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug en kebab-case"),
    title: z.string().min(1),
    layer: z.string().min(1),
    primary_books: z
      .array(
        z
          .object({
            title: z.string().min(1),
            chapters: z.array(z.string().min(1)).min(1),
            target_competencies: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      )
      .min(1),
    content_version: z.number().int().positive(),
    lab_runtime: z.string().min(1),
    depends_on: z.array(z.string().regex(/^modulo-\d{2}$/)).optional(),
  })
  .strict();

export type Frontmatter = z.infer<typeof FrontmatterSchema>;

export const NodeSpecSchema = z
  .object({
    netns: z.string().optional(),
    cidr: CidrWithPrefix.optional(),
    ip: Cidr.optional(),
    gateway: Cidr.optional(),
    interfaces: z.array(NamedCidr).optional(),
    bridges: z.array(NamedCidr).optional(),
    forwarding: z.boolean().optional(),
    listen: Proto.optional(),
    port: Port.optional(),
    target_port: Port.optional(),
    source_port: Port.optional(),
    pod_cidr: CidrWithPrefix.optional(),
    labels: z.record(z.string(), z.string()).optional(),
    type: z.enum(["ClusterIP", "NodePort", "LoadBalancer"]).optional(),
    id: z.string().optional(),
    record: z.string().regex(/^\S+ [A-Z]+ \S+$/, "formato esperado NOMBRE TIPO VALOR").optional(),
  })
  .catchall(Scalar);

export type NodeSpec = z.infer<typeof NodeSpecSchema>;

const FlowString = z.string().refine((v) => /→|->/.test(v), { message: "un flujo necesita al menos un →" });

export const BlueprintSchema = z
  .object({
    nodes: z.record(z.string().regex(/^[a-z][\w-]*$/), NodeSpecSchema).optional(),
    flow: z.union([FlowString, z.array(FlowString).min(1)]).optional(),
    path: FlowString.optional(),
    policy: FlowString.optional(),
    enforcement: z.string().optional(),
    inspection: z.array(z.string().min(1)).optional(),
    vpc: z.object({ cidr: CidrWithPrefix }).strict().optional(),
    subnets: z
      .record(
        z.string().regex(/^[a-z][\w-]*$/),
        z.object({ cidr: CidrWithPrefix, node: z.string().min(1), ingress: z.string().optional() }).strict(),
      )
      .optional(),
    allowed: z.array(FlowString).optional(),
    denied: z.array(FlowString).optional(),
  })
  .strict()
  .refine((b) => b.nodes !== undefined || b.subnets !== undefined, {
    message: "el blueprint necesita `nodes` o `subnets`",
  })
  .refine((b) => b.flow !== undefined || b.path !== undefined || b.allowed !== undefined, {
    message: "el blueprint necesita al menos un `flow`, `path` o `allowed`",
  });

export type Blueprint = z.infer<typeof BlueprintSchema>;
