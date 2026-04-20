import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : n8n-vet-test--expression-bug
// Nodes   : 2  |  Connections: 1
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// Trigger                            manualTrigger
// BadExpression                      set
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// Trigger
//    → BadExpression
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'XSpcho6Ex2B9zyCb',
    name: 'n8n-vet-test--expression-bug',
    active: false,
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner', availableInMCP: false },
})
export class N8nVetTestExpressionBugWorkflow {
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
        id: 's1',
        name: 'Bad Expression',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [300, 200],
    })
    BadExpression = {
        assignments: {
            assignments: [
                {
                    name: 'value',
                    value: '={{ JSON.parse("{invalid") }}',
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
        this.Trigger.out(0).to(this.BadExpression.in(0));
    }
}
