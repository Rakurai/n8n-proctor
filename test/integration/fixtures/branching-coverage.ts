import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : n8n-proctor-test--branching-coverage
// Nodes   : 4  |  Connections: 3
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// Trigger                            manualTrigger
// If_                                if
// TruePath                           set
// FalsePath                          set
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// Trigger
//    → If_
//      → TruePath
//     .out(1) → FalsePath
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'Y4062Au0NNYTqs2s',
    name: 'n8n-proctor-test--branching-coverage',
    active: false,
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner', availableInMCP: true },
})
export class N8nVetTestBranchingCoverageWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 't1',
        name: 'Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        version: 1,
        position: [100, 200],
    })
    Trigger = {};

    @node({
        id: 'if1',
        name: 'If',
        type: 'n8n-nodes-base.if',
        version: 2,
        position: [300, 200],
    })
    If_ = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
            },
            conditions: [
                {
                    leftValue: '={{ $json.value }}',
                    rightValue: 'true',
                    operator: {
                        type: 'string',
                        operation: 'equals',
                    },
                },
            ],
            combinator: 'and',
        },
    };

    @node({
        id: 's1',
        name: 'True Path',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [500, 100],
    })
    TruePath = {
        assignments: {
            assignments: [
                {
                    name: 'branch',
                    value: 'true',
                    type: 'string',
                },
            ],
        },
    };

    @node({
        id: 's2',
        name: 'False Path',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [500, 300],
    })
    FalsePath = {
        assignments: {
            assignments: [
                {
                    name: 'branch',
                    value: 'false',
                    type: 'string',
                },
            ],
        },
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.Trigger.out(0).to(this.If_.in(0));
        this.If_.out(0).to(this.TruePath.in(0));
        this.If_.out(1).to(this.FalsePath.in(0));
    }
}
