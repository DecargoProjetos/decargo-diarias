export default function Slide09AposRegistro() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#FAFAFA', fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box', padding: '5vh 5vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5vh' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '-1vw', top: '1.5vh', width: '28vw', height: '2.5vh', backgroundColor: '#0A1628', opacity: 0.07, zIndex: 0 }} />
          <h2 style={{ fontSize: '3.5vw', fontWeight: 900, color: '#0A1628', margin: 0, lineHeight: 1, letterSpacing: '-0.03em', position: 'relative', zIndex: 1 }}>O que Acontece após o Registro?</h2>
        </div>
        <div style={{ fontSize: '1.2vw', fontWeight: 800, color: '#0A1628', letterSpacing: '-0.02em' }}>DECARGO</div>
      </div>

      {/* Flow diagram */}
      <div style={{ display: 'flex', gap: '1.5vw', alignItems: 'stretch', marginBottom: '4vh' }}>
        {/* Step 1 */}
        <div style={{ flex: 1, backgroundColor: '#0A1628', padding: '3vh 2vw', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2vw', color: '#718096', marginBottom: '1.5vh' }}>01</div>
          <div style={{ fontSize: '1.8vw', fontWeight: 700, color: '#FFFFFF', marginBottom: '1vh', lineHeight: 1.2 }}>Registro criado</div>
          <div style={{ fontSize: '1.5vw', color: '#A0AEC0', lineHeight: 1.4 }}>Status: Pendente de Aprovação</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: '#CBD5E0', fontSize: '2.5vw', fontWeight: 300 }}>&#8594;</div>
        {/* Step 2 */}
        <div style={{ flex: 1, border: '1.5px solid #0A1628', padding: '3vh 2vw', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2vw', color: '#A0AEC0', marginBottom: '1.5vh' }}>02</div>
          <div style={{ fontSize: '1.8vw', fontWeight: 700, color: '#0A1628', marginBottom: '1vh', lineHeight: 1.2 }}>Admin revisa</div>
          <div style={{ fontSize: '1.5vw', color: '#718096', lineHeight: 1.4 }}>O administrador recebe a diária para revisão</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: '#CBD5E0', fontSize: '2.5vw', fontWeight: 300 }}>&#8594;</div>
        {/* Step 3 */}
        <div style={{ flex: 1, border: '1.5px solid #059669', padding: '3vh 2vw', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2vw', color: '#A0AEC0', marginBottom: '1.5vh' }}>03a</div>
          <div style={{ fontSize: '1.8vw', fontWeight: 700, color: '#059669', marginBottom: '1vh', lineHeight: 1.2 }}>Aprovada</div>
          <div style={{ fontSize: '1.5vw', color: '#718096', lineHeight: 1.4 }}>Entra na fila de exportação para a folha</div>
        </div>
      </div>

      {/* Exception row */}
      <div style={{ display: 'flex', gap: '3vw', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, backgroundColor: '#FFF5F5', borderLeft: '3px solid #FC8181', padding: '2.5vh 2vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2vw', color: '#A0AEC0', marginBottom: '0.8vh' }}>03b — Se houver problemas</div>
          <p style={{ fontSize: '1.8vw', color: '#4A5568', margin: 0, lineHeight: 1.4 }}>O admin pode solicitar correção ou rejeitar a diária</p>
        </div>
        <div style={{ flex: 1, backgroundColor: '#F7FAFC', border: '1px solid #E2E8F0', padding: '2.5vh 2vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2vw', color: '#A0AEC0', marginBottom: '0.8vh' }}>Acompanhamento</div>
          <p style={{ fontSize: '1.8vw', color: '#4A5568', margin: 0, lineHeight: 1.4 }}>Você acompanha tudo pela tela Diárias da Equipe</p>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: '3vh', left: '5vw', right: '5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '2vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#A0AEC0' }}>Guia do Gestor / DECARGO Diárias</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#0A1628', fontWeight: 600 }}>09</div>
      </div>
    </div>
  );
}
