---
name: quantconnect
description: Develop, backtest, and document algorithmic trading strategies using the QuantConnect LEAN engine. Use when the user wants to create a new trading strategy, backtest an existing one, or iterate on strategy performance. Covers the full workflow from strategy design through backtesting to HTML documentation. Requires SSH access to a lean-runner Docker container (obtained from the main agent).
---

# QuantConnect Strategy Development

## Prerequisites

Your sandbox must be on the `lean-net` Docker network so you can resolve the lean-runner container by name. This is configured in your agent config (`sandbox.docker.network: "lean-net"`).

## Overview

You develop trading strategies in a **lean-runner** Docker container via SSH. The container has the full lean-cli toolchain, market data, and a `backtest` command.

## Workflow

### Phase 1: Strategy Design (before this skill)

Discuss the strategy idea with the user. Agree on:

- Core signal/thesis
- Tickers to use
- Timeframe and parameters

Get explicit user approval before implementing.

### Phase 2: Ensure Container Is Running

Ask the main agent (Leopoldo) to confirm the lean-runner container is up:

```
sessions_send(
  label: "main",
  message: "QuantConnect: Please confirm the lean-runner container is running. If not, start it with ~/projects/quantconnect/scripts/start-runner.sh"
)
```

### Phase 3: Connect and Read Instructions

Your sandbox is on the `lean-net` Docker network, so you can reach the container directly by name:

1. Connect and read the full instructions:

```bash
ssh -o StrictHostKeyChecking=no root@lean-runner "cat /workspace/AGENT_INSTRUCTIONS.md"
```

2. Review existing strategies for patterns:

```bash
ssh -o StrictHostKeyChecking=no root@lean-runner "ls /workspace/strategies/"
ssh -o StrictHostKeyChecking=no root@lean-runner "cat /workspace/strategies/*/config.json"
```

**Important:** The AGENT_INSTRUCTIONS.md inside the container is the authoritative reference. Always read it — it contains the LEAN API reference, coding rules, available data, and HTML documentation requirements.

### Phase 4: Implement the Strategy

All commands run via SSH into the container.

1. **Create strategy folder:**

```bash
ssh -o StrictHostKeyChecking=no root@lean-runner "mkdir -p /workspace/strategies/<name>"
```

2. **Write config.json** with a unique 9-digit ID:

```bash
ssh -o StrictHostKeyChecking=no root@lean-runner "cat > /workspace/strategies/<name>/config.json << 'EOF'
{
    \"local-id\": <random-9-digit>
}
EOF"
```

3. **Write main.py** — Use `cat` with heredoc. For complex strategies, break into multiple SSH commands if needed.

4. **Run the backtest:**

```bash
ssh -o StrictHostKeyChecking=no root@lean-runner "backtest <name>"
```

5. **If errors:** Fix main.py and re-run. Iterate until clean.

6. **Extract STATISTICS:: lines** from output for the HTML docs.

### Phase 5: HTML Documentation

**Mandatory after every successful backtest.**

1. Read an existing strategy page for the template:

```bash
ssh -o StrictHostKeyChecking=no root@lean-runner "cat /workspace/strategies/rule_one/strategy.html"
```

2. Create `strategies/<name>/strategy.html` — match the existing dark theme exactly.

3. Update `strategies/index.html` — insert a new `<tr>` before `</tbody>`. Do NOT recreate the file.

See the AGENT_INSTRUCTIONS.md "HTML Documentation" section for full requirements.

### Phase 6: Report Results

When everything is done (strategy written, backtest passed, HTML docs created), **message the user** with a summary:

- Strategy name and description
- Key metrics: Annual Return, Drawdown, Sharpe, Net Profit, Win Rate
- Any observations or concerns about the results
- Confirm HTML documentation is complete

This is important — the user expects a notification when the work is finished. Don't leave them hanging.

## Key Rules

- **Only use tickers listed in AGENT_INSTRUCTIONS.md** — no others are available
- **Always use IBKR brokerage model** — for realistic fees
- **snake_case API only** — `self.add_equity()` not `self.AddEquity()`
- **100K starting capital** — standard for all strategies
- **Parameters as UPPER_CASE class constants** — no magic numbers
- **Log with `self.debug()`** — every rebalance, entry, exit

## Available Data Reference

Quick reference (check AGENT_INSTRUCTIONS.md for exact dates):

AAPL, MSFT, GOOGL, AMZN, NVDA, META (from 2012), TSLA (from 2010), SPY, QQQ, GBTC (from 2015), MSTR, COIN (from 2021).

Set `set_start_date` AFTER the latest IPO of all tickers used.

## Troubleshooting

| Problem                | Fix                                                        |
| ---------------------- | ---------------------------------------------------------- |
| Container not running  | Ask main agent to run `start-runner.sh`                    |
| SSH connection refused | Container may have restarted — ask main agent to check     |
| Backtest Python error  | Fix main.py, re-run `backtest <name>`                      |
| Missing ticker data    | Only tickers listed in AGENT_INSTRUCTIONS.md are available |
