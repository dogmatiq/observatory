import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";

const root = document.getElementById("root");
if (root === null) {
	throw new Error("the page has no element with the ID 'root'");
}

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
