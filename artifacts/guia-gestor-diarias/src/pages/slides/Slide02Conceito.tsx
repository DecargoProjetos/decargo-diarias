export default function Slide02Conceito() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#FAFAFA', fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box', padding: '5vh 5vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6vh' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '-1vw', top: '1.5vh', width: '18vw', height: '2.5vh', backgroundColor: '#0A1628', opacity: 0.07, zIndex: 0 }} />
          <h2 style={{ fontSize: '3.5vw', fontWeight: 900, color: '#0A1628', margin: 0, lineHeight: 1, letterSpacing: '-0.03em', position: 'relative', zIndex: 1 }}>O que são Diárias?</h2>
        </div>
        <div style={{ fontSize: '1.2vw', fontWeight: 800, color: '#0A1628', letterSpacing: '-0.02em' }}>DECARGO</div>
      </div>

      {/* Content — 2 columns */}
      <div style={{ display: 'flex', gap: '5vw', flex: 1 }}>
        {/* Left: numbered bullets */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3.5vh' }}>
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>01</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Diárias são registros de trabalho de prestadores de serviço</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>02</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Cada diária corresponde a um dia trabalhado por um prestador da sua equipe</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>03</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>O sistema centraliza lançamento, aprovação e exportação para a folha de pagamento</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>04</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Gestores são responsáveis pelo lançamento; administradores fazem a aprovação</p>
          </div>
        </div>

        {/* Right: info box */}
        <div style={{ width: '28vw', backgroundColor: '#0A1628', padding: '4vh 3vw', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2vh' }}>Seu papel</div>
          <p style={{ fontSize: '2.2vw', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.25, margin: '0 0 3vh 0', letterSpacing: '-0.02em' }}>
            Você registra. O admin aprova.
          </p>
          <p style={{ fontSize: '1.6vw', color: '#A0AEC0', lineHeight: 1.5, margin: 0 }}>
            Após o registro, a diária segue para revisão e depois para a folha de pagamento.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: '3vh', left: '5vw', right: '5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '2vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#A0AEC0' }}>Guia do Gestor / DECARGO Diárias</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#0A1628', fontWeight: 600 }}>02</div>
      </div>
    </div>
  );
}
