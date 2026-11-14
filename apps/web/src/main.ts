import "./styles.css";
import { AppWebEntry } from "@openai-harness/client-web";

const container = document.getElementById("root");
if (container === null) throw new Error("web app: missing #root");
void new AppWebEntry(container).run();
