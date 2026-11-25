import { createContext } from "react";

/**
 * ExplainersBuilt is true where a card is drawn as it will be once the explainers
 * are in the views: the icon of a vital card or of a handler digest opens no
 * hovercard, and doesn't grow when it is pointed at. Only /review sets it, until
 * the explainers are in the views.
 */
export const ExplainersBuilt = createContext(false);
