/**
 * Hero illustration: Business and Personal are separate spaces; the Marketplace is the one
 * bridge between them. It assembles itself on load, then sparks travel across the bridge.
 */
const bizRows = ["People & payroll", "Finance", "Operations", "Customers & sales"];
const perRows = ["Profile & documents", "Money", "Tasks & calendar"];
const BRIDGE = "M158 278 V318 Q158 334 174 334 H428 Q444 334 444 318 V278";

export function PlatformDiagram() {
  return (
    <svg className="platform" viewBox="0 0 560 380" role="img" aria-labelledby="platform-title platform-desc">
      <title id="platform-title">How Velaq fits together</title>
      <desc id="platform-desc">
        Velaq for Business and Velaq Personal are separate spaces. They meet only at the Velaq Marketplace, where organisations post opportunities and people choose to apply.
      </desc>

      <g className="p-card p-card-biz">
        <rect x="8" y="8" width="300" height="270" rx="26" className="p-biz" />
        <text x="32" y="48" className="p-title">Velaq for Business</text>
        <text x="32" y="70" className="p-sub">Your organisation, one place</text>
        {bizRows.map((label, i) => {
          const y = 96 + i * 44;
          return (
            <g key={label} className="p-item" style={{ "--i": i } as React.CSSProperties}>
              <rect x="32" y={y} width="252" height="34" rx="17" className="p-row" />
              <circle cx="52" cy={y + 17} r="6" className="p-dot" />
              <text x="68" y={y + 22} className="p-label">{label}</text>
            </g>
          );
        })}
      </g>

      <g className="p-card p-card-per">
        <rect x="336" y="64" width="216" height="214" rx="26" className="p-per" />
        <text x="358" y="102" className="p-title">Velaq Personal</text>
        <text x="358" y="124" className="p-sub">Your own space</text>
        {perRows.map((label, i) => {
          const y = 148 + i * 42;
          return (
            <g key={label} className="p-item" style={{ "--i": i + 1 } as React.CSSProperties}>
              <rect x="358" y={y} width="176" height="30" rx="15" className="p-row p-row-per" />
              <text x="374" y={y + 20} className="p-label">{label}</text>
            </g>
          );
        })}
      </g>

      <path d={BRIDGE} className="p-bridge-track" pathLength={1} />
      <path d={BRIDGE} className="p-bridge" />
      {[0, 1.2, 2.4].map((begin) => (
        <circle key={begin} r="4" className="p-spark" opacity="0">
          {/* Hidden until it starts moving, so it never sits at the corner. */}
          <set attributeName="opacity" to="1" begin={`${2 + begin}s`} />
          <animateMotion dur="3.6s" begin={`${2 + begin}s`} repeatCount="indefinite" path={BRIDGE} />
        </circle>
      ))}

      <g className="p-mkp-group">
        <rect x="196" y="314" width="216" height="44" rx="22" className="p-mkp" />
        <text x="304" y="342" textAnchor="middle" className="p-mkp-label">Velaq Marketplace</text>
      </g>
    </svg>
  );
}
