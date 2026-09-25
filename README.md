# Redes para DevSecOps

> Un roadmap interactivo para aprender redes desde los mecanismos que aparecen en DevSecOps, cloud y arquitectura de software moderna.

## Por qué existe

Hice esta herramienta para volver a estudiar networking desde un lugar que me importa de verdad, porque las explicaciones generales de redes me hacían sentir estancada y, siendo honesta, a veces me aburrían. No porque las redes no sean importantes, sino porque me costaba ver qué relación tenían con el tipo de problemas que quiero entender: contenedores, Kubernetes, controles de acceso, tráfico cifrado, observabilidad del kernel y decisiones de arquitectura cloud... Básicamente, parte de lo que construye a un DevSecOps.

Este proyecto no intenta enseñar “todas las redes”. Intenta construir una ruta con una pregunta constante detrás: **¿cómo se comporta este mecanismo cuando debo diseñar, proteger o diagnosticar software en producción?**

Por eso el contenido parte de bibliografía técnica y está organizado como un roadmap de seis módulos. La página existe para que la lectura no sea pasiva, la idea es participar activamente de esta, como poder inspeccionar paquetes, seguir topologías, contrastar hipótesis, ejecutar laboratorios locales si quiero y guardar mi propio progreso.

## Distinción clave de alcance!!!

> Estas bases cubren los conceptos de red que dominan gran parte del trabajo en **DevSecOps, nube y arquitectura de software moderna**. Dejarán vacíos relevantes si más adelante decides pivotar hacia pentesting de infraestructura física tradicional o seguridad de redes on-premise.

Eso es intencional, no una promesa de cobertura total. El enfoque prioriza Linux, contenedores, Kubernetes, TLS/mTLS, eBPF, VPCs e identidad de workload. No sustituye un itinerario de switching, routing empresarial físico, radiofrecuencia, equipamiento de fabricante o pentesting de red tradicional.

## Qué hay en esta primera versión

1. **Anatomía del Paquete y la Pila de Transporte**: IPv4, TCP, CIDR, PCAP y diagnóstico L3/L4.
2. **Primitivas de Red en el Kernel de Linux**: namespaces, veth, bridges, Netfilter, NAT y conntrack.
3. **Servicios de Red, Resolución y Criptografía de Tránsito**: DNS, TLS 1.3, X.509 y mTLS.
4. **Redes de Contenedores y CNI en Kubernetes**: IP por Pod, CNI, Services y NetworkPolicy.
5. **Observabilidad y Seguridad en el Kernel con eBPF**: verifier, XDP, TC, hooks y telemetría.
6. **Arquitectura Cloud, VPCs y Principios Zero Trust**: segmentación, Security Groups, NACLs, endpoints privados e identidad.

Cada módulo combina:

- Teoría técnica con citas desplegables;
- Diagramas y tablas de evidencia;
- Un checkpoint de decisión con explicación forense;
- Una topología interactiva;
- Un walkthrough de laboratorio que **no ejecuta comandos desde la web**;
- Una Auditoría DoD para contrastar la salida de una práctica local.

El progreso y los checkpoints se guardan únicamente en el navegador de cada persona.

## Cómo usarlo

La forma recomendada de recorrer un módulo es:

1. Lee **Fundamentos** y abre los conceptos que no reconozcas.
2. Resuelve el **checkpoint** antes de revelar la explicación. No busca memorizar una definición: busca justificar una conclusión con evidencia.
3. Explora la **Topología interactiva** para ubicar interfaces, reglas y puntos de inspección.
4. Si quieres practicar, sigue **Terminal y walkthrough** en una máquina Linux propia.
5. Sólo entonces abre **Auditoría DoD** y, de forma opcional, usa el verificador local para comprobar el estado final.

No necesitas instalar nada ni ejecutar comandos para leer el roadmap, usar los diagramas o completar los checkpoints.

## Fuentes y trazabilidad

El contenido curado vive en [content/modules/](content/modules/). Cada módulo identifica los capítulos que sustentan sus explicaciones y laboratorios.

La bibliografía de esta versión es:

- Chris Sanders, *Practical Packet Analysis*.
- James Strong y Vallery Lancey, *Networking and Kubernetes: A Layered Approach*.
- Liz Rice, *Learning eBPF*.
- Evan Gilman y Doug Barth, *Zero Trust Networks*.
- Julien Vehent, *Securing DevOps: Security in the Cloud*.

Es importante aclarar que Las citas permiten volver al libro correspondiente, por lo tanto no reemplazan su lectura ni reproducen los libros.

## IA y proceso de construcción

Usé IA para acelerar la construcción de la página y convertir el roadmap en una herramienta interactiva. Eso fue una decisión práctica: quería probar una experiencia de aprendizaje concreta con rapidez, sin fingir que la automatización reemplaza el criterio técnico, porque no, siempre lo principal es el CRITERIO TÉCNICO.

La IA ayudó a estructurar contenido, implementar la interfaz y crear los componentes de exploración y verificación. Las fuentes, los límites del enfoque y las decisiones de curaduría siguen siendo responsabilidades HUMANAS. Cualquier laboratorio debe leerse, ejecutarse y validarse con criterio antes de usarse fuera de un entorno controlado.

El siguiente fue el prompt de implementación entregado a Claude Code para esta primera versión (no es el prompt más completo del mundo, pero me ayudó a lograr parte de mi objetivo :)

<details>
<summary>Prompt de construcción frontend/fullstack</summary>

~~~~markdown
# SYSTEM / ROLE DEFINITION
Eres un Senior Principal Fullstack Engineer, Creative Technologist y UI/UX Architect. Te especializas en plataformas interactivas para ingeniería de sistemas, visualización de datos de bajo nivel y herramientas de aprendizaje técnico avanzado.

# TU MISIÓN
Construir una plataforma web interactiva, moderna y ultra-optimizada que aloje el roadmap de "Redes para DevSecOps y Arquitectura de Ciberseguridad". La plataforma consumirá la especificación de contenido de los 6 módulos ya curados (ubicados en /content/modules/) y proporcionará una experiencia inmersiva para aprender teoría técnica profunda, explorar topologías de red y resolver laboratorios prácticos.

---

# REGLAS TÉCNICAS Y RESTRICCIONES DURAS (INNEGOCIABLES)

1. **Gestor de Paquetes:** Usa EXCLUSIVAMENTE pnpm. Tienes terminantemente prohibido ejecutar o sugerir comandos con npm o yarn.
2. **Backend, Herramientas Auxiliares y Scripts:** Si requieres construir servidores mock, micro-servicios de verificación de red, simuladores o herramientas CLI de apoyo, debes usar EXCLUSIVAMENTE **Go** (Golang). Tienes terminantemente prohibido usar Python.
3. **Framework Frontend:** Utiliza Next.js (App Router) o Astro con TypeScript y Tailwind CSS, optimizado para renderizado estático/híbrido de alto rendimiento y consumo de contenido tipado en Markdown/MDX.

---

# DESIGN SYSTEM & UX/UI PHILOSOPHY (HALLMARK SKILLS)

Tienes instaladas y activas las skills de diseño de **Hallmark** (https://www.usehallmark.com/).

### Directrices de Estética y Macroestructura:
1. **Anti-AI Generic Design:** Rechaza el layout típico corporativo o de plantilla de documentación aburrida. Cada página debe tener una macroestructura intencional, ritmo visual alternado, asimetría controlada y tratamiento tipográfico técnico de alta gama (estilo editorial de ingeniería, terminal dark-mode refinado, paletas funcionales de alto contraste).
2. **Arquitectura Visual del Laboratorio:**
   - **Pestaña de Teoría / Mecanismos:** Tipografía legible, tablas de campos binarios interactivas con highlights, y tarjetas de inspección de paquetes.
   - **Visor de Topología de Red:** Componente interactivo (SVG dinámico o Canvas) que renderice los nodos (Namespaces, Bridges, Pods, Interfaces veth) y permita al usuario hacer clic para ver el estado de enrutamiento y las reglas de firewall activas.
   - **Terminal Playground / Consola:** Ventana de consola interactiva con estilo retro-moderno que muestre los scripts de configuración, logs de salida esperados y snippets listos para copiar con 1 click.
   - **Motor de Verificación (Check DoD):** Panel interactivo donde el usuario pueda cargar la salida de su verificación o marcar hitos de validación con retroalimentación visual clara.

---

# ARQUITECTURA DEL PROYECTO

Crea una estructura de proyecto modular y limpia:

~~~
├── content/
│   └── modules/              # Archivos Markdown curados por el modelo de contenido
├── src/
│   ├── app/ (o pages/)       # Rutas: Dashboard, Catálogo de Módulos, Visor de Laboratorio
│   ├── components/
│   │   ├── hallmark/         # Componentes estilizados según principios Hallmark
│   │   ├── lab/              # Consola, Tab switching, Checklist DoD
│   │   ├── topology/         # Visualizadores interactivos de redes (SVG/Canvas)
│   │   └── packet/           # Inspector visual de cabeceras L3/L4/L7
│   ├── lib/
│   │   ├── content.ts        # Parsers y validadores Zod para el frontmatter del contenido
│   │   └── types.ts          # Tipos estrictos de TypeScript
│   └── styles/
├── tools/                    # Herramientas auxiliares y CLI en Go
│   └── verifier/             # Verificador de red local en Go (ej. ping test, TLS scanner)
├── package.json
└── pnpm-lock.yaml
~~~

---

# PASOS DE EJECUCIÓN INMEDIATA

1. **Inicialización:**
   - Inicializa el proyecto utilizando pnpm con TypeScript, Tailwind CSS y soporte de iconos (lucide-react).
   - Configura las reglas de Hallmark para macroestructura y diseño tipográfico.
2. **Definición del Schema de Datos:**
   - Escribe el parser en TypeScript con Zod para validar la estructura de los módulos de /content/modules/ asegurando tipado estricto para metadata, blueprints de topología y especificaciones de laboratorio.
3. **Desarrollo del Core UI:**
   - Implementa la vista principal (Roadmap interactivo con progreso y dependencias visuales).
   - Implementa la vista de Módulo/Laboratorio con el sistema de pestañas de cuatro cuadrantes: *Fundamentos*, *Topología Interactiva*, *Terminal & Walkthrough*, y *Auditoría DoD*.
4. **Componente de Visualización de Topología:**
   - Crea un componente visual reactivo que tome la topología descrita en el Markdown y dibuje las interfaces de red, namespaces y paquetes en tránsito con animaciones suaves.

Empieza inspeccionando el directorio actual, verificando la instalación de pnpm y configurando el esqueleto base del proyecto.
~~~~

</details>

## Desarrollo local

Requisitos:

- Node.js compatible con el proyecto.
- pnpm (la versión fijada en el proyecto es 10.26.1).
- Go, únicamente si vas a compilar el verificador local.
- Linux y permisos apropiados si ejecutarás laboratorios que creen namespaces, interfaces o reglas de firewall.

~~~bash
pnpm install
pnpm dev
~~~

Comprobaciones de calidad:

~~~bash
pnpm typecheck
pnpm test
pnpm content:check
~~~

Para la práctica local opcional:

~~~bash
pnpm verifier:build
sudo ./bin/lnverify run lab-01-tcp-pcap-state --json
~~~

## Estado y próximos pasos

Esta es una primera versión. Ya prioriza comprensión activa mediante checkpoints, topologías y laboratorios, pero todavía puede crecer con repetición espaciada, escenarios encadenados entre módulos, más incidentes de producción y rutas de profundización según el objetivo profesional de cada persona.

Si haces uso de este proyecto, úsalo como punto de partida y conserva el contexto: es una herramienta para aprender con intención, no una certificación ni una fuente única de verdad.
También me encanta el deseo de contribuir, por lo que si deseas aportar en el desarrollo de esta página y su contenido, hay total libertad. :)
