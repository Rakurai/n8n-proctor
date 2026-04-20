import { workflow, node, links } from '@n8n-as-code/transformer';

// Deliberately omits metadata.id to simulate a workflow that hasn't been pushed.
// Used by integration tests to verify the "test before push" error path.

@workflow({
    id: '',
    name: 'n8n-vet-test--no-id',
    active: false,
})
export class N8nVetTestNoIdWorkflow {
    @node({
        id: 't1',
        name: 'Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        version: 1,
        position: [100, 200],
    })
    Trigger = {};

    @node({
        id: 'n1',
        name: 'Noop',
        type: 'n8n-nodes-base.noOp',
        version: 1,
        position: [300, 200],
    })
    Noop = {};

    @links()
    defineRouting() {
        this.Trigger.out(0).to(this.Noop.in(0));
    }
}
