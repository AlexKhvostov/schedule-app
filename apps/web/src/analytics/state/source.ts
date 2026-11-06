import { createContext, useContext } from "react";
import type { AnalyticsMode } from "../../data/analytics/http";
export const AnalyticsSourceContext = createContext<AnalyticsMode>("unconfigured");
export const useAnalyticsMode = () => useContext(AnalyticsSourceContext);
