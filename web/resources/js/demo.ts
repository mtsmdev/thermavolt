import { mount } from "svelte";
import Workspace from "./pages/Workspace.svelte";
import "../css/app.css";
import "../css/design.css";

const target = document.getElementById("app");
if (target) {
    mount(Workspace, {
        target,
        props: { token: "pages-demo", view: "dashboard" },
    });
}
