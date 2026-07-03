import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, Code } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { EnergyService } from "../resources/js/generated/energy_pb.ts";

const origin = process.env.APP_TEST_URL || "http://127.0.0.1:8000";
const client = createClient(
    EnergyService,
    createGrpcWebTransport({ baseUrl: origin + "/rpc", useBinaryFormat: true }),
);
async function session() {
    const response = await fetch(origin + "/");
    assert.equal(response.status, 200);
    const html = await response.text();
    const match = html.match(
        /<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/,
    );
    assert.ok(match, "The Inertia bootstrap page is present");
    const page = JSON.parse(match[1]);
    assert.equal(page.component, "Workspace");
    return page.props.token;
}
const closeTo = (actual, expected) =>
    assert.ok(
        Math.abs(actual - expected) < 0.000001,
        `${actual} != ${expected}`,
    );

test("real gRPC-Web → HTTP/2 → PHP roundtrip and persisted simulation", async () => {
    const token = await session();
    const first = await client.getState({ token });
    assert.ok(first.readings.length > 100);
    assert.ok(first.daily.length >= 7);
    const night = await client.setEnvironment({
        token,
        lighting: "night",
        weather: "rainy",
        unit: "F",
    });
    assert.equal(night.telemetry.solarAvailable, 0);
    assert.equal(night.telemetry.thermalPower, 0);
    assert.equal(night.evPercent, first.evPercent);
    assert.equal(night.clock, first.clock);
    closeTo(night.telemetry.batteryDischarge, 2.6);
    const grid = await client.setControls({
        token,
        evMode: "grid",
        waterMode: "grid",
    });
    closeTo(grid.telemetry.batteryDischarge, 2.6);
    assert.ok(grid.telemetry.gridEv > 0);
    const after = await client.advanceTime({ token, seconds: 3600 });
    assert.ok(after.batteryKwh < first.batteryKwh);
    assert.ok(after.evPercent > first.evPercent);
    const saved = await client.getState({ token });
    closeTo(saved.batteryKwh, after.batteryKwh);
    assert.equal(saved.environment.unit, "F");
    const sunny = await client.setEnvironment({
        token,
        weather: "sunny",
        lighting: "day",
    });
    assert.equal(sunny.telemetry.solarAvailable, 8);
    await client.configure({ token, batteryPercent: 100, evPercent: 80 });
    await client.setControls({
        token,
        evMode: "solar",
        waterMode: "solar",
        exportEnabled: true,
    });
    const exportState = await client.getState({ token });
    closeTo(exportState.telemetry.gridExport, 5.4);
    const zero = await client.configure({
        token,
        homeDemand: 0,
        batteryPercent: 0,
    });
    assert.equal(zero.configuration.homeDemand, 0);
    assert.equal(zero.batteryKwh, 0);
    await assert.rejects(
        client.configure({ token, solarCapacity: -1 }),
        (error) => error.code === Code.InvalidArgument,
    );
    await assert.rejects(
        client.getState({ token: "invalid" }),
        (error) => error.code === Code.Unauthenticated,
    );
});

test("gRPC schedules validate overlaps and preserve midnight and false values", async () => {
    const token = await session();
    const block = {
        id: "overnight",
        system: "ev",
        source: "grid",
        start: 0,
        end: 360,
        days: [0, 1, 2, 3, 4, 5, 6],
        enabled: false,
    };
    const saved = await client.saveSchedule({ token, blocks: [block] });
    assert.equal(saved.schedules.length, 1);
    assert.equal(saved.schedules[0].start, 0);
    assert.equal(saved.schedules[0].enabled, false);
    await assert.rejects(
        client.saveSchedule({
            token,
            blocks: [
                { ...block, enabled: true },
                { ...block, id: "overlap", start: 60, enabled: true },
            ],
        }),
        (error) => error.code === Code.InvalidArgument,
    );
    const cleared = await client.saveSchedule({ token, blocks: [] });
    assert.equal(cleared.schedules.length, 0);
});

test("browser sessions stay isolated", async () => {
    const first = await session(),
        second = await session();
    await client.setControls({ token: first, homeMode: "off" });
    assert.equal(
        (await client.getState({ token: second })).controls.homeMode,
        "auto",
    );
    assert.equal(
        (await client.getState({ token: first })).controls.homeMode,
        "off",
    );
});

test("EV battery can be reset and charged repeatedly without resetting the home or history", async () => {
    const token = await session();
    await client.setEnvironment({ token, weather: "sunny", lighting: "day" });
    await client.setControls({ token, evMode: "solar" });
    const full = await client.configure({ token, evPercent: 80 });
    assert.equal(full.telemetry.evPower, 0);
    for (let attempt = 0; attempt < 2; attempt++) {
        const before = await client.getState({ token });
        const reset = await client.configure({ token, evPercent: 10 });
        assert.equal(reset.evPercent, 10);
        assert.equal(reset.clock, before.clock);
        assert.equal(reset.batteryKwh, before.batteryKwh);
        assert.equal(reset.waterTemperature, before.waterTemperature);
        assert.deepEqual(reset.controls, before.controls);
        assert.deepEqual(reset.configuration, before.configuration);
        assert.deepEqual(reset.schedules, before.schedules);
        assert.deepEqual(reset.daily, before.daily);
        assert.ok(reset.telemetry.evPower > 0);
        const charging = await client.advanceTime({ token, seconds: 3600 });
        assert.ok(charging.evPercent > 10);
    }
    await client.setControls({ token, evMode: "off" });
    const stopped = await client.configure({ token, evPercent: 10 });
    assert.equal(stopped.telemetry.evPower, 0);
});
