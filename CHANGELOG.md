# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.1.0] - 2025-06-20

Initial release.

### Added

- **MCP server** exposing `validate`, `trust_status`, and `explain` tools
- **CLI** (`n8n-vet validate`, `trust`, `explain`) with `--json` output
- **Static analysis**: graph parsing, expression tracing, data-loss detection, schema/param validation, node classification
- **Trust system**: content hashing, change detection, trust-state persistence, rerun assessment
- **Guardrails**: proceed / narrow / redirect / refuse decisions with structured evidence and explanations
- **Execution layer**: MCP-backed workflow execution with pin-data construction and capability detection (`mcp` / `static-only`)
- **Diagnostics**: structured summaries from static + execution results, error classification, actionable hints
- **Orchestrator**: request interpretation, path selection, workflow snapshots
- **Integration test suite** with 9 scenarios against a live n8n instance
