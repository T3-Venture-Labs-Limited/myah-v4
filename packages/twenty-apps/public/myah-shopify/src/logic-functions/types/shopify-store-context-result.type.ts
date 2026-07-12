export type ShopifyStoreContextResult = {
  success: boolean;
  connected: boolean;
  error?: string;
  shop?: {
    name?: string;
    myshopifyDomain?: string;
    primaryDomain?: { host?: string; url?: string } | null;
    currencyCode?: string;
    contactEmail?: string | null;
  };
  products?: Array<{
    id?: string;
    title?: string;
    handle?: string;
    status?: string;
    vendor?: string;
    productType?: string;
    tags?: string[];
    totalInventory?: number | null;
    onlineStoreUrl?: string | null;
  }>;
  scopes?: string[];
};
