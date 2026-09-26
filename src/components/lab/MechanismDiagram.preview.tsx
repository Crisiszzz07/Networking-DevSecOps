import { MechanismDiagram } from "./MechanismDiagram";

const source = "proceso cliente\n  │ abre socket TCP\n  ▼\nIPv4 → router/firewall → servidor";

/** Development-only state sheet for the interactive mechanism diagram. */
export function MechanismDiagramPreview() {
  return (
    <section className="mechanism-preview" aria-label="Mechanism diagram states">
      <p>default</p><MechanismDiagram source={source} />
      <p>hover / focus / active</p><MechanismDiagram source={source} />
      <p>disabled</p><MechanismDiagram source={source} disabled />
      <p>loading</p><MechanismDiagram source={source} state="loading" />
      <p>error</p><MechanismDiagram source={source} state="error" />
      <p>success</p><MechanismDiagram source={source} />
      <p>figure without diagram</p><MechanismDiagram source={"pkts bytes target\n   1    60 DROP"} />
    </section>
  );
}
