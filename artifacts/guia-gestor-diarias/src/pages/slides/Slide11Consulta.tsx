export default function Slide11Consulta() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#FAFAFA', fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box', padding: '5vh 5vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6vh' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '-1vw', top: '1.5vh', width: '30vw', height: '2.5vh', backgroundColor: '#0A1628', opacity: 0.07, zIndex: 0 }} />
          <h2 style={{ fontSize: '3.5vw', fontWeight: 900, color: '#0A1628', margin: 0, lineHeight: 1, letterSpacing: '-0.03em', position: 'relative', zIndex: 1 }}>Consultando as Diárias da Equipe</h2>
        </div>
        <div style={{ fontSize: '1.2vw', fontWeight: 800, color: '#0A1628', letterSpacing: '-0.02em' }}>DECARGO</div>
      </div>

      {/* Content */}
      <div style={{ display: 'flex', gap: '5vw' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2.8vh' }}>
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>01</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Acesse Diárias da Equipe no menu lateral</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>02</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>A tela exibe todos os registros ativos da sua equipe em formato de tabela</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>03</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Use os filtros no topo para refinar a busca</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>04</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>A paginação exibe até 20 registros por página</p>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>05</div>
            <p style={{ fontSize: '2vw', color: '#4A5568', lineHeight: 1.45, margin: 0 }}>Diárias canceladas não aparecem na lista</p>
          </div>
        </div>

        {/* Right: table preview */}
        <div style={{ width: '30vw', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#A0AEC0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1.5vh' }}>Colunas da tabela</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5vh' }}>
            <div style={{ backgroundColor: '#0A1628', padding: '1.2vh 1.5vw', display: 'flex', gap: '1vw' }}>
              <span style={{ fontSize: '1.5vw', color: '#FFFFFF', fontWeight: 700, flex: 2 }}>Prestador</span>
              <span style={{ fontSize: '1.5vw', color: '#FFFFFF', fontWeight: 700, flex: 1 }}>Data</span>
              <span style={{ fontSize: '1.5vw', color: '#FFFFFF', fontWeight: 700, flex: 1 }}>Status</span>
            </div>
            <div style={{ backgroundColor: '#F7FAFC', padding: '1vh 1.5vw', display: 'flex', gap: '1vw', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '1.5vw', color: '#4A5568', flex: 2 }}>João Silva</span>
              <span style={{ fontSize: '1.5vw', color: '#4A5568', flex: 1 }}>15/07</span>
              <span style={{ fontSize: '1.5vw', color: '#059669', flex: 1, fontWeight: 600 }}>Aprovada</span>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', padding: '1vh 1.5vw', display: 'flex', gap: '1vw', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '1.5vw', color: '#4A5568', flex: 2 }}>Maria Costa</span>
              <span style={{ fontSize: '1.5vw', color: '#4A5568', flex: 1 }}>16/07</span>
              <span style={{ fontSize: '1.5vw', color: '#D97706', flex: 1, fontWeight: 600 }}>Pendente</span>
            </div>
            <div style={{ backgroundColor: '#F7FAFC', padding: '1vh 1.5vw', display: 'flex', gap: '1vw', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '1.5vw', color: '#4A5568', flex: 2 }}>Carlos Rocha</span>
              <span style={{ fontSize: '1.5vw', color: '#4A5568', flex: 1 }}>17/07</span>
              <span style={{ fontSize: '1.5vw', color: '#0891B2', flex: 1, fontWeight: 600 }}>Exportada</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: '3vh', left: '5vw', right: '5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '2vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#A0AEC0' }}>Guia do Gestor / DECARGO Diárias</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#0A1628', fontWeight: 600 }}>11</div>
      </div>
    </div>
  );
}
