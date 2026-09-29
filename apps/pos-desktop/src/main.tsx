import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { Dialogos } from "./componentes/Dialogos";
import "./estilos.css";
import "./shell/shell.css";
import "./shell/gestion.css";

const contenedor = document.getElementById("root");
if (!contenedor) throw new Error("No se encontró el contenedor #root.");

createRoot(contenedor).render(
  <React.StrictMode>
    <App />
    {/* Fuera de `App` a propósito: las preguntas ("¿cancelar la venta?") se
        dibujan por encima de cualquier pantalla, y ninguna fase de `App`
        —login, config, error— las puede dejar sin atender. */}
    <Dialogos />
  </React.StrictMode>,
);
