export default function Slide08Lote() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#FAFAFA', fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box', padding: '5vh 5vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2vh' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '-1vw', top: '1.5vh', width: '14vw', height: '2.5vh', backgroundColor: '#0A1628', opacity: 0.07, zIndex: 0 }} />
          <h2 style={{ fontSize: '3.5vw', fontWeight: 900, color: '#0A1628', margin: 0, lineHeight: 1, letterSpacing: '-0.03em', position: 'relative', zIndex: 1 }}>Registro em Lote</h2>
        </div>
        <div style={{ fontSize: '1.2vw', fontWeight: 800, color: '#0A1628', letterSpacing: '-0.02em' }}>DECARGO</div>
      </div>
      <div style={{ marginBottom: '4vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.4vw', color: '#A0AEC0' }}>Várias Diárias no Mesmo Dia</div>
      </div>

      {/* Content — 2 columns */}
      <div style={{ display: 'flex', gap: '5vw', flex: 1 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2.5vh' }}>
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>01</div>
            <p style={{ fontSize: '1.9vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Para registrar múltiplos prestadores no mesmo dia, use a planilha integrada</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>02</div>
            <p style={{ fontSize: '1.9vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Clique em + Nova Diária e a grade é exibida automaticamente</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>03</div>
            <p style={{ fontSize: '1.9vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Cada linha representa um prestador diferente</p>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2.5vh' }}>
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>04</div>
            <p style={{ fontSize: '1.9vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Preencha Nome e Tipo — uma nova linha aparece sozinha ao escolher o primeiro nome</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>05</div>
            <p style={{ fontSize: '1.9vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Clique em Salvar Tudo para confirmar todos os registros de uma vez</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ backgroundColor: '#F7FAFC', border: '1px solid #E2E8F0', padding: '2.5vh 2vw' }}>
            <p style={{ fontSize: '1.9vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Ideal para dias com muitos prestadores trabalhando juntos</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: '3vh', left: '5vw', right: '5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '2vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#A0AEC0' }}>Guia do Gestor / DECARGO Diárias</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#0A1628', fontWeight: 600 }}>08</div>
      </div>
    </div>
  );
}
