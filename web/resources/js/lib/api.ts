import { createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { EnergyService } from "../generated/energy_pb";
export function energyClient() {
    return createClient(
        EnergyService,
        createGrpcWebTransport({
            baseUrl: window.location.origin + "/rpc",
            useBinaryFormat: true,
        }),
    );
}
