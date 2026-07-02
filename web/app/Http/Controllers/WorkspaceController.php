<?php

namespace App\Http\Controllers;

use App\Models\DemoSession;
use App\Services\EnergySimulator;
use App\Services\SimulationManager;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class WorkspaceController extends Controller
{
    public function __invoke(Request $request, EnergySimulator $simulator, SimulationManager $manager): Response
    {
        $session = DemoSession::find($request->session()->get('demo_id'));
        if (! $session) {
            $session = DemoSession::create(['state' => $simulator->initialState()]);
            $request->session()->put('demo_id', $session->id);
        }

        return Inertia::render('Workspace', [
            'token' => $manager->token($session),
            'view' => $request->path() === '/' ? 'dashboard' : $request->path(),
        ]);
    }
}
