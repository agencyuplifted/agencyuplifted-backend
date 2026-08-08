// 1:1 vom Header von agencyuplifted-seminare.onepage.me uebernommene
// Hinweisleiste ueber dem Hauptheader (Text + Optik exakt gleich). Rein
// statisch, da sie auf der Onepage-Seite ebenfalls kein Link/Interaktion ist.
export default function PremiumUpdatesBar() {
  return (
    <div className="wp-premium-bar">
      <div className="wp-premium-bar-inner">
        <span className="wp-premium-badge">Premium Updates</span>
        <span className="wp-premium-text">
          Schalte exklusive Lernpfade und von Experten geleitete Kurse frei. Jetzt für alle
          Premium-Mitglieder verfügbar.
        </span>
      </div>
    </div>
  );
}
