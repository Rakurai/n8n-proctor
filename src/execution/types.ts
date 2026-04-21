/**
 * Internal types for the execution subsystem — pin data, execution results,
 * per-node extraction, and capability detection.
 *
 * Cross-subsystem types (NodeIdentity, WorkflowGraph, AvailableCapabilities)
 * are imported from src/types/. These types are internal to execution and
 * consumed by the orchestrator (Phase 7) and diagnostics (Phase 6).
 */

import type { NodeIdentity } from '../types/identity.js';
import type { McpToolCaller } from './mcp-client.js';

// ---------------------------------------------------------------------------
// Pin Data
// ---------------------------------------------------------------------------

/** Record mapping node names to arrays of pin data items for mocking. */
export type PinData = Record<string, PinDataItem[]>;

/** A single output item in pin data format. */
export interface PinDataItem {
  json: Record<string, unknown>;
  binary?: Record<string, unknown>;
}

/** Which sourcing tier provided pin data for a given node. */
export type PinDataSource = 'agent-fixture' | 'prior-artifact' | 'mcp-schema' | 'execution-history';

/** Traceability map: node name → which tier provided its pin data. */
export type PinDataSourceMap = Record<string, PinDataSource>;

/** Output of pin data construction: the data plus its provenance. */
export interface PinDataResult {
  pinData: PinData;
  sourceMap: PinDataSourceMap;
}

// ---------------------------------------------------------------------------
// Execution Result (from triggering an execution)
// ---------------------------------------------------------------------------

/**
 * Known execution statuses from n8n.
 *
 * Terminal statuses trigger the data retrieval phase of polling.
 * Non-terminal statuses continue the status polling loop.
 */
export type ExecutionStatus =
  | 'success'
  | 'error'
  | 'crashed'
  | 'canceled'
  | 'waiting'
  | 'running'
  | 'new'
  | 'unknown';

/** Outcome of triggering an execution. */
export interface ExecutionResult {
  executionId: string;
  status: ExecutionStatus;
  error: ExecutionErrorData | null;
}

// ---------------------------------------------------------------------------
// Execution Error Data (discriminated on contextKind)
// ---------------------------------------------------------------------------

/** Base fields shared by all execution error variants. */
export interface ExecutionErrorDataBase {
  type: string;
  message: string;
  description: string | null;
  node: string | null;
}

/** Classified execution error with context-specific fields. */
export type ExecutionErrorData = ExecutionErrorDataBase &
  (
    | { contextKind: 'api'; context: { httpCode?: string; errorCode?: string } }
    | { contextKind: 'cancellation'; context: { reason: 'manual' | 'timeout' | 'shutdown' } }
    | { contextKind: 'expression'; context: { expressionType?: string; parameter?: string } }
    | { contextKind: 'other'; context: { runIndex?: number; itemIndex?: number } }
  );

// ---------------------------------------------------------------------------
// Execution Data (per-node results from a completed execution)
// ---------------------------------------------------------------------------

/** Per-node execution results extracted from a completed run. */
export interface ExecutionData {
  nodeResults: Map<NodeIdentity, NodeExecutionResult[]>;
  lastNodeExecuted: string | null;
  error: ExecutionErrorData | null;
  status: ExecutionStatus;
}

/** A single execution attempt for one node. */
export interface NodeExecutionResult {
  executionIndex: number;
  status: 'success' | 'error';
  executionTimeMs: number;
  error: ExecutionErrorData | null;
  source: SourceInfo | null;
  hints: ExecutionHint[];
}

/** Execution lineage — which upstream node produced the input. */
export interface SourceInfo {
  previousNode: string;
  previousNodeOutput: number;
  previousNodeRun: number;
}

/** Non-blocking informational hint from node execution. */
export interface ExecutionHint {
  message: string;
  severity: string;
}

// ---------------------------------------------------------------------------
// Capability Detection
// ---------------------------------------------------------------------------

/** Summary capability level of the execution environment. */
export type CapabilityLevel = 'mcp' | 'static-only';

/** Detected execution environment capabilities. */
export interface DetectedCapabilities {
  level: CapabilityLevel;
  mcpAvailable: boolean;
  mcpTools: string[];
}

// ---------------------------------------------------------------------------
// Execution Preparation (extracted from orchestrator)
// ---------------------------------------------------------------------------

/** Input for the execution preparation API. */
export interface ExecutionPreparationInput {
  /** n8n workflow ID from AST metadata. */
  n8nWorkflowId: string;
  /** Project-relative workflow ID for local persistence. */
  workflowId: string;
  /** Parsed workflow graph. */
  graph: import('../types/graph.js').WorkflowGraph;
  /** Active trust state after invalidation. */
  trustState: import('../types/trust.js').TrustState;
  /** Resolved validation target. */
  resolvedTarget: import('../types/diagnostic.js').ResolvedTarget;
  /** MCP tool caller, if available. */
  callTool?: McpToolCaller;
  /** Agent-provided pin data (tier 1). */
  pinData: PinData | null;
}

/** Result from execution preparation. */
export interface ExecutionPreparationResult {
  /** Per-node execution data from completed run, or null if no execution. */
  executionData: import('../diagnostics/types.js').ExecutionData | null;
  /** Execution errors encountered. */
  executionErrors: ExecutionPreparationError[];
  /** Non-fatal warnings (e.g. MCP tier-3 unavailable). Visible but not status-flipping. */
  warnings: string[];
  /** Pin data that was actually used for execution. */
  usedPinData: PinData | null;
  /** Detected capabilities of the execution environment. */
  capabilities: import('../types/diagnostic.js').AvailableCapabilities;
  /** Execution ID from MCP, or null. */
  executionId: string | null;
}

/** Structured execution error from the preparation phase. */
export interface ExecutionPreparationError {
  type: string;
  message: string;
  description: null;
  node: NodeIdentity | null;
  classification: 'platform';
  context: Record<string, never>;
}

/** Injectable dependencies for execution preparation (testability seam). */
export interface ExecutionInternalDeps {
  executeSmoke: (
    workflowId: string,
    pinData: PinData,
    callTool: McpToolCaller,
    triggerNodeName?: string,
  ) => Promise<ExecutionResult>;
  constructPinData: (
    graph: import('../types/graph.js').WorkflowGraph,
    trustedBoundaries: NodeIdentity[],
    fixtures?: Record<string, PinDataItem[]>,
    priorArtifacts?: Record<string, PinDataItem[]>,
    mcpPinData?: Record<string, PinDataItem[]>,
  ) => PinDataResult;
  detectCapabilities: (options?: {
    callTool?: McpToolCaller;
  }) => Promise<DetectedCapabilities>;
  readCachedPinData: (workflowId: string, nodeHash: string) => Promise<PinDataItem[] | undefined>;
  preparePinData: (
    workflowId: string,
    callTool: McpToolCaller,
  ) => Promise<import('./mcp-client.js').PreparePinDataResult>;
  getExecution: (
    workflowId: string,
    executionId: string,
    callTool: McpToolCaller,
    options?: { includeData?: boolean; nodeNames?: string[]; truncateData?: number },
  ) => Promise<{
    status: import('./types.js').ExecutionStatus;
    data?: import('../diagnostics/types.js').ExecutionData;
  }>;
  generateSampleFromSchema: (schema: Record<string, unknown>) => Record<string, unknown>;
  computeNodeHashes: (
    graph: import('../types/graph.js').WorkflowGraph,
    nodes: NodeIdentity[],
  ) => Map<NodeIdentity, string>;
}
