import { createContext, type ReactNode } from "react";

/**
 * TileFlag is the alert flag that a vital card shows in its top row, between the
 * readout of its chart and its icon, if it has one. Only /review sets it, to show
 * how a status would look as a flag.
 */
export const TileFlag = createContext<ReactNode>(undefined);
