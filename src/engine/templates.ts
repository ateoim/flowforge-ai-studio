import type { WorkflowGraph } from './types';

export const WORKFLOW_TEMPLATES: WorkflowGraph[] = [
  {
    id: 'support-triage',
    name: 'Customer Support Triage & Priority Routing',
    description:
      'Ingests support webhook events, classifies sentiment and SLA priority via LLM, and routes P1 incidents to Jira + Slack while drafting standard replies for P2/P3 tickets.',
    category: 'Support Ops',
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        label: 'Support Webhook',
        subtitle: 'POST /hooks/zendesk-ticket',
        position: { x: 40, y: 180 },
        retryPolicy: { maxRetries: 0, backoffMs: 250 },
        simulateFailure: false,
        config: {
          samplePayload: {
            ticketId: 'SUP-4821',
            customerName: 'Elena Rostova',
            customerEmail: 'elena@meridianfin.io',
            planTier: 'Enterprise',
            subject: 'Production checkout webhook returning 502 since 09:14 UTC',
            body: 'All live payment confirmations are failing in eu-west-1. Revenue impact is immediate.',
          },
        },
      },
      {
        id: 'classifier',
        type: 'llm',
        label: 'Sentiment & Intent LLM',
        subtitle: 'Structured JSON classification',
        position: { x: 330, y: 180 },
        retryPolicy: { maxRetries: 2, backoffMs: 400 },
        simulateFailure: false,
        config: {
          model: 'gpt-4o-mini',
          template:
            'Classify ticket {{trigger.ticketId}} from {{trigger.customerEmail}} ({{trigger.planTier}}).\nSubject: {{trigger.subject}}\nBody: {{trigger.body}}\nReturn priority (P1/P2/P3), sentiment, and intent.',
          simulatedOutput: {
            ticketId: '{{trigger.ticketId}}',
            priority: 'P1',
            sentiment: 'urgent_negative',
            intent: 'payment_outage',
            summary: 'Enterprise checkout webhook 502 outage in eu-west-1',
            confidence: 0.97,
          },
        },
      },
      {
        id: 'router',
        type: 'condition',
        label: 'Priority Router',
        subtitle: 'priority == "P1"',
        position: { x: 630, y: 180 },
        retryPolicy: { maxRetries: 0, backoffMs: 200 },
        simulateFailure: false,
        config: {
          conditionField: 'classifier.priority',
          conditionOperator: 'equals',
          conditionValue: 'P1',
        },
      },
      {
        id: 'jira',
        type: 'http',
        label: 'Create Jira Incident',
        subtitle: 'POST /rest/api/3/issue',
        position: { x: 930, y: 60 },
        retryPolicy: { maxRetries: 2, backoffMs: 350 },
        simulateFailure: false,
        config: {
          method: 'POST',
          endpoint: 'https://acme.atlassian.net/rest/api/3/issue',
          template:
            '{"project":"INC","priority":"{{classifier.priority}}","summary":"[{{trigger.ticketId}}] {{classifier.summary}}"}',
          simulatedOutput: {
            issueKey: 'INC-904',
            issueUrl: 'https://acme.atlassian.net/browse/INC-904',
            assignee: 'oncall-payments',
          },
        },
      },
      {
        id: 'slack',
        type: 'action',
        label: 'Page #oncall-support',
        subtitle: 'Slack Block Kit Alert',
        position: { x: 1220, y: 60 },
        retryPolicy: { maxRetries: 1, backoffMs: 300 },
        simulateFailure: false,
        config: {
          template:
            'P1 Escalation: {{trigger.ticketId}} ({{trigger.customerEmail}}) -> Jira {{jira.issueKey}}. Summary: {{classifier.summary}}',
          simulatedOutput: {
            channel: '#oncall-support',
            slackTs: '1740129384.004100',
            notifiedCount: 4,
          },
        },
      },
      {
        id: 'draft_reply',
        type: 'action',
        label: 'Queue Standard Reply',
        subtitle: 'Zendesk Macro Draft',
        position: { x: 930, y: 300 },
        retryPolicy: { maxRetries: 1, backoffMs: 300 },
        simulateFailure: false,
        config: {
          template:
            'Draft response for {{trigger.customerName}} ({{trigger.ticketId}}): Thank you for reaching out regarding {{trigger.subject}}.',
          simulatedOutput: {
            queue: 'tier-2-support',
            draftCreated: true,
          },
        },
      },
    ],
    edges: [
      { id: 'e-st-1', source: 'trigger', target: 'classifier', condition: 'always' },
      { id: 'e-st-2', source: 'classifier', target: 'router', condition: 'always' },
      { id: 'e-st-3', source: 'router', target: 'jira', condition: 'true', label: 'P1' },
      { id: 'e-st-4', source: 'jira', target: 'slack', condition: 'always' },
      {
        id: 'e-st-5',
        source: 'router',
        target: 'draft_reply',
        condition: 'false',
        label: 'P2 / P3',
      },
    ],
  },
  {
    id: 'ap-invoice',
    name: 'AP Invoice Extraction & Xero Validation',
    description:
      'Extracts structured line items from inbound supplier invoices, validates Australian ABN & 10% GST arithmetic, and posts valid bills to Xero or routes anomalies to the AP exception queue.',
    category: 'Finance & ERP',
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        label: 'Invoice Document Trigger',
        subtitle: 'S3 Upload: inv-2026-0842.pdf',
        position: { x: 40, y: 180 },
        retryPolicy: { maxRetries: 0, backoffMs: 250 },
        simulateFailure: false,
        config: {
          samplePayload: {
            documentId: 'DOC-8842',
            fileName: 'inv-2026-0842.pdf',
            supplierEmail: 'billing@pacificcloud.com.au',
            currency: 'AUD',
            rawOcrText: 'Pacific Cloud Pty Ltd ABN 51 824 753 556 Subtotal $4,200.00 GST $420.00 Total $4,620.00',
          },
        },
      },
      {
        id: 'extractor',
        type: 'llm',
        label: 'Structured Extraction',
        subtitle: 'Invoice schema parser',
        position: { x: 330, y: 180 },
        retryPolicy: { maxRetries: 2, backoffMs: 400 },
        simulateFailure: false,
        config: {
          model: 'gpt-4o-mini',
          template:
            'Extract supplierName, abn, invoiceNumber, subtotal, gst, total from {{trigger.fileName}}:\n{{trigger.rawOcrText}}',
          simulatedOutput: {
            supplierName: 'Pacific Cloud Pty Ltd',
            abn: '51824753556',
            invoiceNumber: 'INV-2026-0842',
            subtotal: 4200,
            gst: 420,
            total: 4620,
            currency: '{{trigger.currency}}',
          },
        },
      },
      {
        id: 'validator',
        type: 'transform',
        label: 'GST & ABN Validator',
        subtitle: 'Checksum + 10% tax audit',
        position: { x: 630, y: 180 },
        retryPolicy: { maxRetries: 1, backoffMs: 250 },
        simulateFailure: false,
        config: {
          template:
            'Validate ABN {{extractor.abn}} and verify GST {{extractor.gst}} == 10% of {{extractor.subtotal}} (Total {{extractor.total}})',
          simulatedOutput: {
            abnChecksumValid: true,
            gstDelta: 0,
            isValid: true,
            accountCode: '429-CLOUD-INFRA',
          },
        },
      },
      {
        id: 'gate',
        type: 'condition',
        label: 'Validation Gate',
        subtitle: 'isValid == true',
        position: { x: 920, y: 180 },
        retryPolicy: { maxRetries: 0, backoffMs: 200 },
        simulateFailure: false,
        config: {
          conditionField: 'validator.isValid',
          conditionOperator: 'truthy',
          conditionValue: 'true',
        },
      },
      {
        id: 'xero',
        type: 'http',
        label: 'Sync Bill to Xero ERP',
        subtitle: 'PUT /api.xro/2.0/Invoices',
        position: { x: 1210, y: 60 },
        retryPolicy: { maxRetries: 2, backoffMs: 400 },
        simulateFailure: false,
        config: {
          method: 'PUT',
          endpoint: 'https://api.xero.com/api.xro/2.0/Invoices',
          template:
            '{"Type":"ACCPAY","InvoiceNumber":"{{extractor.invoiceNumber}}","Contact":"{{extractor.supplierName}}","Total":{{extractor.total}}}',
          simulatedOutput: {
            xeroInvoiceId: 'xero-bill-77219',
            status: 'DRAFT',
            accountCode: '{{validator.accountCode}}',
          },
        },
      },
      {
        id: 'exception',
        type: 'action',
        label: 'AP Exception Queue',
        subtitle: 'Flag for finance review',
        position: { x: 1210, y: 300 },
        retryPolicy: { maxRetries: 1, backoffMs: 300 },
        simulateFailure: false,
        config: {
          template:
            'Hold invoice {{extractor.invoiceNumber}} ({{extractor.supplierName}}) for manual ABN/GST verification.',
          simulatedOutput: {
            queue: 'ap-exceptions',
            priority: 'high',
          },
        },
      },
    ],
    edges: [
      { id: 'e-ap-1', source: 'trigger', target: 'extractor', condition: 'always' },
      { id: 'e-ap-2', source: 'extractor', target: 'validator', condition: 'always' },
      { id: 'e-ap-3', source: 'validator', target: 'gate', condition: 'always' },
      { id: 'e-ap-4', source: 'gate', target: 'xero', condition: 'true', label: 'Valid' },
      { id: 'e-ap-5', source: 'gate', target: 'exception', condition: 'false', label: 'Invalid' },
    ],
  },
  {
    id: 'lead-enrichment',
    name: 'B2B Lead Enrichment & CRM Scoring',
    description:
      'Enriches inbound demo requests with firmographic data, scores Ideal Customer Profile (ICP) fit with an LLM, and routes qualified accounts straight to HubSpot Deal creation.',
    category: 'Revenue Ops',
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        label: 'Inbound Demo Form',
        subtitle: 'POST /forms/enterprise-demo',
        position: { x: 40, y: 180 },
        retryPolicy: { maxRetries: 0, backoffMs: 250 },
        simulateFailure: false,
        config: {
          samplePayload: {
            leadId: 'LD-3109',
            fullName: 'Marcus Vance',
            workEmail: 'mvance@northstarlogistics.com',
            domain: 'northstarlogistics.com',
            role: 'VP of Platform Engineering',
            useCase: 'Automating 40k monthly customs & freight reconciliation workflows',
          },
        },
      },
      {
        id: 'lookup',
        type: 'http',
        label: 'Company Lookup',
        subtitle: 'GET /v2/companies/find',
        position: { x: 330, y: 180 },
        retryPolicy: { maxRetries: 2, backoffMs: 350 },
        simulateFailure: false,
        config: {
          method: 'GET',
          endpoint: 'https://company.clearbit.com/v2/companies/find?domain={{trigger.domain}}',
          template: 'Enrich domain {{trigger.domain}} for {{trigger.fullName}}',
          simulatedOutput: {
            companyName: 'Northstar Logistics Group',
            employeeCount: 640,
            annualRevenueUsd: 92000000,
            industry: 'Supply Chain & Freight',
            hqCountry: 'US',
          },
        },
      },
      {
        id: 'scorer',
        type: 'llm',
        label: 'ICP Fit Scorer',
        subtitle: '0-100 B2B scoring rubric',
        position: { x: 630, y: 180 },
        retryPolicy: { maxRetries: 2, backoffMs: 400 },
        simulateFailure: false,
        config: {
          model: 'gpt-4o-mini',
          template:
            'Score ICP fit for {{lookup.companyName}} ({{lookup.employeeCount}} employees, {{lookup.industry}}). Contact: {{trigger.role}}. Use case: {{trigger.useCase}}.',
          simulatedOutput: {
            icpScore: 89,
            tier: 'Enterprise-A',
            recommendedAe: 'sarah.chen@flowforge.io',
            rationale: 'VP-level technical buyer with high-volume automation mandate',
          },
        },
      },
      {
        id: 'router',
        type: 'condition',
        label: 'ICP Threshold Router',
        subtitle: 'icpScore >= 75',
        position: { x: 920, y: 180 },
        retryPolicy: { maxRetries: 0, backoffMs: 200 },
        simulateFailure: false,
        config: {
          conditionField: 'scorer.icpScore',
          conditionOperator: 'gte',
          conditionValue: '75',
        },
      },
      {
        id: 'hubspot',
        type: 'action',
        label: 'HubSpot Deal Upsert',
        subtitle: 'Assign AE + Fast-Track',
        position: { x: 1210, y: 60 },
        retryPolicy: { maxRetries: 2, backoffMs: 350 },
        simulateFailure: false,
        config: {
          template:
            'Upsert HubSpot Deal for {{lookup.companyName}} (Score: {{scorer.icpScore}}) -> Owner: {{scorer.recommendedAe}}',
          simulatedOutput: {
            hubspotDealId: 'hs-deal-55812',
            pipelineStage: 'Discovery Scheduled',
            owner: '{{scorer.recommendedAe}}',
          },
        },
      },
      {
        id: 'nurture',
        type: 'action',
        label: 'Enroll Nurture Sequence',
        subtitle: 'Lifecycle drip campaign',
        position: { x: 1210, y: 300 },
        retryPolicy: { maxRetries: 1, backoffMs: 300 },
        simulateFailure: false,
        config: {
          template:
            'Add {{trigger.workEmail}} to self-serve onboarding sequence (ICP score {{scorer.icpScore}}).',
          simulatedOutput: {
            sequenceId: 'seq-plg-nurture',
            enrolled: true,
          },
        },
      },
    ],
    edges: [
      { id: 'e-le-1', source: 'trigger', target: 'lookup', condition: 'always' },
      { id: 'e-le-2', source: 'lookup', target: 'scorer', condition: 'always' },
      { id: 'e-le-3', source: 'scorer', target: 'router', condition: 'always' },
      { id: 'e-le-4', source: 'router', target: 'hubspot', condition: 'true', label: 'Score >= 75' },
      { id: 'e-le-5', source: 'router', target: 'nurture', condition: 'false', label: 'Score < 75' },
    ],
  },
  {
    id: 'incident-rca',
    name: 'Production Incident Root-Cause Summary',
    description:
      'Correlates Datadog alert webhooks with structured error log clusters, synthesizes an actionable RCA brief, and escalates SEV1 outages to PagerDuty while emailing lower-severity digests.',
    category: 'SRE & Platform',
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        label: 'Alert Webhook',
        subtitle: 'Datadog Monitor #4192',
        position: { x: 40, y: 180 },
        retryPolicy: { maxRetries: 0, backoffMs: 250 },
        simulateFailure: false,
        config: {
          samplePayload: {
            alertId: 'DD-99201',
            service: 'ledger-settlement-api',
            region: 'ap-southeast-2',
            errorRatePct: 18.4,
            recentDeploySha: '7c4e91a',
            sampleError: 'FATAL: remaining connection slots are reserved for non-replication superuser connections',
          },
        },
      },
      {
        id: 'parser',
        type: 'transform',
        label: 'Log Cluster Parser',
        subtitle: 'Extract stack & deploy diff',
        position: { x: 330, y: 180 },
        retryPolicy: { maxRetries: 1, backoffMs: 250 },
        simulateFailure: false,
        config: {
          template:
            'Parse error signature for {{trigger.service}} ({{trigger.region}}) deploy {{trigger.recentDeploySha}}: {{trigger.sampleError}}',
          simulatedOutput: {
            errorSignature: 'PG_POOL_EXHAUSTION',
            affectedPods: 12,
            deployCorrelation: '7c4e91a raised max_pool_size from 10 to 40 per worker',
            p99LatencyMs: 6420,
          },
        },
      },
      {
        id: 'rca',
        type: 'llm',
        label: 'RCA Synthesizer',
        subtitle: 'Root cause & rollback plan',
        position: { x: 630, y: 180 },
        retryPolicy: { maxRetries: 2, backoffMs: 400 },
        simulateFailure: false,
        config: {
          model: 'gpt-4o-mini',
          template:
            'Synthesize incident RCA for {{trigger.service}} (error rate {{trigger.errorRatePct}}%). Signature: {{parser.errorSignature}}. Deploy: {{parser.deployCorrelation}}.',
          simulatedOutput: {
            severity: 'SEV1',
            rootCause: 'Postgres connection pool exhaustion triggered by deploy 7c4e91a',
            mitigation: 'Rollback ledger-settlement-api to previous revision and cap pool size to 12',
            estimatedBlastRadius: 'All settlement writes in ap-southeast-2',
          },
        },
      },
      {
        id: 'router',
        type: 'condition',
        label: 'Severity Gate',
        subtitle: 'severity == "SEV1"',
        position: { x: 920, y: 180 },
        retryPolicy: { maxRetries: 0, backoffMs: 200 },
        simulateFailure: false,
        config: {
          conditionField: 'rca.severity',
          conditionOperator: 'equals',
          conditionValue: 'SEV1',
        },
      },
      {
        id: 'pagerduty',
        type: 'action',
        label: 'Escalate PagerDuty',
        subtitle: 'Trigger SEV1 Bridge',
        position: { x: 1210, y: 60 },
        retryPolicy: { maxRetries: 2, backoffMs: 300 },
        simulateFailure: false,
        config: {
          template:
            'SEV1 {{trigger.service}}: {{rca.rootCause}}. Action: {{rca.mitigation}}',
          simulatedOutput: {
            incidentId: 'PD-88410',
            bridgeUrl: 'https://meet.internal/sev1-ledger',
            pagedTeam: 'sre-core-oncall',
          },
        },
      },
      {
        id: 'digest',
        type: 'action',
        label: 'Send Engineering Digest',
        subtitle: 'Email platform-ops@',
        position: { x: 1210, y: 300 },
        retryPolicy: { maxRetries: 1, backoffMs: 300 },
        simulateFailure: false,
        config: {
          template:
            'Incident summary for {{trigger.service}} ({{rca.severity}}): {{rca.rootCause}}',
          simulatedOutput: {
            recipient: 'platform-ops@acme.io',
            sent: true,
          },
        },
      },
    ],
    edges: [
      { id: 'e-ir-1', source: 'trigger', target: 'parser', condition: 'always' },
      { id: 'e-ir-2', source: 'parser', target: 'rca', condition: 'always' },
      { id: 'e-ir-3', source: 'rca', target: 'router', condition: 'always' },
      { id: 'e-ir-4', source: 'router', target: 'pagerduty', condition: 'true', label: 'SEV1' },
      { id: 'e-ir-5', source: 'router', target: 'digest', condition: 'false', label: 'SEV2 / SEV3' },
    ],
  },
];

export function cloneWorkflowGraph(graph: WorkflowGraph): WorkflowGraph {
  return JSON.parse(JSON.stringify(graph)) as WorkflowGraph;
}
