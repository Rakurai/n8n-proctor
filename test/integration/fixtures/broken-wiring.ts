import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : n8n-vet-test--broken-wiring
// Nodes   : 3  |  Connections: 1
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// Trigger                            manualTrigger
// Set                                set
// OrphanedHttp                       httpRequest
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// Trigger
//    → Set
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'dmxhg3XYVXgImSkk',
    name: 'n8n-vet-test--broken-wiring',
    active: false,
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner', availableInMCP: true },
})
export class N8nVetTestBrokenWiringWorkflow {
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
                    name: 'data',
                    value: 'test',
                    type: 'string',
                },
            ],
        },
    };

    @node({
        id: 'h1',
        name: 'Orphaned HTTP',
        type: 'n8n-nodes-base.httpRequest',
        version: 4,
        position: [300, 400],
    })
    OrphanedHttp = {
        url: 'https://example.com/api',
        method: 'GET',
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.Trigger.out(0).to(this.Set.in(0));
    }
}
