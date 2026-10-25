// Scene order for /demo (number keys 1–9 and 0 jump here).
import type { Scene } from "./core.ts";
import { title } from "./scenes/title.ts";
import { genesis } from "./scenes/genesis.ts";
import { mapping } from "./scenes/mapping.ts";
import { motion } from "./scenes/motion.ts";
import { modes } from "./scenes/modes.ts";
import { classroom } from "./scenes/classroom.ts";
import { play } from "./scenes/play.ts";
import { stack } from "./scenes/stack.ts";
import { solana } from "./scenes/solana.ts";
import { vision } from "./scenes/vision.ts";
import { close } from "./scenes/close.ts";

export const SCENES: Scene[] = [title, genesis, mapping, motion, modes, classroom, play, stack, solana, vision, close];
