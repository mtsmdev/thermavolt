import { mount } from "svelte";
import { createInertiaApp } from "@inertiajs/svelte";
import Workspace from "./pages/Workspace.svelte";
import "../css/app.css";
createInertiaApp({
    title: (title) => (title ? title + " · ThermaVoltFlow" : "ThermaVoltFlow"),
    resolve: () => ({ default: Workspace }),
    setup: ({ el, App, props }) => {
        if (el) mount(App, { target: el, props });
    },
    progress: { color: "#45e7a1" },
});
import '../css/design.css';
