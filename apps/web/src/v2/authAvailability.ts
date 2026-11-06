import { createContext, useContext } from "react";
export const AuthAvailability = createContext({ unavailable: false, retry: () => {} });
export const useAuthAvailability = () => useContext(AuthAvailability);
