import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./estilos.css";
import "./shell/shell.css";
import "./shell/gestion.css";

const contenedor = document.getElementById("root");
if (!contenedor) throw new Error("No se encontró el contenedor #root.");

createRoot(contenedor).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
