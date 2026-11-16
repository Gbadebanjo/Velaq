import type { Product } from "./constants.js";

export type Plan = "free" | "premium" | "hustle" | "paid";
export interface FeatureDef {
  id: string;
  name: string;
  product: Product;
  group: string;
  /** Plan a Personal feature belongs to; Business features are billed per feature, per user. */
  plan: Plan;
}

type Row = [id: string, name: string, plan?: Plan];
const biz = (group: string, rows: Row[]): FeatureDef[] =>
  rows.map(([id, name, plan]) => ({ id, name, product: "business", group, plan: plan ?? "paid" }));
const per = (group: string, rows: Row[]): FeatureDef[] =>
  rows.map(([id, name, plan]) => ({ id, name, product: "personal", group, plan: plan ?? "free" }));

export const FEATURES: FeatureDef[] = [
  ...biz("People", [
    ["PPL-001", "Employee Records"], ["PPL-002", "Onboarding"], ["PPL-003", "Attendance"],
    ["PPL-004", "Leave Management"], ["PPL-005", "Payroll"], ["PPL-006", "Employee Self-Service"],
    ["PPL-007", "Offboarding"], ["PPL-008", "Performance Management"],
    ["PPL-009", "Recruitment (ATS)"], ["PPL-010", "Learning & Development"],
  ]),
  ...biz("Finance", [
    ["FIN-001", "Accounting & General Ledger"], ["FIN-002", "Expenses"], ["FIN-003", "Tax"],
    ["FIN-004", "Invoicing"], ["FIN-005", "Treasury (Bank & Cash)"], ["FIN-006", "Budgets"],
    ["FIN-007", "Fixed Assets"], ["FIN-008", "Financial Reporting"],
  ]),
  ...biz("Operations", [
    ["OPS-001", "Projects"], ["OPS-002", "Tasks"], ["OPS-003", "Programs"], ["OPS-004", "SOP Management"],
    ["OPS-005", "Workflow Automation"], ["OPS-006", "Resource Planning"],
    ["OPS-007", "Knowledge Base & Documentation"], ["OPS-008", "Approvals Centre"], ["OPS-009", "Meetings"],
  ]),
  ...biz("Customers (CRM)", [
    ["CRM-001", "Leads"], ["CRM-002", "Accounts & Contacts"], ["CRM-003", "Opportunities & Pipeline"],
    ["CRM-004", "Contracts"], ["CRM-005", "Customer Success"], ["CRM-006", "Support & Service Requests"],
    ["CRM-007", "AI Contact Center"],
  ]),
  ...biz("Marketing", [
    ["MKT-001", "Campaigns & Automation"], ["MKT-002", "Email Marketing"],
    ["MKT-003", "Social Media Command Center"], ["MKT-004", "Landing Pages & Forms"],
    ["MKT-005", "Events"], ["MKT-006", "Lead Generation"],
  ]),
  ...biz("Supply Chain", [
    ["SCM-001", "Inventory"], ["SCM-002", "Warehouse"], ["SCM-003", "Procurement & Purchase Orders"],
    ["SCM-004", "Vendor Management"], ["SCM-005", "Asset Management"], ["SCM-006", "Logistics"],
  ]),
  ...biz("Analytics", [
    ["ANA-001", "Executive Dashboard"], ["ANA-002", "Custom Reports & BI"], ["ANA-003", "Forecasting"],
    ["ANA-004", "Department Performance"], ["ANA-005", "Financial Analytics"], ["ANA-006", "Operational Analytics"],
  ]),
  ...biz("AI", [
    ["AIC-001", "AI Copilot"], ["AIC-002", "Knowledge Assistant"], ["AIC-003", "Document Intelligence"],
    ["AIC-004", "AI Reports"], ["AIC-005", "Meeting Summaries"], ["AIC-006", "Predictive Insights"],
    ["AIC-007", "Smart Recommendations"],
  ]),
  ...biz("Integrations", [
    ["INT-001", "Microsoft 365"], ["INT-002", "Google Workspace"], ["INT-003", "Slack"], ["INT-004", "Zoom"],
    ["INT-005", "WhatsApp Business"], ["INT-006", "Payment Gateways"],
    ["INT-007", "Accounting System Connectors"], ["INT-008", "Public API & Webhooks"],
  ]),
  ...per("Profile & Documents", [["PER-001", "Professional Profile"], ["PER-002", "Document Vault"]]),
  ...per("Money", [
    ["PER-010", "Income & Expense Tracking"], ["PER-011", "Budgets"], ["PER-012", "Savings Goals"],
    ["PER-013", "Advanced Budgeting & Insights", "premium"],
  ]),
  ...per("Business of One", [
    ["PER-020", "Invoicing & Payment Links", "hustle"], ["PER-021", "Clients", "hustle"],
    ["PER-022", "Freelance Income Records", "hustle"],
  ]),
  ...per("Productivity", [["PER-030", "Tasks"], ["PER-031", "Notes"], ["PER-032", "Calendar"]]),
  ...per("Opportunities", [["PER-040", "Opportunity Discovery"], ["PER-041", "Applications Tracker"]]),
  ...per("AI", [["PER-050", "Personal AI Assistant", "premium"]]),
  ...per("Growth", [["PER-060", "Upgrade to Business"]]),
  { id: "MKP-001", name: "Post Opportunities", product: "marketplace", group: "Marketplace", plan: "paid" },
  { id: "MKP-002", name: "Applications Inbox", product: "marketplace", group: "Marketplace", plan: "paid" },
  { id: "MKP-003", name: "Payouts (later)", product: "marketplace", group: "Marketplace", plan: "paid" },
];

/** First Personal wave, built after the two foundation slices. */
export const PERSONAL_FIRST_WAVE = [
  "PER-001", "PER-002", "PER-010", "PER-011", "PER-012", "PER-030", "PER-031", "PER-032",
] as const;

/** Features released and switchable today. Everything else is registered but not yet released. */
export const RELEASED_FEATURE_IDS: ReadonlySet<string> = new Set<string>(["PER-001", "PER-010", "PER-011", "PER-012", "PER-030"]);

export const featureById = (id: string): FeatureDef | undefined => FEATURES.find((f) => f.id === id);
