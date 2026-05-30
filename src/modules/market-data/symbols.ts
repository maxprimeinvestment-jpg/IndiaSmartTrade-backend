export type SymbolCategory =
  | 'CURRENCY'
  | 'INDICES'
  | 'COMMODITY'
  | 'CRYPTO'
  | 'INDIAN_EQUITY'
  | 'INDIAN_INDEX';

export type SymbolRegion = 'GLOBAL' | 'IN';
export type SymbolCurrency = 'USD' | 'INR';

export type MarketHoursDef = {
  open: string;
  close: string;
  tz: string;
  days: number[];
};

export const NSE_HOURS: MarketHoursDef = {
  open: '09:15',
  close: '15:30',
  tz: 'Asia/Kolkata',
  days: [1, 2, 3, 4, 5],
};

export type SymbolDef = {
  code: string;
  displayName: string;
  category: SymbolCategory;
  pipSize: number;
  digits: number;
  startPrice: number;
  spread: number;
  volatility: number;
  contractSize: number;
  region: SymbolRegion;
  currency: SymbolCurrency;
  lotSize: number;
  hours?: MarketHoursDef;
};

export const SYMBOLS: readonly SymbolDef[] = [
  // Currency (forex) — 100k contract size, 24/5
  { code: 'EURUSD', displayName: 'EUR / USD', category: 'CURRENCY', pipSize: 0.0001, digits: 5, startPrice: 1.0850, spread: 2, volatility: 1.5, contractSize: 100_000, region: 'GLOBAL', currency: 'USD', lotSize: 0.01 },
  { code: 'GBPUSD', displayName: 'GBP / USD', category: 'CURRENCY', pipSize: 0.0001, digits: 5, startPrice: 1.2670, spread: 2, volatility: 1.8, contractSize: 100_000, region: 'GLOBAL', currency: 'USD', lotSize: 0.01 },
  { code: 'USDJPY', displayName: 'USD / JPY', category: 'CURRENCY', pipSize: 0.01,   digits: 3, startPrice: 151.20, spread: 2, volatility: 1.4, contractSize: 100_000, region: 'GLOBAL', currency: 'USD', lotSize: 0.01 },
  { code: 'AUDUSD', displayName: 'AUD / USD', category: 'CURRENCY', pipSize: 0.0001, digits: 5, startPrice: 0.6610, spread: 2, volatility: 1.6, contractSize: 100_000, region: 'GLOBAL', currency: 'USD', lotSize: 0.01 },
  { code: 'USDCAD', displayName: 'USD / CAD', category: 'CURRENCY', pipSize: 0.0001, digits: 5, startPrice: 1.3540, spread: 2, volatility: 1.5, contractSize: 100_000, region: 'GLOBAL', currency: 'USD', lotSize: 0.01 },

  // Global indices
  { code: 'NAS100', displayName: 'Nasdaq 100',  category: 'INDICES', pipSize: 0.1, digits: 1, startPrice: 18750.0, spread: 8, volatility: 5, contractSize: 1, region: 'GLOBAL', currency: 'USD', lotSize: 0.01 },
  { code: 'SPX500', displayName: 'S&P 500',     category: 'INDICES', pipSize: 0.1, digits: 1, startPrice: 5210.0,  spread: 5, volatility: 4, contractSize: 1, region: 'GLOBAL', currency: 'USD', lotSize: 0.01 },
  { code: 'DJ30',   displayName: 'Dow Jones 30',category: 'INDICES', pipSize: 1,   digits: 0, startPrice: 39200,   spread: 5, volatility: 6, contractSize: 1, region: 'GLOBAL', currency: 'USD', lotSize: 0.01 },

  // Commodities
  { code: 'GOLD', displayName: 'Gold',     category: 'COMMODITY', pipSize: 0.01, digits: 2, startPrice: 2330.50, spread: 5, volatility: 2,   contractSize: 100,  region: 'GLOBAL', currency: 'USD', lotSize: 0.01 },
  { code: 'OIL',  displayName: 'Crude Oil',category: 'COMMODITY', pipSize: 0.01, digits: 2, startPrice: 82.40,   spread: 4, volatility: 2.5, contractSize: 1000, region: 'GLOBAL', currency: 'USD', lotSize: 0.01 },

  // Crypto
  { code: 'BTCUSD', displayName: 'BTC / USD', category: 'CRYPTO', pipSize: 0.5,  digits: 2, startPrice: 67500, spread: 10, volatility: 30, contractSize: 1, region: 'GLOBAL', currency: 'USD', lotSize: 0.01 },
  { code: 'ETHUSD', displayName: 'ETH / USD', category: 'CRYPTO', pipSize: 0.05, digits: 2, startPrice: 3450,  spread: 8,  volatility: 4,  contractSize: 1, region: 'GLOBAL', currency: 'USD', lotSize: 0.01 },

  // Indian indices — NSE futures lot multipliers
  { code: 'NIFTY50',   displayName: 'NIFTY 50',   category: 'INDIAN_INDEX', pipSize: 0.05, digits: 2, startPrice: 24500, spread: 4, volatility: 8,  contractSize: 75, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'BANKNIFTY', displayName: 'BANK NIFTY', category: 'INDIAN_INDEX', pipSize: 0.05, digits: 2, startPrice: 51000, spread: 4, volatility: 12, contractSize: 30, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'SENSEX',    displayName: 'SENSEX',     category: 'INDIAN_INDEX', pipSize: 0.05, digits: 2, startPrice: 81000, spread: 4, volatility: 14, contractSize: 20, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },

  // Indian equities — delivery, 1 share = 1 lot
  { code: 'RELIANCE',   displayName: 'Reliance Industries',          category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 1450,  spread: 2, volatility: 1.5, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'TCS',        displayName: 'Tata Consultancy Services',    category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 4000,  spread: 2, volatility: 2,   contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'HDFCBANK',   displayName: 'HDFC Bank',                    category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 1700,  spread: 2, volatility: 1.5, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'INFY',       displayName: 'Infosys',                      category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 1800,  spread: 2, volatility: 1.6, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'ICICIBANK',  displayName: 'ICICI Bank',                   category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 1200,  spread: 2, volatility: 1.5, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'SBIN',       displayName: 'State Bank of India',          category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 830,   spread: 2, volatility: 1.5, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'ITC',        displayName: 'ITC',                          category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 460,   spread: 2, volatility: 1.2, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'BHARTIARTL', displayName: 'Bharti Airtel',                category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 1620,  spread: 2, volatility: 1.4, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'KOTAKBANK',  displayName: 'Kotak Mahindra Bank',          category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 1750,  spread: 2, volatility: 1.5, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'LT',         displayName: 'Larsen & Toubro',              category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 3600,  spread: 2, volatility: 1.6, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'AXISBANK',   displayName: 'Axis Bank',                    category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 1180,  spread: 2, volatility: 1.5, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'MARUTI',     displayName: 'Maruti Suzuki',                category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 12500, spread: 2, volatility: 1.7, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'HCLTECH',    displayName: 'HCL Technologies',             category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 1740,  spread: 2, volatility: 1.5, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'BAJFINANCE', displayName: 'Bajaj Finance',                category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 7300,  spread: 2, volatility: 1.8, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
  { code: 'ASIANPAINT', displayName: 'Asian Paints',                 category: 'INDIAN_EQUITY', pipSize: 0.05, digits: 2, startPrice: 2900,  spread: 2, volatility: 1.4, contractSize: 1, region: 'IN', currency: 'INR', lotSize: 1, hours: NSE_HOURS },
];

export const SYMBOL_BY_CODE = new Map(SYMBOLS.map((s) => [s.code, s] as const));
