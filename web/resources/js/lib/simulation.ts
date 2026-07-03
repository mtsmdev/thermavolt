import { energyClient } from "./api";
import { SimulationRuntime } from "./simulation-runtime";

// One clock for the browser application, independent of Inertia page mounts.
export const simulationRuntime = new SimulationRuntime(energyClient);

if (import.meta.hot) {
    import.meta.hot.dispose(() => simulationRuntime.dispose());
}
