export default function Slide01Cover() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#0A1628', fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box', padding: '5vh 5vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '1.8vw', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.03em' }}>DECARGO</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#718096', display: 'flex', flexDirection: 'column', gap: '0.8vh', textAlign: 'right' }}>
          <div><span style={{ color: '#4A5568', marginRight: '1vw' }}>Produto:</span><span style={{ color: '#A0AEC0' }}>Diárias</span></div>
          <div><span style={{ color: '#4A5568', marginRight: '1vw' }}>Audiência:</span><span style={{ color: '#A0AEC0' }}>Gestores</span></div>
          <div><span style={{ color: '#4A5568', marginRight: '1vw' }}>Versão:</span><span style={{ color: '#A0AEC0' }}>2026</span></div>
        </div>
      </div>

      {/* Main title — anchored near bottom */}
      <div style={{ position: 'absolute', bottom: '14vh', left: '5vw', width: '90vw' }}>
        <div style={{ position: 'relative', marginBottom: '5vh' }}>
          <div style={{ position: 'absolute', left: '-2vw', top: '2.5vh', width: '40vw', height: '7vh', backgroundColor: '#FFFFFF', opacity: 0.05, zIndex: 0 }} />
          <h1 style={{ fontSize: '8vw', fontWeight: 900, color: '#FFFFFF', margin: 0, lineHeight: 1, letterSpacing: '-0.04em', position: 'relative', zIndex: 1 }}>
            DECARGO Diárias
          </h1>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <p style={{ fontSize: '2vw', fontWeight: 400, color: '#E2E8F0', margin: 0, maxWidth: '52vw', lineHeight: 1.45 }}>
            Guia do Gestor — Como registrar e consultar diárias da sua equipe.
          </p>
          <div style={{ width: '22vw', height: '1px', backgroundColor: 'rgba(255,255,255,0.15)' }} />
        </div>
      </div>
    </div>
  );
}
