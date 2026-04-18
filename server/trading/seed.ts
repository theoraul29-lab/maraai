/**
 * Trading Academy content seeder (PR F).
 *
 * Idempotent: on every boot we upsert the canonical set of modules and
 * lessons into SQLite. New modules / lessons added to this file will
 * show up without a new migration; edits to existing rows propagate on
 * the next restart.
 *
 * The structure mirrors the outline agreed with the user:
 *
 *   Level 1 — Fundamentals             (free, `trading.level_1_fundamentals`)
 *   Level 2 — Technical Analysis       (VIP,  `trading.all_levels`)
 *   Level 3 — Strategies               (VIP,  `trading.all_levels`)
 *   Level 4 — Advanced / Crypto        (VIP+, `trading.all_levels`)
 *   Level 5 — Live Sessions            (VIP+, `trading.live_sessions`)
 *
 * Content is intentionally terse — these are placeholder skeletons a
 * human author will fill in via the admin UI. The seed's job is to
 * guarantee the catalogue exists so the frontend can render something
 * meaningful on day one.
 */

import { storage } from '../storage.js';

type SeedQuiz = {
  questions: Array<{
    id: string;
    prompt: string;
    choices: string[];
    answer: number;
  }>;
};

type SeedLesson = {
  slug: string;
  title: string;
  content: string;
  durationSeconds: number;
  quiz?: SeedQuiz;
};

type SeedModule = {
  slug: string;
  level: number;
  title: string;
  description: string;
  orderIdx: number;
  requiredFeature: string;
  lessons: SeedLesson[];
};

const CATALOGUE: SeedModule[] = [
  // --------------------------------------------------------------------
  // Level 1 — Fundamentals (FREE)
  // --------------------------------------------------------------------
  {
    slug: 'l1-fundamentals',
    level: 1,
    orderIdx: 10,
    title: 'Fundamentals of Financial Markets',
    description:
      'Start here. Learn what markets are, who participates, and how orders become prices.',
    requiredFeature: 'trading.level_1_fundamentals',
    lessons: [
      {
        slug: 'what-is-a-market',
        title: 'What is a financial market?',
        content:
          'A market is any venue (physical or electronic) where buyers and sellers agree on a price. ' +
          'The price is the outcome of an auction between the highest bid and the lowest ask.',
        durationSeconds: 420,
        quiz: {
          questions: [
            {
              id: 'q1',
              prompt: 'What determines the current price of an asset?',
              choices: [
                'The last trade between a buyer and a seller',
                'The asset\'s intrinsic value',
                'The broker\'s internal list',
                'The government',
              ],
              answer: 0,
            },
          ],
        },
      },
      {
        slug: 'instruments',
        title: 'Instruments: stocks, crypto, forex, indices',
        content:
          'Stocks represent ownership. Crypto tokens represent on-chain assets. Forex trades currency pairs. ' +
          'Indices track a basket. Each has different liquidity, volatility, and trading hours.',
        durationSeconds: 480,
      },
      {
        slug: 'order-types',
        title: 'Order types: market, limit, stop',
        content:
          'Market orders execute immediately at the best available price. Limit orders wait for a specific price. ' +
          'Stop orders convert to market orders once a trigger is hit — typically used for risk management.',
        durationSeconds: 420,
        quiz: {
          questions: [
            {
              id: 'q1',
              prompt: 'Which order type is used to limit losses once a trigger is hit?',
              choices: ['Market order', 'Limit order', 'Stop order', 'Iceberg order'],
              answer: 2,
            },
          ],
        },
      },
      {
        slug: 'risk-reward',
        title: 'Risk / reward and position sizing',
        content:
          'Never risk more than a small fraction of capital on a single trade. A 1:3 risk/reward ratio ' +
          'means the potential profit is three times the potential loss.',
        durationSeconds: 540,
      },
      {
        slug: 'psychology',
        title: 'Trader psychology',
        content:
          'Fear and greed are the two emotions that move markets. Build a written plan and follow it — ' +
          'discipline is the edge.',
        durationSeconds: 360,
      },
    ],
  },

  // --------------------------------------------------------------------
  // Level 2 — Technical Analysis (VIP)
  // --------------------------------------------------------------------
  {
    slug: 'l2-technical-analysis',
    level: 2,
    orderIdx: 20,
    title: 'Technical Analysis',
    description:
      'Read charts like a pro: candlesticks, support/resistance, and the classic indicator family.',
    requiredFeature: 'trading.all_levels',
    lessons: [
      {
        slug: 'candlesticks',
        title: 'Candlesticks and price action',
        content:
          'A candle encodes open, high, low, close. Body colour signals direction; wicks show rejection.',
        durationSeconds: 480,
      },
      {
        slug: 'support-resistance',
        title: 'Support, resistance, trendlines',
        content:
          'Support is a price level where buying pressure has historically absorbed supply; resistance is the mirror.',
        durationSeconds: 420,
      },
      {
        slug: 'moving-averages',
        title: 'Moving averages (SMA, EMA)',
        content:
          'SMA weighs every bar equally; EMA weights recent bars more. Crossovers hint at trend shifts.',
        durationSeconds: 420,
      },
      {
        slug: 'rsi',
        title: 'RSI — relative strength index',
        content:
          'RSI oscillates 0–100. Above 70 is typically overbought, below 30 oversold. Divergences matter.',
        durationSeconds: 360,
        quiz: {
          questions: [
            {
              id: 'q1',
              prompt: 'An RSI reading above 70 typically indicates the asset is …',
              choices: ['Oversold', 'Neutral', 'Overbought', 'Illiquid'],
              answer: 2,
            },
          ],
        },
      },
      {
        slug: 'macd',
        title: 'MACD — moving average convergence divergence',
        content:
          'MACD is the difference between two EMAs. Histogram crossings above/below zero signal momentum flips.',
        durationSeconds: 420,
      },
      {
        slug: 'bollinger',
        title: 'Bollinger Bands',
        content:
          'Two bands around a moving average, set n standard deviations wide. Squeezes precede volatility expansions.',
        durationSeconds: 360,
      },
    ],
  },

  // --------------------------------------------------------------------
  // Level 3 — Strategies (VIP)
  // --------------------------------------------------------------------
  {
    slug: 'l3-strategies',
    level: 3,
    orderIdx: 30,
    title: 'Trading Strategies',
    description:
      'Combine indicators and price action into repeatable, backtested edges.',
    requiredFeature: 'trading.all_levels',
    lessons: [
      {
        slug: 'timeframes',
        title: 'Day trading vs. swing vs. position',
        content:
          'The timeframe determines the frequency of entries, the size of stops, and the emotional cost.',
        durationSeconds: 360,
      },
      {
        slug: 'breakouts',
        title: 'Breakout strategies',
        content:
          'Enter when price clears a well-defined level with volume confirmation. Stop just below the level.',
        durationSeconds: 420,
      },
      {
        slug: 'reversals',
        title: 'Reversal patterns',
        content:
          'Double tops/bottoms, head-and-shoulders, and exhaustion wicks mark regime changes.',
        durationSeconds: 420,
      },
      {
        slug: 'scalping',
        title: 'Scalping basics',
        content:
          'Very short holding periods. Fees and slippage dominate the edge — pick the right venue.',
        durationSeconds: 360,
      },
      {
        slug: 'risk-management',
        title: 'Risk management systems',
        content:
          'Fixed fractional, Kelly, volatility-scaled — all safer than gut feel.',
        durationSeconds: 420,
      },
      {
        slug: 'backtesting',
        title: 'Backtesting a strategy',
        content:
          'Code the rules, run against past data, measure Sharpe, max drawdown, and win rate. Beware overfitting.',
        durationSeconds: 480,
      },
    ],
  },

  // --------------------------------------------------------------------
  // Level 4 — Advanced / Crypto (VIP+)
  // --------------------------------------------------------------------
  {
    slug: 'l4-advanced-crypto',
    level: 4,
    orderIdx: 40,
    title: 'Advanced & Crypto',
    description:
      'On-chain analysis, DeFi yield mechanics, and portfolio-level risk.',
    requiredFeature: 'trading.all_levels',
    lessons: [
      {
        slug: 'defi-basics',
        title: 'DeFi: staking, yield farming',
        content:
          'Smart contracts let you lend, borrow, and provide liquidity for yield — at the cost of smart-contract risk.',
        durationSeconds: 480,
      },
      {
        slug: 'onchain',
        title: 'On-chain analysis',
        content:
          'Wallet flows, exchange inflow/outflow, and stablecoin supply reveal directional pressure invisible to candles.',
        durationSeconds: 540,
      },
      {
        slug: 'portfolio',
        title: 'Portfolio construction',
        content:
          'Correlation matters more than stock-picking. Rebalance on a calendar, not on emotion.',
        durationSeconds: 420,
      },
      {
        slug: 'derivatives',
        title: 'Derivatives: futures and options',
        content:
          'Leverage multiplies both edge and ruin probability. Understand liquidation price before you size.',
        durationSeconds: 480,
      },
      {
        slug: 'taxes',
        title: 'Taxes and record keeping',
        content:
          'Keep a log of every trade. Most jurisdictions treat crypto the way they treat property — short- and long-term gains.',
        durationSeconds: 300,
      },
    ],
  },

  // --------------------------------------------------------------------
  // Level 5 — Live Sessions (VIP+, `trading.live_sessions`)
  // --------------------------------------------------------------------
  {
    slug: 'l5-live',
    level: 5,
    orderIdx: 50,
    title: 'Live Sessions with Mara',
    description:
      'Weekly live market reviews and Q&A. Schedule and recordings unlock with the VIP+ plan.',
    requiredFeature: 'trading.live_sessions',
    lessons: [
      {
        slug: 'live-weekly-review',
        title: 'Weekly market review (live)',
        content:
          'Join every Friday at 18:00 UTC. Link is posted to the members lobby two hours before the session.',
        durationSeconds: 3600,
      },
    ],
  },
];

export async function seedTradingAcademy(): Promise<void> {
  for (const mod of CATALOGUE) {
    const upserted = await storage.upsertTradingModule({
      slug: mod.slug,
      level: mod.level,
      title: mod.title,
      description: mod.description,
      orderIdx: mod.orderIdx,
      requiredFeature: mod.requiredFeature,
    });
    let orderIdx = 1;
    for (const lesson of mod.lessons) {
      await storage.upsertTradingLesson({
        moduleId: upserted.id,
        slug: lesson.slug,
        title: lesson.title,
        content: lesson.content,
        durationSeconds: lesson.durationSeconds,
        orderIdx: orderIdx++,
        quizJson: lesson.quiz ? JSON.stringify(lesson.quiz) : null,
      });
    }
  }
}
