import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGateway } from "./gateway.mjs";
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.resolve(cwd, "../.runtime");
const php =
    process.env.PHP_BINARY ||
    (process.platform === "win32" ? path.join(runtime, "php/php.exe") : "php");
const rr =
    process.env.RR_BINARY ||
    path.join(runtime, "grpc/roadrunner-3.0.1-windows-amd64/rr.exe");
const env = {
    ...process.env,
    PATH: path.dirname(php) + path.delimiter + process.env.PATH,
};
if (!existsSync(path.join(cwd, "public/build/manifest.json"))) {
    console.error("Run npm run build first.");
    process.exit(1);
}
const children = [
    spawn(
        php,
        ["artisan", "serve", "--host=127.0.0.1", "--port=8001", "--no-reload"],
        { cwd, env, stdio: "inherit", windowsHide: true },
    ),
    spawn(rr, ["serve", "-c", ".rr.yaml"], {
        cwd,
        env,
        stdio: "inherit",
        windowsHide: true,
    }),
];
const gateway = createGateway();
let stopping = false;
function stop() {
    if (stopping) return;
    stopping = true;
    gateway.close();
    for (const p of children) p.kill();
    setTimeout(() => process.exit(0), 300).unref();
}
for (const child of children) {
    child.on("error", (e) => {
        console.error(e.message);
        stop();
    });
    child.on("exit", (code) => {
        if (!stopping) {
            console.error("A backend stopped:", code);
            stop();
        }
    });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
