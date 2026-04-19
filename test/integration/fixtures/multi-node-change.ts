import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : n8n-vet-test--multi-node-change
// Nodes   : 5  |  Connections: 4
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// Trigger                            manualTrigger
// A                                  set
// B                                  set
// C                                  set
// D                                  set
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// Trigger
//    → A
//      → B
//        → C
//          → D
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'qMksecSMzxrEy7xg',
    name: 'n8n-vet-test--multi-node-change',
    active: false,
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner', availableInMCP: true },
})
export class N8nVetTestMultiNodeChangeWorkflow {
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
        id: 'a1',
        name: 'A',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [300, 200],
    })
    A = {
        assignments: {
            assignments: [
                {
                    name: 'step',
                    value: 'A',
                    type: 'string',
                },
            ],
        },
    };

    @node({
        id: 'b1',
        name: 'B',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [500, 200],
    })
    B = {
        assignments: {
            assignments: [
                {
                    name: 'step',
                    value: 'B',
                    type: 'string',
                },
            ],
        },
    };

    @node({
        id: 'c1',
        name: 'C',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [700, 200],
    })
    C = {
        assignments: {
            assignments: [
                {
                    name: 'step',
                    value: 'C',
                    type: 'string',
                },
            ],
        },
    };

    @node({
        id: 'd1',
        name: 'D',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [900, 200],
    })
    D = {
        assignments: {
            assignments: [
                {
                    name: 'step',
                    value: 'D',
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
        this.Trigger.out(0).to(this.A.in(0));
        this.A.out(0).to(this.B.in(0));
        this.B.out(0).to(this.C.in(0));
        this.C.out(0).to(this.D.in(0));
    }
}
