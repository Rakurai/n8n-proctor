import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : n8n-proctor-test--happy-path
// Nodes   : 3  |  Connections: 2
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// Trigger                            manualTrigger
// Set                                set
// Noop                               noOp
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// Trigger
//    → Set
//      → Noop
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'D0KIP1yb8RF7zxkb',
    name: 'n8n-proctor-test--happy-path',
    active: false,
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner', availableInMCP: true },
})
export class N8nVetTestHappyPathWorkflow {
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
        name: 'Set',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [300, 200],
    })
    Set = {
        assignments: {
            assignments: [
                {
                    name: 'greeting',
                    value: 'hello',
                    type: 'string',
                },
            ],
        },
    };

    @node({
        id: 'n1',
        name: 'NoOp',
        type: 'n8n-nodes-base.noOp',
        version: 1,
        position: [500, 200],
    })
    Noop = {};

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.Trigger.out(0).to(this.Set.in(0));
        this.Set.out(0).to(this.Noop.in(0));
    }
}
