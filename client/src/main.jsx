import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LexBot from "./LexBot.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LexBot />
  </StrictMode>
);
