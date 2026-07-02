<?php

namespace App\Services;

use App\Models\DemoSession;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class SimulationManager
{
    public function __construct(private EnergySimulator $simulator) {}

    public function token(DemoSession $session): string
    {
        return Crypt::encryptString(json_encode(['id' => $session->id, 'expires' => time() + 86400], JSON_THROW_ON_ERROR));
    }

    public function sessionId(string $token): string
    {
        try {
            $data = json_decode(Crypt::decryptString($token), true, flags: JSON_THROW_ON_ERROR);
            if (($data['expires'] ?? 0) < time() || ! isset($data['id'])) {
                throw new RuntimeException('Expired demo session.');
            }

            return $data['id'];
        } catch (\Throwable) {
            throw new RuntimeException('Your demo session expired. Refresh the page to reconnect.', 16);
        }
    }

    public function read(string $token): array
    {
        $session = DemoSession::find($this->sessionId($token));
        if (! $session) {
            throw new RuntimeException('Demo session not found. Refresh the page.', 16);
        }

        return $this->simulator->snapshot($session->state);
    }

    public function change(string $token, string $action, array $input): array
    {
        $id = $this->sessionId($token);

        return DB::transaction(function () use ($id, $action, $input): array {
            $session = DemoSession::lockForUpdate()->find($id);
            if (! $session) {
                throw new RuntimeException('Demo session not found.', 16);
            }
            $state = $session->state;
            if ($action === 'environment') {
                $patch = Validator::make($input, [
                    'weather' => 'sometimes|in:sunny,cloudy,rainy', 'lighting' => 'sometimes|in:day,night', 'unit' => 'sometimes|in:C,F',
                ])->validate();
                $state['environment'] = array_replace($state['environment'], $patch);
                $state = $this->simulator->log($state, 'Environment updated', ucfirst($state['environment']['weather']).' · '.ucfirst($state['environment']['lighting']).' · °'.$state['environment']['unit'], 'weather');
            } elseif ($action === 'controls') {
                $patch = Validator::make($input, [
                    'homeMode' => 'sometimes|in:auto,grid,off', 'evMode' => 'sometimes|in:solar,grid,off,schedule',
                    'waterMode' => 'sometimes|in:solar,grid,off,schedule', 'exportEnabled' => 'sometimes|boolean', 'gridFallback' => 'sometimes|boolean',
                ])->validate();
                $state['controls'] = array_replace($state['controls'], $patch);
                $state = $this->simulator->log($state, 'Controls updated', collect($patch)->map(fn ($v, $k) => $k.': '.(is_bool($v) ? ($v ? 'on' : 'off') : $v))->join(' · '));
            } elseif ($action === 'configure') {
                $patch = Validator::make($input, [
                    'homeDemand' => 'sometimes|numeric|between:0,15', 'solarCapacity' => 'sometimes|numeric|between:0,20',
                    'batteryCapacity' => 'sometimes|numeric|between:1,40', 'batteryReserve' => 'sometimes|numeric|between:0,90',
                    'batteryMaxCharge' => 'sometimes|numeric|between:0.1,10', 'batteryMaxDischarge' => 'sometimes|numeric|between:0.1,10',
                    'evCapacity' => 'sometimes|numeric|between:10,150', 'evChargePower' => 'sometimes|numeric|between:1.4,22',
                    'evTarget' => 'sometimes|numeric|between:20,100', 'waterTarget' => 'sometimes|numeric|between:30,75',
                    'gridRate' => 'sometimes|numeric|between:0,2', 'carbonFactor' => 'sometimes|numeric|between:0,2',
                    'variation' => 'sometimes|boolean', 'batteryPercent' => 'sometimes|numeric|between:0,100',
                    'evPercent' => 'sometimes|numeric|between:0,100', 'waterTemperature' => 'sometimes|numeric|between:20,85',
                ])->validate();
                $state['configuration'] = array_replace($state['configuration'], array_intersect_key($patch, $state['configuration']));
                $state['batteryKwh'] = min($state['batteryKwh'], $state['configuration']['batteryCapacity']);
                if (array_key_exists('batteryPercent', $patch)) {
                    $state['batteryKwh'] = $patch['batteryPercent'] / 100 * $state['configuration']['batteryCapacity'];
                }
                foreach (['evPercent', 'waterTemperature'] as $key) {
                    if (array_key_exists($key, $patch)) {
                        $state[$key] = $patch[$key];
                    }
                }
                $state = $this->simulator->log($state, 'Simulation parameters saved', 'Manual inputs applied; existing history retained.', 'simulation');
            } elseif ($action === 'advance') {
                $data = Validator::make($input, ['seconds' => 'required|integer|between:1,86400'])->validate();
                $state = $this->simulator->advance($state, $data['seconds']);
            } elseif ($action === 'schedules') {
                $blocks = $input['blocks'] ?? [];
                Validator::make(['blocks' => $blocks], [
                    'blocks' => 'present|array|max:50', 'blocks.*.id' => 'required|string|max:80|distinct',
                    'blocks.*.system' => 'required|in:ev,water', 'blocks.*.source' => 'required|in:solar,grid,off',
                    'blocks.*.start' => 'required|integer|between:0,1439', 'blocks.*.end' => 'required|integer|between:1,1440',
                    'blocks.*.days' => 'required|array|min:1|max:7', 'blocks.*.days.*' => 'integer|between:0,6',
                    'blocks.*.enabled' => 'required|boolean',
                ])->validate();
                foreach ($blocks as $i => $a) {
                    if ($a['end'] <= $a['start']) {
                        throw ValidationException::withMessages(['blocks' => 'End time must be after start time. Split overnight rules into two blocks.']);
                    }
                    foreach (array_slice($blocks, $i + 1) as $b) {
                        if ($a['enabled'] && $b['enabled'] && $a['system'] === $b['system'] && array_intersect($a['days'], $b['days']) && max($a['start'], $b['start']) < min($a['end'], $b['end'])) {
                            throw ValidationException::withMessages(['blocks' => 'Time blocks overlap for the same device and day.']);
                        }
                    }
                }
                $state['schedules'] = $blocks;
                $state = $this->simulator->log($state, 'Schedule saved', count($blocks).' time blocks. Home battery remains automatic.', 'schedule');
            } elseif ($action === 'reset') {
                $state = $this->simulator->initialState();
            }
            if ($action !== 'advance') {
                $state['revision']++;
            }
            $session->state = $state;
            $session->save();

            return $this->simulator->snapshot($state);
        }, 3);
    }
}
