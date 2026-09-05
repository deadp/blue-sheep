import "./world.css";
import Phaser from "phaser";
import { FarmScene } from "./world/FarmScene.js";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 480,
  height: 300,
  zoom: 2,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: "#8fbf6a",
  physics: { default: "arcade", arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [FarmScene],
});
