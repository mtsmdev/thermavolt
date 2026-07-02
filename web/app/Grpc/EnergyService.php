<?php

namespace App\Grpc;

use App\Generated\Energy\AdvanceRequest;
use App\Generated\Energy\ConfigurationRequest;
use App\Generated\Energy\ControlsRequest;
use App\Generated\Energy\EnergyServiceInterface;
use App\Generated\Energy\EnvironmentRequest;
use App\Generated\Energy\ScheduleRequest;
use App\Generated\Energy\SessionRequest;
use App\Generated\Energy\Snapshot;
use App\Services\SimulationManager;
use Google\Protobuf\Internal\Message;
use Illuminate\Validation\ValidationException;
use Spiral\RoadRunner\GRPC\ContextInterface;
use Spiral\RoadRunner\GRPC\Exception\GRPCException;
use Throwable;

class EnergyService implements EnergyServiceInterface
{
    public function __construct(private SimulationManager $manager) {}

    public function GetState(ContextInterface $ctx, SessionRequest $in): Snapshot
    {
        return $this->handle($in, 'read');
    }

    public function SetEnvironment(ContextInterface $ctx, EnvironmentRequest $in): Snapshot
    {
        return $this->handle($in, 'environment');
    }

    public function SetControls(ContextInterface $ctx, ControlsRequest $in): Snapshot
    {
        return $this->handle($in, 'controls');
    }

    public function Configure(ContextInterface $ctx, ConfigurationRequest $in): Snapshot
    {
        return $this->handle($in, 'configure');
    }

    public function AdvanceTime(ContextInterface $ctx, AdvanceRequest $in): Snapshot
    {
        return $this->handle($in, 'advance');
    }

    public function SaveSchedule(ContextInterface $ctx, ScheduleRequest $in): Snapshot
    {
        return $this->handle($in, 'schedules');
    }

    public function ResetSimulation(ContextInterface $ctx, SessionRequest $in): Snapshot
    {
        return $this->handle($in, 'reset');
    }

    private function handle(Message $message, string $action): Snapshot
    {
        try {
            $input = json_decode($message->serializeToJsonString(), true, flags: JSON_THROW_ON_ERROR);
            $token = $input['token'] ?? '';
            unset($input['token']);
            if ($action === 'schedules') {
                $input['blocks'] = array_map(fn ($block) => $block + ['start' => 0, 'days' => [], 'enabled' => false], $input['blocks'] ?? []);
            }
            $data = $action === 'read' ? $this->manager->read($token) : $this->manager->change($token, $action, $input);
            $response = new Snapshot;
            $response->mergeFromJsonString(json_encode($data, JSON_THROW_ON_ERROR));

            return $response;
        } catch (ValidationException $e) {
            throw new GRPCException($e->validator->errors()->first(), 3);
        } catch (Throwable $e) {
            if ($e->getCode() === 16) {
                throw new GRPCException($e->getMessage(), 16);
            }
            report($e);
            throw new GRPCException('The simulation could not complete this request. Please retry.', 13);
        }
    }
}
