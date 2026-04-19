import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : n8n-vet-test--credential-failure
// Nodes   : 3  |  Connections: 2
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// Trigger                            manualTrigger
// HttpNoCreds                        httpRequest
// Process                            set
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// Trigger
//    → HttpNoCreds
//      → Process
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'fjofF7aeAlpDFQWf',
    name: 'n8n-vet-test--credential-failure',
    active: false,
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner', availableInMCP: true },
})
export class N8nVetTestCredentialFailureWorkflow {
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
        id: 'h1',
        name: 'HTTP No Creds',
        type: 'n8n-nodes-base.httpRequest',
        version: 4,
        position: [300, 200],
    })
    HttpNoCreds = {
        url: 'https://api.example.com/protected',
        method: 'GET',
    };

    @node({
        id: 's1',
        name: 'Process',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [500, 200],
    })
    Process = {
        assignments: {
            assignments: [
                {
                    name: 'result',
                    value: '={{ $json.data }}',
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
        this.Trigger.out(0).to(this.HttpNoCreds.in(0));
        this.HttpNoCreds.out(0).to(this.Process.in(0));
    }
}
