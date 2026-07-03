import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import {
    SimulationRuntime,
    simulationSpeeds,
    flowDuration,
} from "../resources/js/lib/simulation-runtime.ts";

function harness() {
    let now = 0,
        timers = 0,
        reads = 0,
        elapsed = 0;
    const advances = [];
    const snapshot = () => ({
        clock: new Date(elapsed * 1000).toISOString(),
        revision: advances.length,
    });
    const client = {
        getState: async () => {
            reads++;
            return snapshot();
        },
        advanceTime: async (request) => {
            advances.push(request);
            elapsed += request.seconds;
            return snapshot();
        },
    };
    const runtime = new SimulationRuntime(() => client, {
        now: () => now,
        start: () => {
            timers++;
            return () => timers--;
        },
    });
    return {
        runtime,
        client,
        advances,
        state: () => get(runtime.state),
        at: (time) => {
            now = time;
        },
        timers: () => timers,
        reads: () => reads,
    };
}

test("navigation remounts retain the clock, playback and speed with one timer", async () => {
    const h = harness();
    await h.runtime.connect("dashboard-token");
    h.runtime.setSpeed(360);
    h.runtime.setPlaying(true);
    const unsubscribe = h.runtime.state.subscribe(() => {});
    unsubscribe();
    for (const page of [
        "control",
        "scheduler",
        "analytics",
        "lab",
        "dashboard",
    ]) {
        await h.runtime.connect(page + "-token");
        h.at((h.advances.length + 1) * 1000);
        await h.runtime.tick();
        assert.equal(h.state().playing, true);
        assert.equal(h.state().speed, 360);
        assert.equal(h.advances.at(-1).token, page + "-token");
    }
    assert.equal(h.timers(), 1);
    assert.equal(h.reads(), 1);
    assert.equal(Date.parse(h.state().simulation.clock), 1800 * 1000);
    h.runtime.dispose();
    assert.equal(h.timers(), 0);
});

test("a slow request never overlaps another advance or loses elapsed time", async () => {
    const h = harness();
    await h.runtime.connect("token");
    h.runtime.setPlaying(true);
    const advance = h.client.advanceTime;
    let complete;
    h.client.advanceTime = async (request) => {
        await new Promise((resolve) => {
            complete = resolve;
        });
        return advance(request);
    };
    h.at(1000);
    const inFlight = h.runtime.tick();
    h.at(3000);
    await h.runtime.tick();
    assert.equal(h.advances.length, 0);
    complete();
    await inFlight;
    h.client.advanceTime = advance;
    h.at(4000);
    await h.runtime.tick();
    assert.deepEqual(
        h.advances.map((r) => r.seconds),
        [60, 180],
    );
    h.runtime.dispose();
});

test("changing speed accounts for each elapsed portion at its own multiplier", async () => {
    const h = harness();
    await h.runtime.connect("token");
    h.runtime.setPlaying(true);
    h.at(500);
    h.runtime.setSpeed(360);
    h.at(1000);
    await h.runtime.tick();
    assert.equal(h.advances[0].seconds, 210);
    assert.deepEqual(simulationSpeeds, [1, 60, 360, 1440]);
    for (let i = 1; i < simulationSpeeds.length; i++) {
        assert.ok(
            flowDuration(simulationSpeeds[i]) <
                flowDuration(simulationSpeeds[i - 1]),
        );
    }
    h.runtime.dispose();
});

test("pausing does not catch up paused time when playback resumes", async () => {
    const h = harness();
    await h.runtime.connect("token");
    h.runtime.setPlaying(true);
    h.at(1000);
    await h.runtime.tick();
    h.runtime.setPlaying(false);
    h.at(61000);
    await h.runtime.tick();
    h.runtime.setPlaying(true);
    h.at(62000);
    await h.runtime.tick();
    assert.deepEqual(
        h.advances.map((r) => r.seconds),
        [60, 60],
    );
    h.runtime.dispose();
});

test("failed advances stop playback and can reconnect without a duplicate timer", async () => {
    const h = harness();
    await h.runtime.connect("token");
    h.client.advanceTime = async () => {
        throw new Error("Connection lost");
    };
    h.runtime.setPlaying(true);
    h.at(1000);
    await h.runtime.tick();
    assert.equal(h.state().playing, false);
    assert.equal(h.state().busy, false);
    assert.equal(h.state().error, "Connection lost");
    await h.runtime.connect("fresh-token");
    assert.equal(h.state().connected, true);
    assert.equal(h.timers(), 1);
    h.runtime.dispose();
});
