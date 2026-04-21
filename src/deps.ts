/**
 * OrchestratorDeps factory — wires all real subsystem implementations into
 * the grouped dependency injection object required by `interpret()`.
 *
 * Used by both the MCP server and CLI entry points. This is the single
 * place where subsystem imports are assembled into a deps object.
 */

import type { OrchestratorDeps } from './orchestrator/types.js';

// Parsing
import { buildGraph, parseWorkflowFile } from './static-analysis/graph.js';

// Trust
import { computeChangeSet } from './trust/change.js';
import { loadTrustState, persistTrustState } from './trust/persistence.js';
import { invalidateTrust, recordValidation } from './trust/trust.js';

// Guardrails
import { evaluate } from './guardrails/evaluate.js';

// Static analysis
import { detectDataLoss } from './static-analysis/data-loss.js';
import { traceExpressions } from './static-analysis/expressions.js';
import { validateNodeParams } from './static-analysis/params.js';
import { checkSchemas } from './static-analysis/schemas.js';

// Execution
import { detectCapabilities } from './execution/capabilities.js';
import { executeSmoke } from './execution/mcp-client.js';
import { constructPinData } from './execution/pin-data.js';

// Diagnostics
import { synthesize } from './diagnostics/synthesize.js';

// Snapshots
import { loadSnapshot, saveSnapshot } from './orchestrator/snapshots.js';

/** Build the full OrchestratorDeps from real subsystem implementations. */
export function buildDeps(): OrchestratorDeps {
  return {
    parsing: {
      parseWorkflowFile,
      buildGraph,
    },
    trust: {
      loadTrustState,
      persistTrustState,
      computeChangeSet,
      invalidateTrust,
      recordValidation,
    },
    guardrails: {
      evaluate,
    },
    analysis: {
      traceExpressions,
      detectDataLoss,
      checkSchemas,
      validateNodeParams,
    },
    execution: {
      executeSmoke,
      constructPinData,
      detectCapabilities,
    },
    diagnostics: {
      synthesize,
    },
    snapshots: {
      loadSnapshot,
      saveSnapshot,
    },
  };
}
