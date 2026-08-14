export default function Slide05Calendario() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#FAFAFA', fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box', padding: '5vh 5vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6vh' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '-1vw', top: '1.5vh', width: '24vw', height: '2.5vh', backgroundColor: '#0A1628', opacity: 0.07, zIndex: 0 }} />
          <h2 style={{ fontSize: '3.5vw', fontWeight: 900, color: '#0A1628', margin: 0, lineHeight: 1, letterSpacing: '-0.03em', position: 'relative', zIndex: 1 }}>Navegando pelo Calendário</h2>
        </div>
        <div style={{ fontSize: '1.2vw', fontWeight: 800, color: '#0A1628', letterSpacing: '-0.02em' }}>DECARGO</div>
      </div>

      {/* Content */}
      <div style={{ display: 'flex', gap: '5vw' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2.8vh' }}>
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>01</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>A tela Diárias exibe um calendário mensal por padrão</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>02</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Clique em qualquer dia para abrir o painel lateral com as diárias daquele dia</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>03</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Use as setas para navegar entre meses</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>04</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Dias com registros exibem um contador colorido</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>05</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Alterne para visão Semana ou Dia no canto superior direito</p>
          </div>
        </div>

        {/* Right side tip box */}
        <div style={{ width: '26vw', backgroundColor: '#F7FAFC', border: '1px solid #E2E8F0', padding: '3.5vh 2.5vw', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#A0AEC0', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2vh' }}>Dica</div>
          <p style={{ fontSize: '1.8vw', fontWeight: 600, color: '#0A1628', lineHeight: 1.4, margin: '0 0 2vh 0' }}>
            O painel lateral abre sem sair do calendário.
          </p>
          <p style={{ fontSize: '1.6vw', color: '#718096', lineHeight: 1.5, margin: 0 }}>
            Você pode ver e registrar diárias sem perder a visão do mês.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: '3vh', left: '5vw', right: '5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '2vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#A0AEC0' }}>Guia do Gestor / DECARGO Diárias</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#0A1628', fontWeight: 600 }}>05</div>
      </div>
    </div>
  );
}
