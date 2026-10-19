import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";

interface CurrencyContextValue {
  currency: string;
  setCurrency: React.Dispatch<React.SetStateAction<string>>;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "USD",
  setCurrency: () => {},
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data } = useQuery<{ currencyCode?: string }>({
    queryKey: [`/api/vendors/${user?.vendorId}`],
    enabled: !!user?.vendorId,
  });
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    if (data?.currencyCode) {
      setCurrency(data.currencyCode);
    }
  }, [data]);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
