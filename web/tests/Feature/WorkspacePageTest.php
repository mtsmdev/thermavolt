<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WorkspacePageTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_dashboard_page_loads(): void
    {
        $this->withoutVite();
        $response = $this->get('/');

        $response->assertStatus(200);
    }
}
