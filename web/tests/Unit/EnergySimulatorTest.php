<?php

namespace Tests\Unit;

use App\Services\EnergySimulator;
use PHPUnit\Framework\TestCase;

class EnergySimulatorTest extends TestCase
{
    private function state(): array
    {
        return (new EnergySimulator)->initialState('2026-10-29T12:00:00+01:00', false);
    }

    public function test_cloudy_day_automatically_covers_only_the_home_shortfall(): void
    {
        $simulator = new EnergySimulator;
        $state = $this->state();
        $state['controls']['evMode'] = 'grid';
        $state['controls']['waterMode'] = 'grid';
        $state['waterTemperature'] = 30;
        $power = $simulator->power($state);
        $this->assertEqualsWithDelta(1.2, $power['solarHome'], 0.00001);
        $this->assertEqualsWithDelta(1.4, $power['batteryDischarge'], 0.00001);
        $this->assertEqualsWithDelta(5.2, $power['gridImport'], 0.00001);
        $this->assertEquals(0, $power['batteryCharge']);
        $this->assertEquals(0, $power['gridHome']);
    }

    public function test_battery_is_driven_by_deficit_rather_than_the_cloudy_label(): void
    {
        $state = $this->state();
        $state['configuration']['homeDemand'] = 0.5;
        $power = (new EnergySimulator)->power($state);
        $this->assertEquals(0, $power['batteryDischarge']);
        $this->assertGreaterThan(0, $power['batteryCharge']);
    }

    public function test_night_stops_both_solar_sources_and_keeps_ev_off_without_grid(): void
    {
        $state = $this->state();
        $state['environment']['lighting'] = 'night';
        $power = (new EnergySimulator)->power($state);
        $this->assertEquals(0, $power['solarAvailable']);
        $this->assertEquals(0, $power['thermalPower']);
        $this->assertEquals(0, $power['evPower']);
        $this->assertEquals(0, $power['waterPower']);
        $this->assertEquals(2.6, $power['batteryDischarge']);
        $this->assertEquals(0, $power['gridImport']);
    }

    public function test_shared_solar_supplies_home_then_ev_then_storage_then_opt_in_export(): void
    {
        $state = $this->state();
        $state['environment']['weather'] = 'sunny';
        $state['batteryKwh'] = 10;
        $simulator = new EnergySimulator;
        $power = $simulator->power($state);
        $this->assertEqualsWithDelta(2.6, $power['solarHome'], 0.00001);
        $this->assertEqualsWithDelta(3.2, $power['solarEv'], 0.00001);
        $this->assertEquals(0, $power['gridExport']);
        $this->assertEqualsWithDelta(2.2, $power['curtailed'], 0.00001);
        $state['controls']['exportEnabled'] = true;
        $power = $simulator->power($state);
        $this->assertEqualsWithDelta(2.2, $power['gridExport'], 0.00001);
        $state['environment']['lighting'] = 'night';
        $this->assertEquals(0, $simulator->power($state)['gridExport']);
    }

    public function test_reserve_is_respected_and_grid_fallback_is_explicit(): void
    {
        $state = $this->state();
        $state['environment']['lighting'] = 'night';
        $simulator = new EnergySimulator;
        $after = $simulator->advance($state, 86400);
        $this->assertEqualsWithDelta(2, $after['batteryKwh'], 0.000001);
        $power = $simulator->power($after);
        $this->assertEqualsWithDelta(2.6, $power['unmetHome'], 0.000001);
        $this->assertEquals(0, $power['gridImport']);
        $after['controls']['gridFallback'] = true;
        $power = $simulator->power($after);
        $this->assertEqualsWithDelta(2.6, $power['gridHome'], 0.000001);
        $this->assertEquals(0, $power['unmetHome']);
    }

    public function test_power_and_daily_energy_balance_include_storage_losses(): void
    {
        $state = $this->state();
        $state['environment']['weather'] = 'sunny';
        $state['controls']['exportEnabled'] = true;
        $simulator = new EnergySimulator;
        $power = $simulator->power($state);
        $this->assertEqualsWithDelta(
            $power['solarGenerated'] + $power['gridImport'] + $power['batteryDischarge'],
            $power['homeSupplied'] + $power['evPower'] + $power['waterPower'] + $power['batteryCharge'] + $power['gridExport'],
            0.000001
        );
        $after = $simulator->advance($state, 3600);
        $day = $after['daily']['2026-10-29'];
        $this->assertEqualsWithDelta($day['solar'] + $day['grid'], $day['home'] + $day['ev'] + $day['water'] + $day['exported'] + $after['batteryKwh'] - $state['batteryKwh'] + $day['batteryLosses'], 0.000001);
        $this->assertLessThanOrEqual(10, $after['batteryKwh']);
        $this->assertLessThanOrEqual(80, $after['evPercent']);
    }

    public function test_schedule_switches_at_the_exact_minute_inside_an_advance(): void
    {
        $state = $this->state();
        $state['clock'] = '2026-10-29T10:59:30+01:00';
        $state['environment']['lighting'] = 'night';
        $state['controls']['evMode'] = 'schedule';
        $state['schedules'] = [['id' => 'test', 'system' => 'ev', 'source' => 'grid', 'start' => 660, 'end' => 720, 'days' => [3], 'enabled' => true]];
        $after = (new EnergySimulator)->advance($state, 60);
        $this->assertEqualsWithDelta(3.2 * 30 / 3600, $after['daily']['2026-10-29']['ev'], 0.000001);
    }

    public function test_small_ticks_do_not_flood_history_and_variation_is_repeatable(): void
    {
        $simulator = new EnergySimulator;
        $state = $this->state();
        $state['configuration']['variation'] = true;
        $shortTicks = $state;
        for ($i = 0; $i < 30; $i++) {
            $shortTicks = $simulator->advance($shortTicks, 2);
        }
        $longTick = $simulator->advance($state, 60);
        $this->assertEqualsWithDelta($longTick['batteryKwh'], $shortTicks['batteryKwh'], 0.000001);
        $this->assertCount(1, $shortTicks['readings']);
    }

    public function test_simulated_time_observes_amsterdam_daylight_saving_transition(): void
    {
        $simulator = new EnergySimulator;
        $state = $simulator->initialState('2026-10-25T02:59:30+02:00', false);
        $after = $simulator->advance($state, 60);
        $this->assertEquals('2026-10-25T02:00:30+01:00', $after['clock']);
    }
}
