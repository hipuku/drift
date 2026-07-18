import { useState } from "react";
import { DevHarness } from "./dev/DevHarness.js";
import { AuditFlow } from "./flow/AuditFlow.js";
import { ProductShell } from "./shell/ProductShell.js";

/**
 * The product is the ProductShell wrapping the audit flow. The brand click
 * (onHome) remounts the flow for a fresh audit. The internal states harness
 * remains reachable for development at `?harness`.
 */
export function App() {
  const [resetKey, setResetKey] = useState(0);

  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("harness")) {
    return <DevHarness />;
  }

  return (
    <ProductShell onHome={() => setResetKey((k) => k + 1)}>
      <AuditFlow key={resetKey} />
    </ProductShell>
  );
}
