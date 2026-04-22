/**
 * Next-action derivation — computes a structured recommendation for the
 * consuming agent based on the validation summary.
 */

import type { DiagnosticSummary, NextAction } from '../types/diagnostic.js';
import type { NodeIdentity } from '../types/identity.js';

/**
 * Derive the recommended next action from a completed DiagnosticSummary.
 *
 * Priority order (first match wins):
 * 1. Error/fail status → fix-errors or fix-workflow
 * 2. Skipped with refuse → none or force-revalidate
 * 3. Guardrail narrow → narrow-scope
 * 4. Pass with warnings → review-warnings
 * 5. Pass → continue-building
 */
export function deriveNextAction(summary: DiagnosticSummary): NextAction {
  if (summary.status === 'error') {
    return deriveFromError(summary);
  }

  if (summary.status === 'fail') {
    return deriveFromFail(summary);
  }

  if (summary.status === 'skipped') {
    return deriveFromSkipped(summary);
  }

  // status === 'pass'
  return deriveFromPass(summary);
}

function deriveFromError(summary: DiagnosticSummary): NextAction {
  const platformError = summary.errors.find((e) => e.classification === 'platform');
  if (platformError) {
    const msg = platformError.message.toLowerCase();
    if (msg.includes('parse') || msg.includes('malformed')) {
      return {
        type: 'fix-workflow',
        targetNodes: null,
        blocking: true,
        reason: 'Workflow has structural errors that prevent analysis.',
      };
    }
    if (msg.includes('invalid request')) {
      return {
        type: 'fix-request',
        targetNodes: null,
        blocking: true,
        reason: 'The validation request is malformed.',
      };
    }
    if (msg.includes('metadata.id') || msg.includes('push')) {
      return {
        type: 'push-workflow',
        targetNodes: null,
        blocking: true,
        reason: 'Workflow needs a metadata ID — push with n8nac first.',
      };
    }
  }

  return {
    type: 'fix-workflow',
    targetNodes: null,
    blocking: true,
    reason: 'Validation encountered an error — review the error details.',
  };
}

function deriveFromFail(summary: DiagnosticSummary): NextAction {
  const errorNodes = new Set<NodeIdentity>();
  for (const error of summary.errors) {
    if (error.node) errorNodes.add(error.node);
  }

  return {
    type: 'fix-errors',
    targetNodes: errorNodes.size > 0 ? [...errorNodes] : null,
    blocking: true,
    reason: `${summary.errors.length} error(s) found — fix the listed issues.`,
  };
}

function deriveFromSkipped(summary: DiagnosticSummary): NextAction {
  const refuseAction = summary.guardrailActions.find((g) => g.action === 'refuse');
  if (refuseAction) {
    if (refuseAction.overridable) {
      return {
        type: 'force-revalidate',
        targetNodes: null,
        blocking: false,
        reason: 'All nodes are trusted — use force:true to re-validate.',
      };
    }
    return {
      type: 'none',
      targetNodes: null,
      blocking: false,
      reason: 'Nothing to validate — no changes detected.',
    };
  }

  return {
    type: 'none',
    targetNodes: null,
    blocking: false,
    reason: 'Validation was skipped.',
  };
}

function deriveFromPass(summary: DiagnosticSummary): NextAction {
  const hasWarnings = summary.hints.some((h) => h.severity === 'warning');
  if (hasWarnings) {
    return {
      type: 'review-warnings',
      targetNodes: null,
      blocking: false,
      reason: 'Validation passed but warnings are present — review before proceeding.',
    };
  }

  return {
    type: 'continue-building',
    targetNodes: null,
    blocking: false,
    reason: 'Validation passed — continue building.',
  };
}
