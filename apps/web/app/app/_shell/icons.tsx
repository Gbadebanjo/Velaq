/** Line icons for the app menu. Decorative. */
const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconHome = () => (<svg {...base}><path d="m3 11 9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>);
export const IconUser = () => (<svg {...base}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>);
export const IconMenu = () => (<svg {...base} width={22} height={22}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
export const IconLock = () => (<svg {...base} width={13} height={13} strokeWidth={2.2}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
export const IconChevron = () => (<svg {...base} width={14} height={14} strokeWidth={2.2}><path d="m9 6 6 6-6 6" /></svg>);

const paths: Record<string, React.ReactNode> = {
  "Profile & Documents": (<><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M8 17a4 4 0 0 1 8 0" /></>),
  Money: (<><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M7 9.5v5M17 9.5v5" /></>),
  "Freelance & Side Hustle": (<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12h18" /></>),
  Productivity: (<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12 3 3 5-6" /></>),
  Opportunities: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>),
  AI: (<><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6.5 6.5 2.2 2.2M15.3 15.3l2.2 2.2M6.5 17.5l2.2-2.2M15.3 8.7l2.2-2.2" /></>),
  Growth: (<><path d="M4 19 10 13l4 4 6-8" /><path d="M15 9h5v5" /></>),
};

export const GroupIcon = ({ group }: { group: string }) => <svg {...base}>{paths[group] ?? <circle cx="12" cy="12" r="8" />}</svg>;

/** One icon per Personal feature, so the menu can be scanned by shape as well as by name. */
const features: Record<string, React.ReactNode> = {
  "PER-001": (<><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /><path d="M16.5 4.5 18 3M19 7h2" /></>),
  "PER-002": (<><path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /></>),
  "PER-010": (<><path d="M7 17V7M4 10l3-3 3 3" /><path d="M17 7v10M14 14l3 3 3-3" /></>),
  "PER-011": (<><circle cx="12" cy="12" r="8" /><path d="M12 4v8l5.5 5.5" /></>),
  "PER-012": (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" fill="currentColor" /></>),
  "PER-013": (<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  "PER-020": (<><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>),
  "PER-021": (<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5a3 3 0 0 1 0 6M18 20a6 6 0 0 0-2.5-4.9" /></>),
  "PER-022": (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>),
  "PER-030": (<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></>),
  "PER-031": (<><path d="M6 3h12v18H6Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>),
  "PER-032": (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  "PER-040": (<><circle cx="12" cy="12" r="8" /><path d="m15.5 8.5-2 5-5 2 2-5Z" /></>),
  "PER-041": (<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11h6M9 15h4" /></>),
  "PER-050": (<><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8Z" /><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8Z" /></>),
  "PER-060": (<><path d="M4 21V9l8-5 8 5v12" /><path d="M9 21v-6h6v6" /></>),
};

export const FeatureIcon = ({ id }: { id: string }) => <svg {...base}>{features[id] ?? <circle cx="12" cy="12" r="7" />}</svg>;
