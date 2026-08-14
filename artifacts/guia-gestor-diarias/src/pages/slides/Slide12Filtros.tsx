export default function Slide12Filtros() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#FAFAFA', fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box', padding: '5vh 5vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6vh' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '-1vw', top: '1.5vh', width: '20vw', height: '2.5vh', backgroundColor: '#0A1628', opacity: 0.07, zIndex: 0 }} />
          <h2 style={{ fontSize: '3.5vw', fontWeight: 900, color: '#0A1628', margin: 0, lineHeight: 1, letterSpacing: '-0.03em', position: 'relative', zIndex: 1 }}>Filtrando os Registros</h2>
        </div>
        <div style={{ fontSize: '1.2vw', fontWeight: 800, color: '#0A1628', letterSpacing: '-0.02em' }}>DECARGO</div>
      </div>

      {/* Filter items as large cards */}
      <div style={{ display: 'flex', gap: '3vw', flex: 1 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3vh' }}>
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>01</div>
            <div>
              <div style={{ fontSize: '2.2vw', fontWeight: 700, color: '#0A1628', marginBottom: '0.5vh' }}>Data Inicial e Data Final</div>
              <p style={{ fontSize: '1.9vw', color: '#718096', lineHeight: 1.4, margin: 0 }}>Defina um intervalo de datas para busca</p>
            </div>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>02</div>
            <div>
              <div style={{ fontSize: '2.2vw', fontWeight: 700, color: '#0A1628', marginBottom: '0.5vh' }}>Status</div>
              <p style={{ fontSize: '1.9vw', color: '#718096', lineHeight: 1.4, margin: 0 }}>Filtre por um status específico (ex.: ver apenas pendentes)</p>
            </div>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>03</div>
            <div>
              <div style={{ fontSize: '2.2vw', fontWeight: 700, color: '#0A1628', marginBottom: '0.5vh' }}>Combinar filtros</div>
              <p style={{ fontSize: '1.9vw', color: '#718096', lineHeight: 1.4, margin: 0 }}>Combine filtros para encontrar registros específicos</p>
            </div>
          </div>
        </div>

        <div style={{ width: '30vw', display: 'flex', flexDirection: 'column', gap: '2.5vh' }}>
          <div style={{ display: 'flex', gap: '2vw', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#A0AEC0', fontWeight: 600, flexShrink: 0, width: '2.5vw' }}>04</div>
            <div>
              <div style={{ fontSize: '2.2vw', fontWeight: 700, color: '#0A1628', marginBottom: '0.5vh' }}>Limpar filtros</div>
              <p style={{ fontSize: '1.9vw', color: '#718096', lineHeight: 1.4, margin: 0 }}>Deixe os campos em branco para ver todos os registros</p>
            </div>
          </div>
          <div style={{ width: '100%', height: '1px', backgroundColor: '#E2E8F0' }} />
          <div style={{ backgroundColor: '#0A1628', padding: '3vh 2.5vw' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#718096', marginBottom: '1.5vh' }}>Como funcionam</div>
            <p style={{ fontSize: '1.9vw', fontWeight: 600, color: '#FFFFFF', margin: 0, lineHeight: 1.4 }}>Os filtros são aplicados em tempo real</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: '3vh', left: '5vw', right: '5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '2vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#A0AEC0' }}>Guia do Gestor / DECARGO Diárias</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#0A1628', fontWeight: 600 }}>12</div>
      </div>
    </div>
  );
}
