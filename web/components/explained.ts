import { createContext, type ReactNode } from "react";

/**
 * ExplainersBuilt is true where a card is drawn without the hovercard of its
 * icon: the icon of a vital card or of a handler digest opens nothing, and
 * doesn't grow when it is pointed at. /review sets it around every card that it
 * shows, because it designs the views as they will be with explainers. An explainer is a dialog that explains every
 * part of a card at once, which makes the icon's hovercard unnecessary.
 */
export const ExplainersBuilt = createContext(false);

/**
 * TileFlag is the alert flag that a vital card shows in its top row, between the
 * readout of its chart and its icon, if it has one. Only /review sets it, to show
 * how a status would look as a flag.
 */
export const TileFlag = createContext<ReactNode>(undefined);
