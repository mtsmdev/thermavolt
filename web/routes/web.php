<?php

use App\Http\Controllers\WorkspaceController;
use Illuminate\Support\Facades\Route;

foreach (['/', '/control-center', '/smart-scheduler', '/analytics', '/simulation-lab'] as $path) {
    Route::get($path, WorkspaceController::class);
}
