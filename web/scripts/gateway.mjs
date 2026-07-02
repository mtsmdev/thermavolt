import http from "node:http";
import http2 from "node:http2";
const methods = new Set([
    "GetState",
    "SetEnvironment",
    "SetControls",
    "Configure",
    "AdvanceTime",
    "SaveSchedule",
    "ResetSimulation",
]);
const prefix = "/thermavolt.v1.EnergyService/";
function finishGrpc(res, status, message = "") {
    if (res.destroyed || res.writableEnded) return;
    if (!res.headersSent)
        res.writeHead(200, {
            "content-type": "application/grpc-web+proto",
            "cache-control": "no-store",
        });
    const trailer = Buffer.from(
        "grpc-status: " +
            status +
            "\r\ngrpc-message: " +
            encodeURIComponent(message) +
            "\r\n",
    );
    const frame = Buffer.alloc(5);
    frame[0] = 128;
    frame.writeUInt32BE(trailer.length, 1);
    res.end(Buffer.concat([frame, trailer]));
}
export function createGateway(port = 8000, phpPort = 8001, grpcPort = 9001) {
    const server = http.createServer(async (req, res) => {
        if (!req.url?.startsWith("/rpc/")) {
            const upstream = http.request(
                {
                    hostname: "127.0.0.1",
                    port: phpPort,
                    path: req.url,
                    method: req.method,
                    headers: req.headers,
                },
                (response) => {
                    res.writeHead(response.statusCode || 502, response.headers);
                    response.pipe(res);
                },
            );
            upstream.on("error", () => {
                if (!res.headersSent)
                    res.writeHead(503, { "content-type": "text/plain" });
                res.end(
                    "ThermaVoltFlow is starting. Please refresh in a moment.",
                );
            });
            req.pipe(upstream);
            return;
        }
        const rpcPath = req.url.slice(4);
        if (
            req.method !== "POST" ||
            !rpcPath.startsWith(prefix) ||
            !methods.has(rpcPath.slice(prefix.length))
        ) {
            finishGrpc(res, 12, "Unknown RPC method.");
            return;
        }
        const origin = req.headers.origin;
        if (
            origin &&
            origin !== "http://" + req.headers.host &&
            origin !== "https://" + req.headers.host
        ) {
            finishGrpc(res, 7, "Origin not allowed.");
            return;
        }
        if (
            !String(req.headers["content-type"]).startsWith(
                "application/grpc-web+proto",
            )
        ) {
            finishGrpc(res, 3, "Binary gRPC-Web is required.");
            return;
        }
        const chunks = [];
        let size = 0;
        try {
            for await (const chunk of req) {
                size += chunk.length;
                if (size > 2 * 1024 * 1024) {
                    finishGrpc(res, 8, "Request too large.");
                    return;
                }
                chunks.push(chunk);
            }
        } catch {
            return;
        }
        const session = http2.connect("http://127.0.0.1:" + grpcPort);
        let trailers = { "grpc-status": "0" },
            ended = false;
        const done = (code, message = "") => {
            if (ended) return;
            ended = true;
            finishGrpc(res, code, message);
            session.close();
        };
        session.on("error", () => done(14, "PHP gRPC service is unavailable."));
        const call = session.request({
            ":method": "POST",
            ":path": rpcPath,
            "content-type": "application/grpc",
            te: "trailers",
            "grpc-timeout": "30S",
        });
        call.setTimeout(30000, () => {
            done(4, "Simulation request timed out.");
            call.close();
        });
        call.on("response", (headers) => {
            if (headers["grpc-status"]) trailers = headers;
            if (headers[":status"] !== 200)
                done(14, "gRPC service returned an unexpected status.");
            else if (!res.headersSent)
                res.writeHead(200, {
                    "content-type": "application/grpc-web+proto",
                    "cache-control": "no-store",
                    "x-thermavolt-transport": "grpc-web > grpc/http2 > php",
                });
        });
        call.on("data", (chunk) => {
            if (!ended) res.write(chunk);
        });
        call.on("trailers", (value) => {
            trailers = value;
        });
        call.on("end", () =>
            done(
                trailers["grpc-status"] || "0",
                decodeURIComponent(trailers["grpc-message"] || ""),
            ),
        );
        call.on("error", () =>
            done(14, "Connection to PHP gRPC service failed."),
        );
        res.on("close", () => {
            if (!ended) {
                ended = true;
                call.close();
                session.close();
            }
        });
        call.end(Buffer.concat(chunks));
    });
    server.listen(port, "127.0.0.1", () =>
        console.log("ThermaVoltFlow: http://127.0.0.1:" + port),
    );
    return server;
}
