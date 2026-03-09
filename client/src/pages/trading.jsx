import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  ArrowLeft,
  TrendingUp,
  BarChart3,
  LineChart,
  CandlestickChart,
  BookOpen,
  Lightbulb,
  Shield,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Activity,
  PieChart,
  Lock,
  Crown,
  Check,
  Copy,
  Loader2,
  CreditCard,
} from "lucide-react";
import { SiPaypal } from "react-icons/si";
const BANK_IBAN = "BE83 9741 5006 8915";
const BANK_HOLDER = "Laszlo Raul-Teodor";
const PRICING = {
  monthly: { amount: "10.00", label: "/month" },
  yearly: { amount: "100.00", label: "/year", savings: "Save 20 EUR" },
};
const DEMO_PRICES = [
  50, 55, 53, 60, 58, 62, 65, 63, 68, 72, 69, 75, 78, 74, 80,
];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
];
function TradingChart({ data, labels }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const minVal = Math.min(...data) - 5;
    const maxVal = Math.max(...data) + 5;
    const range = maxVal - minVal;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      const val = maxVal - (range / 4) * i;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`$${val.toFixed(0)}`, padding.left - 8, y + 4);
    }
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    data.forEach((_, i) => {
      const x = padding.left + (chartW / (data.length - 1)) * i;
      if (i % 2 === 0 && labels[i]) {
        ctx.fillText(labels[i], x, h - 10);
      }
    });
    const gradient = ctx.createLinearGradient(
      0,
      padding.top,
      0,
      padding.top + chartH,
    );
    gradient.addColorStop(0, "rgba(0, 200, 255, 0.3)");
    gradient.addColorStop(1, "rgba(0, 200, 255, 0.02)");
    ctx.beginPath();
    data.forEach((val, i) => {
      const x = padding.left + (chartW / (data.length - 1)) * i;
      const y = padding.top + chartH - ((val - minVal) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const lastX = padding.left + chartW;
    const firstX = padding.left;
    ctx.lineTo(lastX, padding.top + chartH);
    ctx.lineTo(firstX, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    data.forEach((val, i) => {
      const x = padding.left + (chartW / (data.length - 1)) * i;
      const y = padding.top + chartH - ((val - minVal) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "rgba(0, 200, 255, 1)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    data.forEach((val, i) => {
      const x = padding.left + (chartW / (data.length - 1)) * i;
      const y = padding.top + chartH - ((val - minVal) / range) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#00c8ff";
      ctx.fill();
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }, [data, labels]);
  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ width: "100%", height: "100%" }}
      data-testid="canvas-trading-chart"
    />
  );
}
const EXPLANATIONS = {
  RSI: {
    title: "RSI (Relative Strength Index)",
    text: "RSI shows overbought/oversold conditions on a 0\u2013100 scale. Values above 70 indicate overbought (potential sell signal), below 30 indicate oversold (potential buy signal). A seasoned trader uses RSI alongside other indicators \u2014 never in isolation. Look for divergences between RSI and price for stronger signals.",
    icon: Activity,
  },
  MACD: {
    title: "MACD (Moving Average Convergence Divergence)",
    text: "MACD measures trend strength and momentum using two moving averages. When the MACD line crosses above the signal line, it\u2019s a bullish signal. When it crosses below, it\u2019s bearish. The histogram shows the distance between the lines \u2014 growing bars mean increasing momentum. Pro tip: MACD works best in trending markets, not sideways ones.",
    icon: LineChart,
  },
  "Support/Resistance": {
    title: "Support & Resistance Levels",
    text: "Support is a price floor where buying pressure is strong enough to stop a decline. Resistance is a price ceiling where selling pressure prevents further rise. Prices often bounce between these levels. When a support level breaks, it becomes resistance (and vice versa). Experienced traders watch these zones for entry/exit opportunities.",
    icon: BarChart3,
  },
  Volume: {
    title: "Volume Analysis",
    text: "Volume shows how many units are traded in a period. High volume during a price move confirms the trend\u2019s strength. Low volume suggests weak conviction. A breakout above resistance on high volume is a strong buy signal. Divergence between price and volume often precedes reversals. Always confirm moves with volume.",
    icon: BarChart3,
  },
  Candlesticks: {
    title: "Candlestick Patterns",
    text: "Each candlestick shows open, high, low, and close for a time period. Green/white = price went up, Red/black = price went down. Key patterns: Doji (indecision), Hammer (potential reversal), Engulfing (strong reversal). Three white soldiers and three black crows indicate strong trends. Combine with volume for confirmation.",
    icon: CandlestickChart,
  },
  DeFi: {
    title: "DeFi (Decentralized Finance)",
    text: "DeFi removes middlemen from financial services using smart contracts. Key concepts: Liquidity pools (provide tokens, earn fees), Yield farming (maximize returns across protocols), Lending/borrowing (earn interest or leverage positions). Always research smart contract audits, check TVL (Total Value Locked), and understand impermanent loss before providing liquidity.",
    icon: PieChart,
  },
  NFT: {
    title: "NFT Trading",
    text: "NFTs (Non-Fungible Tokens) are unique digital assets. Value depends on rarity, utility, community, and demand. Key metrics: Floor price, volume, holder count, and unique traits. Blue-chip collections (CryptoPunks, BAYC) are considered safer. Always verify contract addresses, check royalty fees, and understand that NFT markets are highly speculative.",
    icon: DollarSign,
  },
  Risk: {
    title: "Risk Management",
    text: "The #1 rule: never risk more than 1-2% of your portfolio on a single trade. Use stop-loss orders to limit downside. Take-profit orders lock in gains. Diversify across assets and strategies. Position sizing matters more than entry timing. A trader with 30 years of experience will tell you: preserving capital is more important than making profits.",
    icon: Shield,
  },
};
const STRATEGIES = [
  {
    title: "Golden Cross Breakout",
    spot: "Buy when the 50-day moving average crosses above the 200-day moving average. This signals a strong bullish trend reversal. Enter at the crossover point, set stop-loss 3% below entry. Hold until price closes below the 50-day MA.",
    futures:
      "Open a long position with 5x leverage at the golden cross. Set take-profit at 2x the distance from the 200-day MA to entry. Use a trailing stop of 2% to lock in profits as the trend develops.",
  },
  {
    title: "Death Cross Short",
    spot: "Sell holdings when the 50-day MA crosses below the 200-day MA. This bearish signal suggests prolonged downside. Convert to stablecoins and wait for the next golden cross to re-enter.",
    futures:
      "Open a short position with 3-5x leverage. Target previous support levels as take-profit zones. Set stop-loss 2% above the crossover point. Scale out at each support level hit.",
  },
  {
    title: "RSI Divergence Entry",
    spot: "When price makes a lower low but RSI makes a higher low, a bullish divergence forms. Buy at the second RSI low with confirmation from a green candle. Stop-loss below the recent swing low.",
    futures:
      "Enter long with 3x leverage on bullish RSI divergence. Use the divergence distance to calculate your take-profit (1.5x the divergence range). Tighten stops once in profit.",
  },
  {
    title: "MACD Histogram Reversal",
    spot: "Buy when the MACD histogram turns from negative to positive (bars start growing above zero). Confirm with volume increase. Exit when histogram peaks and starts declining.",
    futures:
      "Go long with 5x leverage when histogram crosses zero upward. Set take-profit at the average histogram peak height from previous cycles. Stop-loss at the recent swing low.",
  },
  {
    title: "Support Bounce Trading",
    spot: "Identify strong support levels where price has bounced at least 3 times. Place buy orders at support with stop-loss 2% below. Take profit at the midpoint between support and resistance.",
    futures:
      "Enter long at support with 3x leverage. Set stop-loss just below the support zone. Target the resistance level as take-profit. Risk-reward should be at least 1:2.",
  },
  {
    title: "Resistance Breakout",
    spot: "Wait for price to break above a well-tested resistance level with high volume. Buy on the breakout candle close. The broken resistance becomes new support - place stop-loss just below it.",
    futures:
      "Open long with 5x leverage on confirmed breakout (close above resistance + volume spike). Stop-loss at the broken resistance level. Target the next resistance zone or use measured move technique.",
  },
  {
    title: "Double Bottom Pattern",
    spot: "Identify two price lows at similar levels with a moderate peak between them. Buy when price breaks above the peak (neckline). Stop-loss below the double bottom. Target: neckline to bottom distance projected upward.",
    futures:
      "Enter long with 5x leverage on neckline break. The measured move target equals the pattern height added to the breakout point. Stop-loss at the lower of the two bottoms.",
  },
  {
    title: "Head and Shoulders Reversal",
    spot: "Sell when price breaks below the neckline of a head and shoulders pattern. This is a powerful bearish reversal. The target is the head-to-neckline distance projected downward from the break.",
    futures:
      "Short with 3x leverage on neckline break. Target the measured move (head height projected down). Stop-loss above the right shoulder. Scale into the position on any retest of the neckline.",
  },
  {
    title: "Bollinger Band Squeeze",
    spot: "When Bollinger Bands contract tightly (squeeze), a big move is coming. Wait for the breakout direction. Buy if price breaks above the upper band with volume. Sell if it breaks below the lower band.",
    futures:
      "After a squeeze, enter in the breakout direction with 5x leverage. The squeeze duration correlates with move magnitude. Stop-loss at the opposite band. Target 2x the band width.",
  },
  {
    title: "Volume Profile Trading",
    spot: "Buy at high-volume nodes (price levels where most trading occurred) as they act as strong support. Avoid low-volume nodes as price moves quickly through them. Use the point of control as your key level.",
    futures:
      "Enter long at the value area low with 3x leverage. Target the value area high. Stop-loss below the high-volume node. This strategy works best in ranging markets.",
  },
  {
    title: "Fibonacci Retracement Entry",
    spot: "After a strong uptrend, wait for a pullback to the 0.618 Fibonacci level. Buy with confirmation (bullish candle at the level). Stop-loss below the 0.786 level. Target the previous high and beyond.",
    futures:
      "Go long at the 0.618 retracement with 5x leverage. Set stop-loss at 0.786. First target is the swing high (1.0 level), second target is the 1.618 extension. Scale out at each level.",
  },
  {
    title: "Ichimoku Cloud Strategy",
    spot: "Buy when price is above the cloud and the Tenkan-sen crosses above Kijun-sen. The cloud acts as dynamic support. Exit when price enters the cloud or Tenkan crosses below Kijun.",
    futures:
      "Enter long with 3x leverage when all Ichimoku signals align bullish (price above cloud, TK cross, future cloud green). Stop-loss at the Kijun-sen. Target previous swing highs.",
  },
  {
    title: "Engulfing Candle Reversal",
    spot: "Buy on a bullish engulfing pattern at support. The second candle must completely cover the first candle's body. Confirm with above-average volume. Stop-loss below the engulfing candle's low.",
    futures:
      "Go long with 5x leverage on bullish engulfing at a key support level. Stop-loss below the pattern low. Target the nearest resistance level. Best when combined with oversold RSI.",
  },
  {
    title: "Morning Star Pattern",
    spot: "A three-candle reversal: bearish candle, small-bodied candle (indecision), then bullish candle. Buy at the close of the third candle. Stop-loss below the middle candle. Very reliable at key support levels.",
    futures:
      "Enter long with 3x leverage on morning star completion at support. Stop-loss below the star candle. Target 2x the pattern height. Confirm with volume increasing on the third candle.",
  },
  {
    title: "Three White Soldiers",
    spot: "Three consecutive long-bodied green candles with progressively higher closes. This signals strong buying pressure. Enter on the close of the third candle. Stop-loss below the first soldier's open.",
    futures:
      "Go long with 5x leverage after three white soldiers form. Target the height of all three candles projected upward. Trailing stop of 1.5% to ride the momentum.",
  },
  {
    title: "Doji Star Reversal",
    spot: "A doji candle after a strong trend signals indecision. If followed by a reversal candle, enter in the new direction. At the top of an uptrend, sell. At the bottom of a downtrend, buy.",
    futures:
      "Enter with 3x leverage in the reversal direction after doji confirmation. Stop-loss beyond the doji's wick. The reversal candle's size indicates the strength of the move.",
  },
  {
    title: "Gap Fill Strategy",
    spot: "Price gaps tend to fill. If price gaps up, sell near the gap level expecting a pullback to fill. If price gaps down, buy expecting a recovery. Works best on high-cap assets with good liquidity.",
    futures:
      "Trade the gap fill with 3x leverage. Enter in the fill direction once price starts moving back. Stop-loss at 50% gap extension. Take-profit when the gap is 80% filled.",
  },
  {
    title: "Ascending Triangle Breakout",
    spot: "Flat resistance with rising support trendline. Buy when price breaks above the flat resistance on high volume. Target is the triangle height projected from the breakout point. Stop-loss at the last higher low.",
    futures:
      "Enter long with 5x leverage on breakout above the flat top. Stop-loss below the ascending trendline. Measured move target equals the triangle's widest point added to breakout.",
  },
  {
    title: "Descending Triangle Breakdown",
    spot: "Flat support with descending resistance. Sell when price breaks below flat support. Target is the triangle height projected downward. This pattern has a bearish bias in most market conditions.",
    futures:
      "Short with 5x leverage on breakdown below flat support. Stop-loss above the descending trendline. Target the measured move. Scale out at key support levels below.",
  },
  {
    title: "Bull Flag Continuation",
    spot: "After a strong upward move (flagpole), price consolidates in a slight downward channel (flag). Buy when price breaks above the flag. Target is the flagpole length added to the breakout point.",
    futures:
      "Go long with 5x leverage on flag breakout. The flagpole length gives your measured move target. Stop-loss below the flag's lower boundary. This is one of the most reliable continuation patterns.",
  },
  {
    title: "Bear Flag Short",
    spot: "After a sharp decline, price consolidates in a slight upward channel. Sell when price breaks below the flag. Target equals the flagpole projected down from the breakdown point.",
    futures:
      "Short with 5x leverage on bear flag breakdown. Stop-loss above the flag's upper boundary. Target the flagpole projection. Best when volume decreases during the flag formation.",
  },
  {
    title: "Cup and Handle Pattern",
    spot: "A rounded bottom (cup) followed by a small consolidation (handle). Buy on breakout above the handle's resistance. Target is the cup depth added to the breakout. Very bullish long-term pattern.",
    futures:
      "Enter long with 3x leverage on handle breakout. Stop-loss below the handle low. First target: cup depth as measured move. This pattern often leads to sustained rallies.",
  },
  {
    title: "Wedge Breakout Strategy",
    spot: "Rising wedges break down (bearish), falling wedges break up (bullish). Trade the breakout direction. For falling wedges, buy on upside break with stop below the wedge low. Target: wedge entry width.",
    futures:
      "Trade the wedge breakout with 5x leverage. Falling wedge = long, rising wedge = short. Stop-loss inside the wedge. The breakout is often explosive and fast.",
  },
  {
    title: "VWAP Bounce Trading",
    spot: "Buy when price pulls back to the Volume Weighted Average Price (VWAP) in an uptrend. VWAP acts as dynamic support during bullish days. Sell if price closes below VWAP.",
    futures:
      "Go long at VWAP in an uptrending market with 3x leverage. Stop-loss 0.5% below VWAP. Target the previous high or VWAP upper deviation band. Works best for intraday trades.",
  },
  {
    title: "Mean Reversion Strategy",
    spot: "When price moves 2+ standard deviations from its 20-day moving average, expect reversion. Buy oversold extremes, sell overbought extremes. Use RSI confirmation below 30 or above 70.",
    futures:
      "Enter counter-trend with 2x leverage at 2 standard deviations. Stop-loss at 3 standard deviations. Target the 20-day mean. Lower leverage due to counter-trend nature.",
  },
  {
    title: "Momentum Breakout",
    spot: "Screen for assets with RSI crossing above 60 from below, accompanied by rising volume and MACD crossover. Enter immediately and ride the momentum. Trail stop at 5% below the high.",
    futures:
      "Go long with 5x leverage on momentum confirmation (RSI > 60, volume spike, MACD cross). Use a trailing stop of 2%. Target open-ended - let the trend run with the trailing stop.",
  },
  {
    title: "Pullback to EMA Strategy",
    spot: "In a strong uptrend, buy pullbacks to the 21-period EMA. Price should touch or slightly penetrate the EMA before bouncing. Confirm with a bullish candle at the EMA. Stop-loss below the EMA.",
    futures:
      "Enter long at the 21 EMA with 5x leverage during uptrends. Stop-loss 1% below the EMA. Target the recent swing high. Works consistently in trending markets.",
  },
  {
    title: "Triple Moving Average System",
    spot: "Use 10, 20, and 50 EMAs. Buy when 10 > 20 > 50 (all aligned bullish). Sell when 10 < 20 < 50. The alignment confirms trend strength. Enter on pullbacks to the 20 EMA.",
    futures:
      "Go long with 3x leverage when all three EMAs align bullish. Stop-loss below the 50 EMA. Hold as long as alignment persists. Switch to short when alignment flips bearish.",
  },
  {
    title: "Stochastic Oversold Bounce",
    spot: "Buy when the Stochastic oscillator drops below 20 and then crosses back above. Confirm with price at a support level. Stop-loss below support. Target the 50-level of the Stochastic range.",
    futures:
      "Enter long with 3x leverage on Stochastic cross above 20. Stop-loss below the recent low. Target when Stochastic reaches 80. Best in ranging or mildly trending markets.",
  },
  {
    title: "ADX Trend Strength Trading",
    spot: "Only trade when ADX is above 25 (strong trend). Buy in uptrends (positive DI above negative DI). Avoid trading when ADX is below 20 (no clear trend). Use other indicators for entry timing.",
    futures:
      "Enter with 5x leverage only when ADX > 30 (very strong trend). Use DI crossovers for direction. Stop-loss when ADX drops below 20. Strong ADX readings produce the best leveraged returns.",
  },
  {
    title: "Parabolic SAR Trend Following",
    spot: "Buy when SAR dots appear below price (bullish). Sell when dots flip above price (bearish). Each dot is a potential stop-loss level. Simple and effective for trend following.",
    futures:
      "Enter long with 3x leverage when SAR flips below price. Use the SAR dot as your trailing stop-loss. Exit when dots flip above price. Works well in trending markets, avoid during ranges.",
  },
  {
    title: "Channel Trading Range",
    spot: "Identify parallel support and resistance channels. Buy at the lower channel line, sell at the upper channel line. Works in sideways markets. Stop-loss below the lower channel with small buffer.",
    futures:
      "Trade both directions with 3x leverage within the channel. Long at lower boundary, short at upper boundary. Stop-loss outside the channel. Target the opposite channel line.",
  },
  {
    title: "Harmonic Bat Pattern",
    spot: "Identify the Bat harmonic pattern (specific Fibonacci ratios: XA, AB=38.2-50%, BC=38.2-88.6%, CD=88.6% of XA). Enter at point D completion. Stop-loss below X. Target 38.2% and 61.8% of CD leg.",
    futures:
      "Enter at point D with 3x leverage. Stop-loss below point X. First take-profit at 38.2% CD retracement. Second target at 61.8%. Harmonic patterns have high accuracy when properly identified.",
  },
  {
    title: "Elliott Wave Riding",
    spot: "Buy at the start of Wave 3 (the strongest wave). Wave 3 begins after Wave 2 retraces 50-61.8% of Wave 1. Enter with confirmation of Wave 3 starting. Target: Wave 3 is usually 1.618x Wave 1.",
    futures:
      "Go long with 5x leverage at the start of Wave 3. Stop-loss below Wave 2's low. Target 1.618 extension of Wave 1. Wave 3 never the shortest - this gives confidence in the target.",
  },
  {
    title: "Order Block Entry",
    spot: "Identify institutional order blocks (the last bearish candle before a strong bullish move, or vice versa). When price returns to this zone, enter in the original breakout direction. Smart money left unfilled orders here.",
    futures:
      "Enter at the order block with 5x leverage. Stop-loss below the order block. Target the next liquidity zone. This strategy follows institutional money flow.",
  },
  {
    title: "Fair Value Gap Fill",
    spot: "When price moves sharply creating a gap between candle wicks (fair value gap), expect price to return and fill it. Buy at the gap in bullish markets, sell at the gap in bearish markets.",
    futures:
      "Trade the FVG fill with 3x leverage. Enter when price reaches the gap zone. Stop-loss beyond the gap. Target the origin of the impulsive move that created the gap.",
  },
  {
    title: "Liquidity Sweep Entry",
    spot: "Watch for price to sweep below a key low (stopping out weak hands), then reverse sharply. This is smart money grabbing liquidity. Enter long after the sweep with confirmation. Stop-loss below the sweep low.",
    futures:
      "Enter long with 5x leverage after a liquidity sweep below a key level, confirmed by a strong reversal candle. Stop-loss below the sweep wick. Target the opposite liquidity pool above.",
  },
  {
    title: "Market Structure Break",
    spot: "In a downtrend, a break of market structure occurs when price makes a higher high (breaking the pattern of lower highs). Buy on this break with stop-loss below the recent higher low. Trend reversal confirmed.",
    futures:
      "Go long with 5x leverage on market structure break (higher high after downtrend). Stop-loss below the higher low. Target the next significant resistance. This signals trend change.",
  },
  {
    title: "Supply and Demand Zones",
    spot: "Identify supply zones (where price dropped sharply from) and demand zones (where price rallied sharply from). Buy at demand zones, sell at supply zones. These are areas of institutional interest.",
    futures:
      "Enter long at demand zones with 3x leverage, short at supply zones. Stop-loss beyond the zone. The first retest of a zone is the strongest. Zones weaken with each subsequent visit.",
  },
  {
    title: "Range Breakout with Volume",
    spot: "After prolonged sideways movement, buy the breakout direction only if accompanied by 2x average volume. Low-volume breakouts often fail. Set stop-loss at the range midpoint. Target: range height projected from breakout.",
    futures:
      "Enter with 5x leverage on high-volume range breakout. Volume must be at least 2x the 20-period average. Stop-loss inside the range. Target the measured move (range height).",
  },
  {
    title: "Divergence Exit Strategy",
    spot: "When holding a profitable position, watch for bearish divergence on RSI or MACD (price making higher highs but indicator making lower highs). This warns of trend exhaustion. Take profits and tighten stops.",
    futures:
      "When in profit on a long position, close 50% on first bearish divergence signal. Trail stop tightly on remaining 50%. Reverse to short if divergence leads to structure break.",
  },
  {
    title: "News Fade Strategy",
    spot: "After major news causes an extreme price spike, wait for the initial move to exhaust (15-30 minutes). Trade the fade (reversal) as emotional traders exit. Works best with unexpected news that causes overreaction.",
    futures:
      "Fade the news spike with 2x leverage (lower due to volatility). Enter counter to the spike after 15-30 min stabilization. Wide stop-loss (2x normal). Target 50% retracement of the spike.",
  },
  {
    title: "Correlation Pair Trading",
    spot: "Find two highly correlated assets. When the correlation breaks (one rises while the other doesn't), buy the lagging asset expecting catch-up. Sell when correlation normalizes. Low-risk market-neutral strategy.",
    futures:
      "Go long the underperforming asset and short the outperforming one with equal leverage (2x each). Target convergence. This hedged approach limits directional risk while profiting from relative movement.",
  },
  {
    title: "DeFi Yield Optimization",
    spot: "Provide liquidity to DEX pools with high APY but check for impermanent loss risk. Pair stablecoins for low risk. For volatile pairs, ensure the APY exceeds potential IL. Compound rewards regularly.",
    futures:
      "Use futures to hedge impermanent loss in DeFi LP positions. If you're providing ETH-USDC liquidity, short ETH futures to offset directional exposure. Your yield becomes pure fee income.",
  },
  {
    title: "NFT Floor Price Strategy",
    spot: "Buy NFTs at or slightly above floor price in established collections (high holder count, consistent volume). Wait for floor to rise with market sentiment. Sell at 2-3x floor. Only blue-chip collections.",
    futures:
      "There are no direct NFT futures, but you can use ETH futures as a proxy. If the NFT market is heating up, go long ETH with 3x leverage as NFT activity drives ETH demand.",
  },
  {
    title: "Dollar Cost Averaging Plus",
    spot: "DCA into positions weekly/monthly, but increase allocation when RSI is below 30 (oversold) and decrease when RSI is above 70 (overbought). This enhanced DCA outperforms basic fixed-amount DCA over time.",
    futures:
      "Combine DCA with futures hedging. DCA into spot positions for long-term holding while using short futures during overbought conditions to protect gains. Remove hedges when oversold.",
  },
  {
    title: "Whale Wallet Tracking",
    spot: "Monitor large wallet movements on-chain. When whales accumulate an asset, follow with smaller positions. When whales distribute, exit. Use blockchain explorers and whale alert services for tracking.",
    futures:
      "When whale accumulation is detected, go long with 3x leverage. Whale buying often precedes major moves. Set stop-loss tight since whale signals can be misleading. Target 10-20% moves.",
  },
  {
    title: "Seasonal Cycle Trading",
    spot: "Many assets have seasonal patterns. Historically, Q4 tends to be bullish for crypto. 'Sell in May' applies to some markets. Study the asset's historical monthly returns and trade the seasonal bias.",
    futures:
      "Go long with 3x leverage during historically strong months. Short during weak months. Combine with technical confirmation for timing. Seasonal trends are probabilities, not certainties.",
  },
  {
    title: "Multi-Timeframe Confirmation",
    spot: "Analyze weekly, daily, and 4-hour charts. Only trade when all three timeframes agree on direction. Weekly sets the trend, daily shows the setup, 4-hour provides the entry. This filters out false signals.",
    futures:
      "Enter with 5x leverage only when weekly, daily, and 4H all confirm. Use the 4H chart for precise entry. Stop-loss based on daily chart structure. This high-conviction setup justifies higher leverage.",
  },
  {
    title: "Volatility Contraction Breakout",
    spot: "When ATR (Average True Range) contracts to its lowest in 20 periods, a volatile move is imminent. Wait for the direction, then enter aggressively. Contracting volatility always precedes expansion.",
    futures:
      "Enter with 5x leverage when ATR contracts to 20-period low and price breaks the recent range. The ensuing expansion move is often 3-5x the contracted range. Stop-loss at the opposite side of the range.",
  },
];
const STRATEGIES_PER_PAGE = 10;
const TUTORIALS = [
  {
    title: "1. What is Trading?",
    content:
      "Trading is the process of buying and selling assets like cryptocurrencies, stocks, or NFTs to generate profits. A seasoned trader studies the market, understands patterns, analyzes charts, and manages risk carefully. It\u2019s not gambling \u2014 it\u2019s a discipline that requires education, patience, and emotional control.",
  },
  {
    title: "2. Understanding Charts",
    content:
      "Price charts are your primary tool. They show the price history of an asset over time. Candlestick charts reveal trends, support & resistance levels, and help you decide entry and exit points. The chart below shows a demo asset price \u2014 notice the uptrend with pullbacks, which is a healthy pattern.",
  },
  {
    title: "3. Trading Types",
    content:
      "Spot Trading: Buy/sell actual assets at current market price. Futures: Contracts predicting price changes with leverage. DeFi: Decentralized finance protocols for lending, staking, and yield farming. NFTs: Unique digital assets with value based on rarity and demand. Each type has different risk/reward profiles.",
  },
  {
    title: "4. Key Indicators",
    content:
      "RSI, MACD, and Moving Averages are essential indicators. RSI shows overbought/oversold conditions. MACD indicates trend strength and momentum. Moving averages smooth price data to show trend direction. Click the buttons below to learn about each one in detail.",
  },
  {
    title: "5. Advanced Tips from 30 Years of Experience",
    content:
      "Always manage risk: use stop-loss, take-profit, and never risk more than you can afford to lose. Diversify your portfolio. Analyze volume alongside price. Trade with the trend, not against it. Be patient \u2014 the best trades come to those who wait. Keep a trading journal. Emotions are your worst enemy.",
  },
];
function TradingPaywall({ hasPending }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subPeriod, setSubPeriod] = useState("monthly");
  const [payMethod, setPayMethod] = useState("paypal");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(null);
  const paypalRef = useRef(null);
  const [paypalLoading, setPaypalLoading] = useState(true);
  const [paypalError, setPaypalError] = useState(null);
  const pricing = PRICING[subPeriod];
  const orderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/premium/order", {
        transferReference: reference,
        notes: notes || undefined,
        orderType: "trading",
        subscriptionPeriod: subPeriod,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trading/access"] });
      toast({ title: "Order submitted! Awaiting admin confirmation." });
      setReference("");
      setNotes("");
    },
    onError: () => {
      toast({ title: "Error submitting order", variant: "destructive" });
    },
  });
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };
  const loadPayPal = useCallback(async () => {
    try {
      const res = await fetch("/api/premium/paypal/client-id");
      if (!res.ok) {
        setPaypalError("PayPal not available");
        setPaypalLoading(false);
        return;
      }
      const { clientId } = await res.json();
      if (document.getElementById("paypal-sdk-script")) {
        setPaypalLoading(false);
        return;
      }
      const script = document.createElement("script");
      script.id = "paypal-sdk-script";
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=EUR`;
      script.async = true;
      script.onload = () => {
        setPaypalLoading(false);
      };
      script.onerror = () => {
        setPaypalError("Failed to load PayPal");
        setPaypalLoading(false);
      };
      document.head.appendChild(script);
    } catch {
      setPaypalError("PayPal not available");
      setPaypalLoading(false);
    }
  }, []);
  const renderPayPal = useCallback(() => {
    if (!paypalRef.current || !window.paypal) return;
    paypalRef.current.innerHTML = "";
    window.paypal
      .Buttons({
        style: {
          layout: "vertical",
          color: "gold",
          shape: "rect",
          label: "pay",
          height: 48,
        },
        createOrder: async () => {
          const res = await apiRequest(
            "POST",
            "/api/premium/paypal/create-order",
            { orderType: "trading", subscriptionPeriod: subPeriod },
          );
          const data = await res.json();
          return data.orderID;
        },
        onApprove: async (data) => {
          try {
            const res = await apiRequest(
              "POST",
              "/api/premium/paypal/capture-order",
              { orderID: data.orderID },
            );
            const result = await res.json();
            if (result.success) {
              toast({
                title: `Payment successful! Trading Academy unlocked for 1 ${subPeriod === "yearly" ? "year" : "month"}!`,
              });
              queryClient.invalidateQueries({
                queryKey: ["/api/trading/access"],
              });
            } else {
              toast({ title: "Payment issue", variant: "destructive" });
            }
          } catch {
            toast({ title: "Payment failed", variant: "destructive" });
          }
        },
        onError: () => {
          toast({ title: "PayPal error", variant: "destructive" });
        },
      })
      .render(paypalRef.current);
  }, [toast, queryClient, subPeriod]);
  useEffect(() => {
    if (payMethod === "paypal") loadPayPal();
  }, [payMethod, loadPayPal]);
  useEffect(() => {
    if (
      !paypalLoading &&
      !paypalError &&
      window.paypal &&
      payMethod === "paypal"
    ) {
      renderPayPal();
    }
  }, [paypalLoading, paypalError, renderPayPal, payMethod, subPeriod]);
  return (
    <div className="max-w-2xl mx-auto">
      {hasPending && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6 text-center">
          <p className="text-sm text-yellow-400 font-medium">
            You have a pending payment awaiting admin confirmation.
          </p>
        </div>
      )}

      <div className="text-center mb-8">
        <div className="w-20 h-20 mx-auto bg-cyan-500/20 rounded-2xl flex items-center justify-center mb-4">
          <TrendingUp className="w-10 h-10 text-cyan-400" />
        </div>
        <h2
          className="text-3xl font-bold mb-2"
          data-testid="text-trading-title"
        >
          Mara AI Trading Academy
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Learn trading from Mara AI with 30 years of experience. Interactive
          charts, indicators, DeFi, NFTs, and professional strategies.
        </p>
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-6 mb-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-cyan-400" />
          What's Included
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            "Interactive price charts",
            "50 professional trading strategies",
            "Spot & Futures explanations for each",
            "RSI, MACD, Candlestick analysis",
            "DeFi & NFT strategies",
            "Risk management masterclass",
            "Support & Resistance techniques",
            "Mara AI trading mentor Q&A",
            "Step-by-step tutorials",
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-cyan-400 shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-xl p-6 mb-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Target className="w-5 h-5 text-orange-400" />
          Strategy Preview ({STRATEGIES.length} Strategies)
        </h3>
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-2">
          {STRATEGIES.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30"
              data-testid={`preview-strategy-${i}`}
            >
              <span className="w-7 h-7 rounded-md bg-cyan-500/10 flex items-center justify-center text-cyan-400 text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <span className="text-sm font-medium flex-1">{s.title}</span>
              <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-3">
          Subscribe to unlock full Spot & Futures details for all strategies
        </p>
      </div>

      {/* Subscription Period Toggle */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setSubPeriod("monthly")}
          className={`flex-1 py-4 rounded-xl border-2 transition text-center ${subPeriod === "monthly" ? "border-cyan-500/50 bg-cyan-500/10" : "border-border/50 bg-card"}`}
          data-testid="button-period-monthly"
        >
          <p className="text-2xl font-bold text-cyan-400">&euro;10</p>
          <p className="text-sm text-muted-foreground">per month</p>
        </button>
        <button
          onClick={() => setSubPeriod("yearly")}
          className={`flex-1 py-4 rounded-xl border-2 transition text-center relative ${subPeriod === "yearly" ? "border-cyan-500/50 bg-cyan-500/10" : "border-border/50 bg-card"}`}
          data-testid="button-period-yearly"
        >
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-green-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
            SAVE &euro;20
          </span>
          <p className="text-2xl font-bold text-cyan-400">&euro;100</p>
          <p className="text-sm text-muted-foreground">per year</p>
        </button>
      </div>

      <p className="text-xs text-muted-foreground text-center mb-6">
        {subPeriod === "monthly"
          ? "Pay each month to keep access. Renew when it expires."
          : "Pay once for 12 months of access. Best value!"}
      </p>

      {/* Payment Methods */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setPayMethod("paypal")}
          className={`flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition ${payMethod === "paypal" ? "bg-cyan-500/20 border-2 border-cyan-500/50 text-cyan-400" : "bg-card border border-border/50"}`}
          data-testid="button-pay-paypal"
        >
          <SiPaypal className="w-4 h-4" />
          PayPal
        </button>
        <button
          onClick={() => setPayMethod("bank")}
          className={`flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition ${payMethod === "bank" ? "bg-cyan-500/20 border-2 border-cyan-500/50 text-cyan-400" : "bg-card border border-border/50"}`}
          data-testid="button-pay-bank"
        >
          <CreditCard className="w-4 h-4" />
          Bank Transfer
        </button>
      </div>

      {payMethod === "paypal" && (
        <div className="bg-card border border-border/50 rounded-xl p-6">
          {paypalLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {paypalError && (
            <p className="text-center text-muted-foreground text-sm py-4">
              {paypalError}
            </p>
          )}
          <div ref={paypalRef} data-testid="paypal-trading-container" />
        </div>
      )}

      {payMethod === "bank" && (
        <div className="bg-card border border-border/50 rounded-xl p-6 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
              Bank Details
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                <div>
                  <p className="text-xs text-muted-foreground">IBAN</p>
                  <p className="font-mono text-sm font-medium">{BANK_IBAN}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(BANK_IBAN, "iban")}
                  className="p-2 rounded-md hover:bg-muted transition"
                  data-testid="button-copy-iban"
                >
                  {copied === "iban" ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Account Holder
                  </p>
                  <p className="text-sm font-medium">{BANK_HOLDER}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(BANK_HOLDER, "holder")}
                  className="p-2 rounded-md hover:bg-muted transition"
                  data-testid="button-copy-holder"
                >
                  {copied === "holder" ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="text-sm font-medium">
                  &euro;{pricing.amount} EUR (
                  {subPeriod === "yearly" ? "1 year" : "1 month"})
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Transfer Reference *
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Your transfer reference number"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                data-testid="input-trading-reference"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Notes (optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                data-testid="input-trading-notes"
              />
            </div>
            <button
              onClick={() => orderMutation.mutate()}
              disabled={!reference.trim() || orderMutation.isPending}
              className="w-full py-2.5 bg-cyan-500 text-black rounded-lg font-medium text-sm hover:bg-cyan-400 transition disabled:opacity-50"
              data-testid="button-submit-trading-order"
            >
              {orderMutation.isPending
                ? "Submitting..."
                : `Submit Payment (${subPeriod === "yearly" ? "1 Year" : "1 Month"})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function TradingAcademyContent() {
  const [maraActive, setMaraActive] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [expandedTopic, setExpandedTopic] = useState(null);
  const [question, setQuestion] = useState("");
  const [chatLog, setChatLog] = useState([]);
  const chatEndRef = useRef(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);
  const handleActivate = () => {
    setMaraActive(true);
    setChatLog([
      {
        role: "mara",
        text: "Mara is now active! Press 'Trading Tutorial' to start learning, or ask me any trading question below.",
      },
    ]);
  };
  const handleTutorial = () => {
    if (!maraActive) {
      setChatLog([
        { role: "system", text: "Activate Mara first to start learning!" },
      ]);
      return;
    }
    setShowTutorial(true);
  };
  const handleAsk = useCallback(() => {
    if (!question.trim() || !maraActive) return;
    const q = question.trim();
    setQuestion("");
    setChatLog((prev) => [
      ...prev,
      { role: "user", text: q },
      {
        role: "mara",
        text: `As a trader with 30 years of experience, here's my take on "${q}": Focus on understanding charts and indicators first. Identify trends and volume before making trades. For DeFi, research smart contracts thoroughly. For NFTs, understand rarity and demand. Always use proper risk management \u2014 never invest more than you can afford to lose. Would you like me to explain any specific concept in detail?`,
      },
    ]);
  }, [question, maraActive]);
  const toggleTopic = (topic) => {
    setExpandedTopic(expandedTopic === topic ? null : topic);
  };
  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleActivate}
          disabled={maraActive}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition ${maraActive ? "bg-green-500/20 text-green-400 cursor-default" : "bg-cyan-500 text-black hover:bg-cyan-400"}`}
          data-testid="button-activate-mara"
        >
          {maraActive ? "Mara Active" : "Activate Mara"}
        </button>
        <button
          onClick={handleTutorial}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition"
          data-testid="button-trading-tutorial"
        >
          Trading Tutorial
        </button>
      </div>

      {/* Chat */}
      <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
        <div
          className="max-h-[250px] overflow-y-auto p-4 space-y-3"
          data-testid="trading-chat-log"
        >
          {chatLog.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              Press "Activate Mara" to start learning trading with AI.
            </p>
          ) : (
            chatLog.map((msg, i) => (
              <div
                key={i}
                className={`text-sm ${msg.role === "user" ? "text-right" : msg.role === "system" ? "text-center text-yellow-400" : ""}`}
              >
                {msg.role === "user" ? (
                  <span className="inline-block bg-primary/20 text-primary-foreground px-3 py-2 rounded-xl rounded-tr-sm max-w-[80%]">
                    {msg.text}
                  </span>
                ) : msg.role === "system" ? (
                  <span className="text-xs">{msg.text}</span>
                ) : (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <span className="inline-block bg-muted px-3 py-2 rounded-xl rounded-tl-sm max-w-[85%] text-left">
                      {msg.text}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="border-t border-border/50 p-3 flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            placeholder="Ask Mara about trading..."
            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            disabled={!maraActive}
            data-testid="input-trading-question"
          />
          <button
            onClick={handleAsk}
            disabled={!maraActive || !question.trim()}
            className="px-4 py-2 bg-cyan-500 text-black rounded-lg text-sm font-medium hover:bg-cyan-400 transition disabled:opacity-50"
            data-testid="button-ask-mara"
          >
            Ask
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card border border-border/50 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <LineChart className="w-5 h-5 text-cyan-400" />
          Demo Asset Price Chart
        </h2>
        <div className="h-[300px] md:h-[350px]">
          <TradingChart data={DEMO_PRICES} labels={MONTHS} />
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Interactive demo chart showing price trends, support levels, and
          momentum
        </p>
      </div>

      {/* Tutorial */}
      {showTutorial && (
        <div className="space-y-4" data-testid="section-tutorial">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Trading Tutorial
          </h2>
          {TUTORIALS.map((t, i) => (
            <div
              key={i}
              className="bg-card border border-border/50 rounded-xl p-4"
            >
              <h3 className="font-semibold text-primary mb-2">{t.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Concept Explainers */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-yellow-400" />
          Trading Concepts
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {Object.keys(EXPLANATIONS).map((topic) => {
            const exp = EXPLANATIONS[topic];
            const Icon = exp.icon;
            const isExpanded = expandedTopic === topic;
            return (
              <button
                key={topic}
                onClick={() => toggleTopic(topic)}
                className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition text-left ${isExpanded ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400" : "bg-card border-border/50 hover:border-primary/30"}`}
                data-testid={`button-explain-${topic.replace(/\//g, "-")}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{topic}</span>
                {isExpanded ? (
                  <ChevronUp className="w-3 h-3 ml-auto shrink-0" />
                ) : (
                  <ChevronDown className="w-3 h-3 ml-auto shrink-0" />
                )}
              </button>
            );
          })}
        </div>
        {expandedTopic && (
          <div
            className="bg-card border border-cyan-500/20 rounded-xl p-5"
            data-testid="section-explanation"
          >
            <h3 className="font-semibold text-cyan-400 mb-2 flex items-center gap-2">
              {(() => {
                const Icon = EXPLANATIONS[expandedTopic].icon;
                return <Icon className="w-5 h-5" />;
              })()}
              {EXPLANATIONS[expandedTopic].title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {EXPLANATIONS[expandedTopic].text}
            </p>
          </div>
        )}
      </div>

      {/* Trading Type Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border/50 rounded-xl p-4 text-center">
          <TrendingUp className="w-8 h-8 text-green-400 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Spot Trading
          </p>
          <p className="text-sm font-medium mt-1">Buy & Sell Assets</p>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4 text-center">
          <Target className="w-8 h-8 text-orange-400 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Futures
          </p>
          <p className="text-sm font-medium mt-1">Leveraged Contracts</p>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4 text-center">
          <PieChart className="w-8 h-8 text-purple-400 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            DeFi
          </p>
          <p className="text-sm font-medium mt-1">Yield & Staking</p>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4 text-center">
          <DollarSign className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            NFTs
          </p>
          <p className="text-sm font-medium mt-1">Digital Collectibles</p>
        </div>
      </div>

      {/* 50 Trading Strategies */}
      <StrategiesSection />
    </div>
  );
}
function StrategiesSection() {
  const [expandedStrategy, setExpandedStrategy] = useState(null);
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(STRATEGIES.length / STRATEGIES_PER_PAGE);
  const visibleStrategies = STRATEGIES.slice(
    page * STRATEGIES_PER_PAGE,
    (page + 1) * STRATEGIES_PER_PAGE,
  );
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Target className="w-5 h-5 text-orange-400" />
          Trading Strategies ({STRATEGIES.length})
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-card border border-border/50 hover:bg-muted transition disabled:opacity-30"
            data-testid="button-strategies-prev"
          >
            Prev
          </button>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-card border border-border/50 hover:bg-muted transition disabled:opacity-30"
            data-testid="button-strategies-next"
          >
            Next
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {visibleStrategies.map((strategy, i) => {
          const globalIndex = page * STRATEGIES_PER_PAGE + i;
          const isExpanded = expandedStrategy === globalIndex;
          return (
            <div
              key={globalIndex}
              className={`bg-card border rounded-xl overflow-hidden transition-all ${isExpanded ? "border-cyan-500/40" : "border-border/50 hover:border-border"}`}
              data-testid={`card-strategy-${globalIndex}`}
            >
              <button
                onClick={() =>
                  setExpandedStrategy(isExpanded ? null : globalIndex)
                }
                className="w-full flex items-center justify-between p-4 text-left"
                data-testid={`button-strategy-toggle-${globalIndex}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 text-sm font-bold shrink-0">
                    {globalIndex + 1}
                  </span>
                  <h3 className="font-semibold text-sm">{strategy.title}</h3>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-green-400 mb-2 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" /> Spot Trading
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {strategy.spot}
                      </p>
                    </div>
                    <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-orange-400 mb-2 flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5" /> Futures Trading
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {strategy.futures}
                      </p>
                    </div>
                  </div>
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Stock_chart_example.png/640px-Stock_chart_example.png"
                    alt={strategy.title}
                    className="w-full rounded-xl border border-border/30"
                    loading="lazy"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-center gap-1 mt-4">
        {Array.from({ length: totalPages }).map((_, i) => (
          <button
            key={i}
            onClick={() => setPage(i)}
            className={`w-2.5 h-2.5 rounded-full transition ${page === i ? "bg-cyan-400" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"}`}
            data-testid={`button-strategies-page-${i}`}
          />
        ))}
      </div>
    </div>
  );
}
function formatDate(d) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
function SubscriptionStatus({ expiresAt, onRenew }) {
  if (!expiresAt) return null;
  const expDate = new Date(expiresAt);
  const now = new Date();
  const daysLeft = Math.ceil(
    (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  const isExpiringSoon = daysLeft <= 7;
  return (
    <div
      className={`rounded-xl p-4 mb-6 border ${isExpiringSoon ? "bg-orange-500/10 border-orange-500/30" : "bg-cyan-500/10 border-cyan-500/30"}`}
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-2">
            <Crown className="w-4 h-4 text-cyan-400" />
            Active Subscription
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {isExpiringSoon
              ? `Expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} (${formatDate(expiresAt)})`
              : `Valid until ${formatDate(expiresAt)} (${daysLeft} days remaining)`}
          </p>
        </div>
        {isExpiringSoon && (
          <button
            onClick={onRenew}
            className="px-4 py-2 bg-cyan-500 text-black rounded-lg text-sm font-medium hover:bg-cyan-400 transition"
            data-testid="button-renew-subscription"
          >
            Renew Now
          </button>
        )}
      </div>
    </div>
  );
}
export default function TradingAcademy() {
  const { user } = useAuth();
  const [showRenew, setShowRenew] = useState(false);
  const { data: accessData, isLoading } = useQuery({
    queryKey: ["/api/trading/access"],
    enabled: !!user,
  });
  const hasAccess = accessData?.hasAccess ?? false;
  const expiresAt = accessData?.expiresAt ?? null;
  const hasPending = accessData?.hasPending ?? false;
  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button
                className="p-2 rounded-lg hover:bg-muted transition"
                data-testid="link-back-home"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </Link>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-cyan-400" />
              <h1 className="text-xl font-bold">Mara AI Trading Academy</h1>
            </div>
          </div>
          {hasAccess && (
            <span
              className="flex items-center gap-1 text-cyan-400 text-sm font-medium"
              data-testid="text-trading-access"
            >
              <Crown className="w-4 h-4" /> Active
            </span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          </div>
        ) : hasAccess && !showRenew ? (
          <>
            <SubscriptionStatus
              expiresAt={expiresAt}
              onRenew={() => setShowRenew(true)}
            />
            <TradingAcademyContent />
          </>
        ) : (
          <>
            {showRenew && hasAccess && (
              <div className="mb-4">
                <button
                  onClick={() => setShowRenew(false)}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition"
                  data-testid="button-back-to-academy"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Academy
                </button>
              </div>
            )}
            <TradingPaywall hasPending={hasPending} />
          </>
        )}
      </main>
    </div>
  );
}
