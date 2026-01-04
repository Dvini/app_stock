# Process Flow Diagrams

This document contains detailed flowcharts showing how key processes work in StockTracker.

---

## Table of Contents

1. [Dividend Synchronization](#dividend-synchronization)
2. [Transaction Processing](#transaction-processing)
3. [Price Fetching](#price-fetching)
4. [Portfolio Calculation](#portfolio-calculation)

---

## Dividend Synchronization

**Triggered by:** Page load if empty table OR >24h since last sync, or manual refresh button

```mermaid
flowchart TD
    Start([User Opens Dividends Page]) --> CheckTable{Dividend Table Empty?}
    CheckTable -->|Yes| StartSync[Start Auto-Sync]
    CheckTable -->|No| CheckTime{Last Sync > 24h?}
    CheckTime -->|Yes| StartSync
    CheckTime -->|No| Display[Display Existing Dividends]
    
    StartSync --> GetAssets[Get All Assets from DB]
    GetAssets --> LoopAssets{For Each Asset}
    
    LoopAssets --> TryAlpha[Try Alpha Vantage API]
    TryAlpha --> AlphaSuccess{Success?}
    AlphaSuccess -->|Yes| ParseDiv[Parse Dividend Data]
    AlphaSuccess -->|No| TryYahoo[Try Yahoo Finance API]
    
    TryYahoo --> YahooSuccess{Success?}
    YahooSuccess -->|Yes| ParseDiv
    YahooSuccess -->|No| CheckPolish{Ticker ends .WA?}
    
    CheckPolish -->|Yes| TryStooq[Try Stooq API]
    CheckPolish -->|No| SkipAsset[Skip Asset]
    
    TryStooq --> StooqSuccess{Success?}
    StooqSuccess -->|Yes| ParseDiv
    StooqSuccess -->|No| SkipAsset
    
    ParseDiv --> CheckDup{Already in DB?}
    CheckDup -->|Yes| Skip[Skip Duplicate]
    CheckDup -->|No| CalcShares[Calculate Shares Owned on Record Date]
    
    CalcShares --> GetNBP[Get NBP Exchange Rate]
    GetNBP --> CalcPLN[Calculate Value in PLN]
    CalcPLN --> SaveDB[(Save to IndexedDB)]
    
    SaveDB --> NextAsset{More Assets?}
    Skip --> NextAsset
    SkipAsset --> NextAsset
    NextAsset -->|Yes| LoopAssets
    NextAsset -->|No| UpdateTime[Update Last Sync Timestamp]
    
    UpdateTime --> Notify[Show Toast: X Dividends Added]
    Display --> End([End])
    Notify --> End
    
    style SaveDB fill:#10b981
    style Notify fill:#3b82f6
    style SkipAsset fill:#ef4444
```

**Key Decision Points:**
- **Auto-Sync Trigger:** Empty table OR >24h since last sync
- **API Fallback:** Alpha Vantage → Yahoo → Stooq (for .WA)
- **Duplicate Check:** By `ticker + recordDate` to prevent duplication
- **Shares Calculation:** Queries `transactions` table for ownership on record date

**Implementation:** `src/lib/DividendService.ts :: syncDividendsFromAPI()`

---

## Transaction Processing

**Triggered by:** User clicking "Add Transaction" button

```mermaid
flowchart TD
    Start([User Clicks Add Transaction]) --> OpenModal[Open Transaction Modal]
    OpenModal --> SelectType{Transaction Type}
    
    SelectType -->|Buy/Sell| EnterTicker[Enter Ticker Symbol]
    SelectType -->|Deposit/Withdraw| EnterAmount[Enter Cash Amount]
    
    EnterTicker --> AutoComplete[Show Ticker Autocomplete]
    AutoComplete --> FetchPrice[Fetch Current Price]
    FetchPrice --> EnterQuantity[Enter Quantity]
    EnterQuantity --> EnterDate[Select Date]
    
    EnterAmount --> SelectCurrency[Select Currency]
    SelectCurrency --> EnterDate
    
    EnterDate --> CheckCurrency{Foreign Currency?}
    CheckCurrency -->|Yes| FetchNBP[Fetch NBP Exchange Rate for Date]
    CheckCurrency -->|No| Validate
    
    FetchNBP --> NBPSuccess{Rate Found?}
    NBPSuccess -->|Yes| ShowRate[Display Rate - Allow Manual Edit]
    NBPSuccess -->|No| ManualRate[Require Manual Rate Entry]
    
    ShowRate --> Validate[Validate All Fields]
    ManualRate --> Validate
    
    Validate --> ValidationOK{Valid?}
    ValidationOK -->|No| ShowError[Show Validation Error]
    ShowError --> EnterTicker
    
    ValidationOK -->|Yes| CalculateTotal[Calculate Total Value]
    CalculateTotal --> BeginTx[(Begin DB Transaction)]
    
    BeginTx --> SaveTx[(Save to transactions Table)]
    SaveTx --> UpdateAsset{Transaction Type?}
    
    UpdateAsset -->|Buy| AddShares[Add Shares to assets Table]
    UpdateAsset -->|Sell| RemoveShares[Remove Shares from assets Table]
    UpdateAsset -->|Deposit| AddCash[Add to cash Table]
    UpdateAsset -->|Withdraw| RemoveCash[Subtract from cash Table]
    
    AddShares --> RecalcAvg[Recalculate Average Price]
    RemoveShares --> CheckZero{Quantity = 0?}
    CheckZero -->|Yes| DelAsset[(Delete Asset Record)]
    CheckZero -->|No| RecalcAvg
    
    RecalcAvg --> CommitTx[(Commit DB Transaction)]
    DelAsset --> CommitTx
    AddCash --> CommitTx
    RemoveCash --> CommitTx
    
    CommitTx --> LiveQuery[Dexie Live Query Triggers]
    LiveQuery --> UpdateUI[UI Auto-Updates]
    UpdateUI --> Toast[Show Success Toast]
    Toast --> End([Close Modal])
    
    style SaveTx fill:#10b981
    style CommitTx fill:#10b981
    style ShowError fill:#ef4444
    style Toast fill:#3b82f6
```

**Critical Steps:**
- **NBP Rate Fetching:** Automatic for foreign currencies with manual override option
- **Average Price Calculation:** Weighted by quantity for buys
- **Asset Cleanup:** Automatically removes asset when all shares sold
- **Live Query:** Dexie triggers UI updates automatically when DB changes

**Implementation:** `src/hooks/usePortfolio.ts :: addTransaction()`

---

## Price Fetching

**Triggered by:** UI component needing current price (Dashboard, Portfolio, etc.)

```mermaid
flowchart TD
    Start([UI Needs Price]) --> CheckCache{Check CacheService}
    CheckCache -->|Found & Fresh| ReturnCached[Return Cached Price]
    CheckCache -->|Not Found/Expired| FetchYahoo[Call Yahoo Finance API]
    
    FetchYahoo --> ParseResponse{Valid Response?}
    ParseResponse -->|Yes| ExtractPrice[Extract Price + Currency]
    ParseResponse -->|No| TryFallback[Try Alpha Vantage Fallback]
    
    TryFallback --> FallbackOK{Success?}
    FallbackOK -->|Yes| ExtractPrice
    FallbackOK -->|No| ReturnNull[Return null]
    
    ExtractPrice --> StoreCache[Store in CacheService - TTL 30min]
    StoreCache --> CheckNeedConvert{Need PLN Conversion?}
    
    CheckNeedConvert -->|Yes| GetNBPCurrent[Get Current NBP Rate]
    CheckNeedConvert -->|No| ReturnPrice[Return Price Object]
    
    GetNBPCurrent --> Convert[Convert to PLN]
    Convert --> ReturnPrice
    
    ReturnPrice --> UpdateUI[Update UI Component]
    ReturnCached --> UpdateUI
    ReturnNull --> ShowNA[Display N/A]
    
    UpdateUI --> End([Price Displayed])
    ShowNA --> End
    
    style StoreCache fill:#3b82f6
    style ReturnPrice fill:#10b981
    style ReturnNull fill:#ef4444
```

**Performance Optimizations:**
- **Aggressive Caching:** 30min TTL to minimize API calls
- **Fallback Strategy:** Yahoo Finance primary, Alpha Vantage secondary
- **Bulk Fetching:** Multiple prices fetched concurrently
- **Error Handling:** Graceful degradation to "N/A" on failure

**Implementation:** `src/lib/ApiService.ts :: fetchStockPrice()`

---

## Portfolio Calculation

**Triggered by:** Any database change (via Dexie Live Query)

```mermaid
flowchart TD
    Start([Page Load/DB Change]) --> LiveQuery[Dexie Live Query Fires]
    LiveQuery --> FetchAssets[(Query assets Table)]
    LiveQuery --> FetchCash[(Query cash Table)]
    LiveQuery --> FetchTx[(Query transactions Table)]
    
    FetchAssets --> LoopAssets{For Each Asset}
    LoopAssets --> GetPrice[Get Current Price - CacheService]
    GetPrice --> CalcValue[Calculate: quantity × price]
    CalcValue --> CalcCost[Calculate Cost Basis from Transactions]
    CalcCost --> CalcPL[Calculate P/L: value - cost]
    CalcPL --> StoreAssetData[Store in Memory]
    
    StoreAssetData --> NextAsset{More Assets?}
    NextAsset -->|Yes| LoopAssets
    NextAsset -->|No| SumAssets[Sum All Asset Values by Currency]
    
    FetchCash --> ConvertCash[Convert All Cash to PLN]
    ConvertCash --> SumCash[Sum Cash Values]
    
    FetchTx --> CalcInvested[Calculate Total Invested from Deposits]
    
    SumAssets --> AddCash[Add Cash to Asset Values]
    SumCash --> AddCash
    
    AddCash --> TotalValue[Total Portfolio Value PLN]
    CalcInvested --> CalcTotalPL[Calculate Total P/L]
    TotalValue --> CalcTotalPL
    
    CalcTotalPL --> GroupByCurrency[Group Values by Currency]
    GroupByCurrency --> PrepareBreakdown[Prepare Currency Breakdown Object]
    
    PrepareBreakdown --> ReturnData[Return Portfolio Summary]
    ReturnData --> ReactRerender[React Re-renders UI]
    ReactRerender --> End([Dashboard Updated])
    
    style FetchAssets fill:#10b981
    style FetchCash fill:#10b981
    style FetchTx fill:#10b981
    style ReturnData fill:#3b82f6
```

**Real-Time Updates:**
- **Dexie Live Query:** Automatically re-runs on any DB change
- **Currency Conversion:** All values normalized to PLN for totals
- **Breakdown:** Maintains original currencies for diversification view
- **Performance:** Calculations cached until next DB change

**Implementation:** `src/hooks/usePortfolio.ts :: useEffect + useLiveQuery`

---

## Quick Reference

| Process | Trigger | Primary Files | Key APIs |
|---------|---------|---------------|----------|
| **Dividend Sync** | Auto (24h) or Manual | `DividendService.ts`, `useDividends.ts` | Alpha Vantage, Yahoo, Stooq |
| **Add Transaction** | User action | `usePortfolio.ts`, `AddTransactionModal.tsx` | NBP (exchange rates) |
| **Price Fetch** | UI render | `ApiService.ts`, `usePrices.ts` | Yahoo Finance, Alpha Vantage |
| **Portfolio Calc** | DB change | `usePortfolio.ts` | None (local calculation) |

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-01-04
