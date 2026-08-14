export default function Slide04Interface() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#FAFAFA', fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box', padding: '5vh 5vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6vh' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '-1vw', top: '1.5vh', width: '20vw', height: '2.5vh', backgroundColor: '#0A1628', opacity: 0.07, zIndex: 0 }} />
          <h2 style={{ fontSize: '3.5vw', fontWeight: 900, color: '#0A1628', margin: 0, lineHeight: 1, letterSpacing: '-0.03em', position: 'relative', zIndex: 1 }}>A Interface do Gestor</h2>
        </div>
        <div style={{ fontSize: '1.2vw', fontWeight: 800, color: '#0A1628', letterSpacing: '-0.02em' }}>DECARGO</div>
      </div>

      {/* Two section cards */}
      <div style={{ display: 'flex', gap: '3vw', marginBottom: '4vh' }}>
        {/* Card 1: Diárias */}
        <div style={{ flex: 1, border: '2px solid #0A1628', padding: '4vh 3vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#A0AEC0', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2vh' }}>Seção 01</div>
          <div style={{ fontSize: '2.8vw', fontWeight: 900, color: '#0A1628', letterSpacing: '-0.03em', marginBottom: '2vh' }}>Diárias</div>
          <div style={{ width: '4vw', height: '3px', backgroundColor: '#0A1628', marginBottom: '2vh' }} />
          <p style={{ fontSize: '1.8vw', color: '#4A5568', lineHeight: 1.5, margin: 0 }}>Calendário para lançar novos registros de diárias da sua equipe</p>
        </div>

        {/* Card 2: Diárias da Equipe */}
        <div style={{ flex: 1, backgroundColor: '#0A1628', padding: '4vh 3vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2vh' }}>Seção 02</div>
          <div style={{ fontSize: '2.8vw', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.03em', marginBottom: '2vh' }}>Diárias da Equipe</div>
          <div style={{ width: '4vw', height: '3px', backgroundColor: '#A0AEC0', marginBottom: '2vh' }} />
          <p style={{ fontSize: '1.8vw', color: '#A0AEC0', lineHeight: 1.5, margin: 0 }}>Lista completa de todos os registros da sua equipe</p>
        </div>
      </div>

      {/* Notes */}
      <div style={{ display: 'flex', gap: '3vw' }}>
        <div style={{ flex: 1, display: 'flex', gap: '1.5vw', alignItems: 'flex-start' }}>
          <div style={{ width: '3px', height: '100%', backgroundColor: '#E2E8F0', flexShrink: 0, minHeight: '5vh' }} />
          <p style={{ fontSize: '1.7vw', color: '#718096', lineHeight: 1.45, margin: 0 }}>Seu nome e papel aparecem no rodapé do menu lateral</p>
        </div>
        <div style={{ flex: 1, display: 'flex', gap: '1.5vw', alignItems: 'flex-start' }}>
          <div style={{ width: '3px', height: '100%', backgroundColor: '#E2E8F0', flexShrink: 0, minHeight: '5vh' }} />
          <p style={{ fontSize: '1.7vw', color: '#718096', lineHeight: 1.45, margin: 0 }}>O sistema exibe apenas as equipes que você gerencia</p>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: '3vh', left: '5vw', right: '5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '2vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#A0AEC0' }}>Guia do Gestor / DECARGO Diárias</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#0A1628', fontWeight: 600 }}>04</div>
      </div>
    </div>
  );
}
