# 🌐 Capy Web

**Autonomous Internet Intelligence Engine**

Capy Web is a disciplined, verification-first, distributed internet intelligence engine that knows where to look, how much to trust, and when to stop.

## What is Capy Web?

Capy Web is **not**:
- A scraper
- A browser automation script
- A tool call
- A chatbot

Capy Web **behaves like a senior human researcher with infinite tabs, perfect memory, and strict discipline**.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CAPY WEB                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌────────────────┐  ┌───────────────────┐   │
│  │ Planner      │  │ Source         │  │ Confidence        │   │
│  │ Brain        │──│ Intelligence   │──│ Engine            │   │
│  │              │  │ Engine         │  │                   │   │
│  └──────────────┘  └────────────────┘  └───────────────────┘   │
│         │                  │                    │               │
│  ┌──────┴──────────────────┴────────────────────┴──────┐       │
│  │                  Navigation Engine                   │       │
│  │              (Playwright Browser Control)            │       │
│  └─────────────────────────┬────────────────────────────┘       │
│                            │                                     │
│  ┌────────────────┐  ┌─────┴─────┐  ┌────────────────────┐      │
│  │ Domain         │  │ Extraction │  │ Claim Graph &      │      │
│  │ Adapters       │──│ Engine     │──│ Verification       │      │
│  └────────────────┘  └───────────┘  └────────────────────┘      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │              Cache Manager (Page + Extraction)          │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │              Telemetry & Control Engine                 │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Core Subsystems

### 1. Planner Brain
Before Capy Web touches the internet, it generates a **Research Plan**:
- Primary questions
- Expected answer types
- Target domains (ranked)
- Extraction schemas
- Execution paths
- Confidence thresholds

**If a plan cannot be produced, execution must not begin.**

### 2. Source Intelligence Engine
Dynamic model of web source quality. Each domain is scored on:
- **Authority** - Is this a primary source?
- **Originality** - Is content first-hand?
- **Freshness** - How recent?
- **Specificity** - Is it concrete?
- **Consistency** - Does it agree with others?

**Source Tiers:**
- Tier 1: Official domains, docs, repos, filings
- Tier 2: First-party blogs, changelogs
- Tier 3: Reputable analysis/news
- Tier 4: Reviews/forums (corroboration only)
- Tier 5: SEO/junk (actively penalized)

### 3. Navigation Engine
Headless browser with:
- Human-like timing and behavior
- JS-enabled by default
- robots.txt aware
- Strict rate limiting
- No blind crawling or brute-force pagination

### 4. Domain Adapters
Specialized extractors for different source types:
- `CompanySiteAdapter` - Company websites
- `PricingAdapter` - Pricing pages
- `GitHubAdapter` - GitHub repositories
- `DocsAdapter` - Documentation sites
- `SecurityTrustAdapter` - Security/compliance pages
- `NewsAdapter` - News articles
- `CrunchbaseAdapter` - Crunchbase profiles

### 5. Claim Graph & Verification
Real-time claim tracking with:
- Cross-source corroboration
- Contradiction detection
- Confidence scoring
- Verification history

**A claim is "high confidence" if:**
- 2+ independent sources agree, OR
- 1 authoritative source exists

### 6. Confidence Engine
Knows when to stop. Execution stops when:
- Confidence ≥ threshold
- Marginal gain falls below floor
- Budget exhausted
- STOP issued

**Over-searching is treated as a bug.**

### 7. Cache System
- Page cache (HTML + text)
- Extraction cache
- Domain map (known high-signal URLs)
- Query cache

Versioned, TTL-based, safe to reuse across sessions.

## Operator Modes

| Mode | Description |
|------|-------------|
| **Lightning** | Fast, cache-heavy, shallow |
| **Standard** | Balanced, verified |
| **Deep Research** | Multi-path, contradiction aware |
| **Compliance** | Authoritative sources only |
| **Simulation** | No execution, plan only |

## Usage

### Basic Usage

```typescript
import { chromium } from 'playwright';
import { research, OperatorMode } from '@/capy-web';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  
  const result = await research(
    "What is the pricing for Notion?",
    context,
    {
      mode: OperatorMode.STANDARD,
      confidenceThreshold: 0.8,
      onProgress: (progress) => {
        console.log(`Confidence: ${(progress.confidence * 100).toFixed(0)}%`);
      }
    }
  );
  
  console.log('Answers:', result.answers);
  console.log('Overall Confidence:', result.confidence);
  
  await browser.close();
}
```

### With Full Control

```typescript
import { createCapyWeb, OperatorMode } from '@/capy-web';

const engine = createCapyWeb({
  mode: OperatorMode.DEEP_RESEARCH,
  cacheEnabled: true,
  parallelism: 5
});

engine.setBrowserContext(browserContext);

engine.onProgress((progress) => {
  console.log(`Status: ${progress.status}`);
  console.log(`Pages: ${progress.pagesVisited}`);
  console.log(`Claims: ${progress.claimsFound}`);
  console.log(`Confidence: ${progress.confidence}`);
});

engine.onEvent((event) => {
  console.log(`Event: ${event.type}`, event.data);
});

const result = await engine.research({
  query: "What is the pricing and security compliance for Notion?",
  confidenceRequirement: 0.9,
  knownDomains: ['notion.so']
});

// Stop anytime
engine.stop();
```

### React Integration

```tsx
import { useCapyWebAPI, CapyWebProgress, CapyWebResults } from '@/capy-web/react';

function ResearchComponent() {
  const { research, isLoading, progress, result, stop } = useCapyWebAPI();
  
  const handleSearch = async (query: string) => {
    try {
      await research(query, { mode: 'standard' });
    } catch (error) {
      console.error('Research failed:', error);
    }
  };
  
  return (
    <div>
      {isLoading && (
        <CapyWebProgress 
          progress={progress}
          onStop={stop}
          showEvents
        />
      )}
      
      {result && <CapyWebResults result={result} />}
    </div>
  );
}
```

## Result Structure

```typescript
interface CapyWebResult {
  sessionId: string;
  objective: string;
  success: boolean;
  
  // Core outputs
  answers: Answer[];           // Answers to primary questions
  claims: Claim[];             // All extracted claims
  confidence: number;          // Overall confidence (0-1)
  
  // Execution stats
  stats: {
    totalTimeMs: number;
    pagesVisited: number;
    claimsFound: number;
    claimsVerified: number;
    contradictionsFound: number;
    cacheHits: number;
    avgConfidencePerPage: number;
  };
  
  // Audit trail
  visitedUrls: string[];
  telemetry: TelemetryEvent[];
}
```

## Real-Time Control

```typescript
// Pause execution
engine.pause();

// Resume execution
engine.resume();

// Stop immediately (<200ms target)
engine.stop();
```

## Safety & Ethics

Capy Web:
- ✅ Respects robots.txt
- ✅ Avoids authentication bypass
- ✅ Avoids scraping personal data
- ✅ Logs every action
- ✅ Supports audit mode
- ❌ No CAPTCHA solving
- ❌ No PII harvesting

## File Structure

```
src/capy-web/
├── index.ts                    # Main exports
├── types/
│   └── index.ts                # Type definitions
├── core/
│   ├── planner-brain.ts        # Research planning
│   ├── source-intelligence.ts  # Domain scoring
│   ├── confidence-engine.ts    # Stop conditions
│   └── claim-graph.ts          # Verification
├── engine/
│   ├── navigation-engine.ts    # Browser control
│   └── capy-web-engine.ts      # Main orchestrator
├── adapters/
│   ├── base-adapter.ts         # Base adapter class
│   ├── specialized-adapters.ts # Domain-specific
│   └── adapter-registry.ts     # Adapter selection
├── cache/
│   └── cache-manager.ts        # Page & extraction cache
├── telemetry/
│   └── telemetry-engine.ts     # Events & control
├── react/
│   ├── useCapyWeb.ts           # React hooks
│   ├── CapyWebProgress.tsx     # Progress UI
│   ├── CapyWebResults.tsx      # Results UI
│   └── index.ts                # React exports
├── utils/
│   └── helpers.ts              # Utilities
└── tests/
    ├── planner-brain.test.ts
    ├── source-intelligence.test.ts
    └── claim-graph.test.ts
```

## Final Definition

> **Capy Web is a disciplined, verification-first, distributed internet intelligence engine that knows where to look, how much to trust, and when to stop.**

If it behaves like a scraper, it is broken.  
If it behaves like a crawler, it is broken.  
If it behaves like a human researcher — **it is correct**.
