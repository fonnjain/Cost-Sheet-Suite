import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initAuthTokenGetter } from "./lib/auth";

initAuthTokenGetter();

createRoot(document.getElementById("root")!).render(<App />);
