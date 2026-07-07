import { energyClient } from "./api";
import { demoClient } from "../demo/client";
import { SimulationRuntime } from "./simulation-runtime";

// One clock for the browser application, independent of Inertia page mounts.
export const simulationRuntime = new SimulationRuntime(
    import.meta.env.VITE_STATIC_DEMO === "true"
        ? () => demoClient() as unknown as ReturnType<typeof energyClient>
        : energyClient,
);

if (import.meta.hot) {
    import.meta.hot.dispose(() => simulationRuntime.dispose());
}
