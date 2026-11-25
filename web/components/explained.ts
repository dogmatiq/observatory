import { createContext } from "react";

/**
 * ExplainersBuilt is true where a card is drawn without the hovercard of its
 * icon: the icon of a vital card or of a handler digest opens nothing, and
 * doesn't grow when it is pointed at. /review sets it around the cards that it
 * shows with explainers in mind. An explainer is a dialog that explains every
 * part of a card at once, which makes the icon's hovercard unnecessary.
 */
export const ExplainersBuilt = createContext(false);
