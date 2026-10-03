import { mount } from "svelte";
import App from "./App.svelte";
import { applyTheme } from "./theme";
import "./setup.css";

applyTheme("fanwit-default");
mount(App, { target: document.getElementById("app")! });
