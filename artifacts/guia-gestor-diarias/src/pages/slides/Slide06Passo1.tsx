export default function Slide06Passo1() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#FAFAFA', fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box', padding: '5vh 5vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2vh' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '-1vw', top: '1.5vh', width: '26vw', height: '2.5vh', backgroundColor: '#0A1628', opacity: 0.07, zIndex: 0 }} />
          <h2 style={{ fontSize: '3.5vw', fontWeight: 900, color: '#0A1628', margin: 0, lineHeight: 1, letterSpacing: '-0.03em', position: 'relative', zIndex: 1 }}>Registrando uma Diária</h2>
        </div>
        <div style={{ fontSize: '1.2vw', fontWeight: 800, color: '#0A1628', letterSpacing: '-0.02em' }}>DECARGO</div>
      </div>

      {/* Subtitle */}
      <div style={{ marginBottom: '6vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.4vw', color: '#A0AEC0', fontWeight: 500 }}>Passo 1: Abrir o Dia</div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3.5vh' }}>
        <div style={{ display: 'flex', gap: '3vw', alignItems: 'flex-start' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '4vw', color: '#E2E8F0', fontWeight: 600, flexShrink: 0, lineHeight: 1 }}>01</div>
          <div style={{ paddingTop: '0.5vh' }}>
            <p style={{ fontSize: '2.2vw', fontWeight: 700, color: '#0A1628', margin: '0 0 0.5vh 0', lineHeight: 1.2 }}>Clique no dia desejado no calendário</p>
            <p style={{ fontSize: '1.8vw', color: '#718096', margin: 0, lineHeight: 1.4 }}>O painel lateral abre automaticamente com as diárias daquele dia</p>
          </div>
        </div>
        <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
        <div style={{ display: 'flex', gap: '3vw', alignItems: 'flex-start' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '4vw', color: '#E2E8F0', fontWeight: 600, flexShrink: 0, lineHeight: 1 }}>02</div>
          <div style={{ paddingTop: '0.5vh' }}>
            <p style={{ fontSize: '2.2vw', fontWeight: 700, color: '#0A1628', margin: '0 0 0.5vh 0', lineHeight: 1.2 }}>O painel lateral abre com a lista de diárias daquele dia</p>
            <p style={{ fontSize: '1.8vw', color: '#718096', margin: 0, lineHeight: 1.4 }}>Todos os registros existentes ficam visíveis antes de você criar um novo</p>
          </div>
        </div>
        <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
        <div style={{ display: 'flex', gap: '3vw', alignItems: 'flex-start' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '4vw', color: '#0A1628', fontWeight: 600, flexShrink: 0, lineHeight: 1, opacity: 0.15 }}>03</div>
          <div style={{ paddingTop: '0.5vh' }}>
            <p style={{ fontSize: '2.2vw', fontWeight: 700, color: '#0A1628', margin: '0 0 0.5vh 0', lineHeight: 1.2 }}>Clique em <span style={{ backgroundColor: '#0A1628', color: '#FFFFFF', padding: '0.2vh 0.8vw', fontSize: '2vw' }}>+ Nova Diária</span> na parte inferior do painel</p>
            <p style={{ fontSize: '1.8vw', color: '#718096', margin: 0, lineHeight: 1.4 }}>O formulário de registro é aberto</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: '3vh', left: '5vw', right: '5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '2vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#A0AEC0' }}>Guia do Gestor / DECARGO Diárias</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#0A1628', fontWeight: 600 }}>06</div>
      </div>
    </div>
  );
}
