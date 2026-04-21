import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : n8n-proctor-test--data-loss-passthrough
// Nodes   : 4  |  Connections: 3
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// Trigger                            manualTrigger
// HttpRequest                        httpRequest
// Transform                          set
// UseOriginal                        set
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// Trigger
//    → HttpRequest
//      → Transform
//        → UseOriginal
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'qJAgZgl5A7sYNjPx',
    name: 'n8n-proctor-test--data-loss-passthrough',
    active: false,
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner', availableInMCP: true },
})
export class N8nVetTestDataLossPassthroughWorkflow {
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
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        version: 4,
        position: [300, 200],
    })
    HttpRequest = {
        url: 'https://example.com/data',
        method: 'GET',
    };

    @node({
        id: 's1',
        name: 'Transform',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [500, 200],
    })
    Transform = {
        assignments: {
            assignments: [
                {
                    name: 'processed',
                    value: '={{ $json.result }}',
                    type: 'string',
                },
            ],
        },
    };

    @node({
        id: 's2',
        name: 'Use Original',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [700, 200],
    })
    UseOriginal = {
        assignments: {
            assignments: [
                {
                    name: 'original',
                    value: '={{ $json.rawData }}',
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
        this.Trigger.out(0).to(this.HttpRequest.in(0));
        this.HttpRequest.out(0).to(this.Transform.in(0));
        this.Transform.out(0).to(this.UseOriginal.in(0));
    }
}
