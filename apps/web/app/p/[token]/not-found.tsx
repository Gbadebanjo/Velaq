import Link from "next/link";
import { Logo } from "../../_components/SiteHeader";

export default function SharedProfileNotFound() {
  return (
    <main className="sp-page">
      <div className="sp-card sp-empty">
        <h1>This profile link isn't active</h1>
        <p>The person may have turned the link off or made a new one. Ask them for their current link.</p>
      </div>
      <footer className="sp-foot"><Link href="/" aria-label="Velaq"><Logo height={18} /></Link></footer>
    </main>
  );
}
