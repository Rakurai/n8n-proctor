/**
 * Shared trust-subsystem constants consumed by both trust derivation
 * and guardrail evidence assembly.
 */

import type { ChangeKind } from '../types/trust.js';

/** Change kinds that preserve trust — only metadata-only changes are trust-preserving. */
export const TRUST_PRESERVING: ReadonlySet<ChangeKind> = new Set(['metadata-only']);
