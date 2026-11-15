/** Small line icons, drawn for Velaq. Decorative: hidden from screen readers. */
type P = { className?: string };
const base = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconBuilding = (p: P) => (<svg {...base} {...p}><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" /><path d="M15 9h4a1 1 0 0 1 1 1v11" /><path d="M8 8h3M8 12h3M8 16h3M3 21h18" /></svg>);
export const IconPerson = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>);
export const IconBridge = (p: P) => (<svg {...base} {...p}><circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="12" r="2.5" /><path d="M7.5 12h9" /><path d="m13.5 9 3 3-3 3" /></svg>);
export const IconToggle = (p: P) => (<svg {...base} {...p}><rect x="2" y="7" width="20" height="10" rx="5" /><circle cx="16" cy="12" r="2.6" fill="currentColor" stroke="none" /></svg>);
export const IconLink = (p: P) => (<svg {...base} {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>);
export const IconPin = (p: P) => (<svg {...base} {...p}><path d="M12 21s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>);
export const IconSpark = (p: P) => (<svg {...base} {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6.5 6.5 2.2 2.2M15.3 15.3l2.2 2.2M6.5 17.5l2.2-2.2M15.3 8.7l2.2-2.2" /></svg>);
export const IconShield = (p: P) => (<svg {...base} {...p}><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></svg>);
