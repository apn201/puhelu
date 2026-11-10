# Requirements Document

## Introduction

An MCP server that lets Kiro play the product through `engine/sim.ts`: pick up, dial, hang up, wait, read state, and simulate many nights to find unreachable content. Not built yet.

## Requirements
1. THE server SHALL expose tools `pickup`, `hangup`, `dial(digits, style)`, `wait(ms)`, `get_state`, `set_state`, `simulate_nights(n, strategy, seed)`, `coverage_report`.
2. `coverage_report` SHALL list nodes never played across a simulation, and tags with no reachable path.
3. THE server SHALL run the real engine with a fake clock, so a night simulates in milliseconds.
4. THE server SHALL be registered in `.kiro/settings/mcp.json`.
