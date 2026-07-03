<?php

namespace Tests\Feature;

use App\Generated\Energy\EnvironmentRequest;
use App\Grpc\EnergyService;
use App\Models\DemoSession;
use App\Services\EnergySimulator;
use App\Services\SimulationManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Spiral\RoadRunner\GRPC\ContextInterface;
use Tests\TestCase;

class SimulationTest extends TestCase
{
    use RefreshDatabase;

    private function demo(): DemoSession
    {
        return DemoSession::create(['state' => app(EnergySimulator::class)->initialState('2026-10-29T12:00:00+01:00', false)]);
    }

    public function test_environment_changes_keep_stored_energy_temperature_history_and_clock(): void
    {
        $demo = $this->demo();
        $manager = app(SimulationManager::class);
        $token = $manager->token($demo);
        $manager->change($token, 'advance', ['seconds' => 3600]);
        $before = $manager->read($token);
        $after = $manager->change($token, 'environment', ['weather' => 'rainy', 'lighting' => 'night', 'unit' => 'F']);
        foreach (['clock', 'batteryKwh', 'evPercent', 'waterTemperature', 'daily'] as $key) {
            $this->assertEquals($before[$key], $after[$key]);
        }
        $this->assertEquals(0, $after['telemetry']['solarAvailable']);
        $this->assertEquals('F', $after['environment']['unit']);
    }

    public function test_two_visitor_sessions_are_isolated(): void
    {
        $first = $this->demo();
        $second = $this->demo();
        $manager = app(SimulationManager::class);
        $manager->change($manager->token($first), 'configure', ['batteryPercent' => 35, 'evPercent' => 10]);
        $this->assertEquals(7.6, $manager->read($manager->token($second))['batteryKwh']);
        $this->assertEquals(3.5, $manager->read($manager->token($first))['batteryKwh']);
    }

    public function test_invalid_token_cannot_read_a_demo(): void
    {
        $this->expectExceptionCode(16);
        app(SimulationManager::class)->read('invalid-capability');
    }

    public function test_overlapping_schedule_is_rejected_without_changing_saved_state(): void
    {
        $demo = $this->demo();
        $manager = app(SimulationManager::class);
        $token = $manager->token($demo);
        $block = ['id' => 'first', 'system' => 'ev', 'source' => 'grid', 'start' => 0, 'end' => 120, 'days' => [3], 'enabled' => true];
        try {
            $manager->change($token, 'schedules', ['blocks' => [$block, array_replace($block, ['id' => 'second', 'start' => 60])]]);
            $this->fail('Overlapping rules were accepted.');
        } catch (ValidationException) {
            $this->assertCount(4, $manager->read($token)['schedules']);
        }
    }

    public function test_grpc_service_serializes_snapshot_and_accepts_typed_input(): void
    {
        $demo = $this->demo();
        $request = new EnvironmentRequest;
        $request->setToken(app(SimulationManager::class)->token($demo));
        $request->setLighting('night');
        $response = app(EnergyService::class)->SetEnvironment($this->createStub(ContextInterface::class), $request);
        $this->assertEquals('night', $response->getEnvironment()->getLighting());
        $this->assertEquals(0, $response->getTelemetry()->getSolarAvailable());
        $this->assertNotEmpty($response->serializeToString());
    }
}
