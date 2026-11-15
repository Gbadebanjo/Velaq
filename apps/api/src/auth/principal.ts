/** The signed-in caller, built only from a valid server-side session. */
export interface Principal {
  accountId: string;
  sessionId: string;
  email: string;
  /** Null only for accounts made before names were asked at sign-up. */
  firstName: string | null;
  lastName: string | null;
  /** The product this session was issued for. A session never spans products (AR-0). */
  product: "business" | "personal" | "marketplace";
  expiresAt: string;
  /** The caller's own scope in this product: their Personal space. Set by the guard. */
  scopeId?: string;
}
