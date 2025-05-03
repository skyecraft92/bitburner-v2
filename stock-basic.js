/** @param {NS} ns */
export async function main(ns) {
  // Basic stock market script - fallback for stockmaster.js
  // This provides read-only functionality without TIX API
  
  const config = {
    refreshRate: 6000,       // Refresh every 6 seconds
    monitorMode: true        // Monitor only mode (no TIX API needed)
  };
  
  ns.disableLog("ALL");
  ns.tail();
  
  ns.print("╔═════════════════════════════════════════╗");
  ns.print("║         BASIC STOCK MONITOR             ║");
  ns.print("║ Fallback system for stockmaster.js      ║");
  ns.print("╚═════════════════════════════════════════╝");
  
  // Helper to format money
  function formatMoney(amount) {
    const units = ['', 'k', 'm', 'b', 't'];
    let unitIndex = 0;
    
    while (amount >= 1000 && unitIndex < units.length - 1) {
      amount /= 1000;
      unitIndex++;
    }
    
    return `$${amount.toFixed(2)}${units[unitIndex]}`;
  }
  
  // Format percentage
  function formatPercent(value) {
    return `${(value * 100).toFixed(2)}%`;
  }
  
  // Get basic stock info that doesn't require TIX API
  function getStockInfo(stock) {
    const position = ns.stock.getPosition(stock);
    const price = ns.stock.getPrice(stock);
    const askPrice = ns.stock.getAskPrice(stock);
    const bidPrice = ns.stock.getBidPrice(stock);
    const maxShares = ns.stock.getMaxShares(stock);
    
    // Position information
    const sharesOwned = position[0];
    const avgPx = position[1];
    const shortShares = position[2];
    const avgShortPx = position[3];
    
    // Calculate position value
    const longValue = sharesOwned * bidPrice;
    const shortValue = shortShares * (2 * avgShortPx - askPrice);
    const totalValue = longValue + shortValue;
    
    // Calculate profit
    const longProfit = sharesOwned * (bidPrice - avgPx);
    const shortProfit = shortShares * (avgShortPx - askPrice);
    const totalProfit = longProfit + shortProfit;
    
    return {
      symbol: stock,
      price,
      askPrice,
      bidPrice,
      sharesOwned,
      shortShares,
      longValue,
      shortValue,
      totalValue,
      longProfit,
      shortProfit,
      totalProfit,
      maxShares
    };
  }
  
  function displayStocks() {
    // Get all stock symbols
    const stocks = ns.stock.getSymbols();
    
    // Get stock information
    const stocksInfo = stocks.map(stock => getStockInfo(stock));
    
    // Calculate portfolio stats
    const ownedStocks = stocksInfo.filter(s => s.sharesOwned > 0 || s.shortShares > 0);
    const totalValue = ownedStocks.reduce((sum, s) => sum + s.totalValue, 0);
    const totalProfit = ownedStocks.reduce((sum, s) => sum + s.totalProfit, 0);
    
    // Display portfolio summary
    ns.print("════════ PORTFOLIO SUMMARY ════════");
    ns.print(`Total Holdings: ${formatMoney(totalValue)}`);
    ns.print(`Total Profit: ${formatMoney(totalProfit)}`);
    ns.print(`Owned Stocks: ${ownedStocks.length}/${stocks.length}`);
    
    // Display owned stocks
    if (ownedStocks.length > 0) {
      ns.print("\n════════ OWNED POSITIONS ════════");
      for (const stock of ownedStocks) {
        if (stock.sharesOwned > 0) {
          const profitPercent = stock.longProfit / (stock.sharesOwned * stock.avgPx);
          ns.print(`${stock.symbol} LONG: ${formatMoney(stock.longValue)} | Profit: ${formatMoney(stock.longProfit)} (${formatPercent(profitPercent)})`);
        }
        if (stock.shortShares > 0) {
          const profitPercent = stock.shortProfit / (stock.shortShares * stock.avgShortPx);
          ns.print(`${stock.symbol} SHORT: ${formatMoney(stock.shortValue)} | Profit: ${formatMoney(stock.shortProfit)} (${formatPercent(profitPercent)})`);
        }
      }
    }
    
    // Display top 5 stocks by price
    const topByPrice = [...stocksInfo].sort((a, b) => b.price - a.price).slice(0, 5);
    ns.print("\n════════ TOP BY PRICE ════════");
    for (const stock of topByPrice) {
      ns.print(`${stock.symbol}: ${formatMoney(stock.price)}`);
    }
    
    // Show information about TIX API
    ns.print("\n════════ TIX API INFO ════════");
    ns.print("Basic TIX API costs $1b to purchase from the WSE.");
    ns.print("4S Market Data API costs $5b for advanced analysis.");
    ns.print("Visit World Stock Exchange in the city to purchase.");
    ns.print("Full functionality requires stockmaster.js.");
  }
  
  // Main loop
  while (true) {
    ns.clearLog();
    
    try {
      // Display the current stock information
      displayStocks();
    } catch (error) {
      ns.print(`ERROR: ${error}`);
    }
    
    await ns.sleep(config.refreshRate);
  }
} 