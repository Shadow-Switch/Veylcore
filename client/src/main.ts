import "./style.css";
import { GameApp } from "./game/gameApp";

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  const hudContainer = document.getElementById("hud-layer") as HTMLElement;
  const menuContainer = document.getElementById("menu-layer") as HTMLElement;

  if (!canvas || !hudContainer || !menuContainer) {
    throw new Error("Required DOM containers are missing from index.html");
  }

  // Initialize GameApp
  new GameApp(canvas, hudContainer, menuContainer);
});
