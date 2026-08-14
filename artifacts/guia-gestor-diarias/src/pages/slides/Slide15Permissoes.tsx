export default function Slide15Permissoes() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#FAFAFA', fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box', padding: '5vh 5vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5vh' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '-1vw', top: '1.5vh', width: '24vw', height: '2.5vh', backgroundColor: '#0A1628', opacity: 0.07, zIndex: 0 }} />
          <h2 style={{ fontSize: '3.5vw', fontWeight: 900, color: '#0A1628', margin: 0, lineHeight: 1, letterSpacing: '-0.03em', position: 'relative', zIndex: 1 }}>O Que o Gestor Pode Fazer</h2>
        </div>
        <div style={{ fontSize: '1.2vw', fontWeight: 800, color: '#0A1628', letterSpacing: '-0.02em' }}>DECARGO</div>
      </div>

      {/* Two columns */}
      <div style={{ display: 'flex', gap: '3vw', flex: 1 }}>
        {/* Left: Permitted */}
        <div style={{ flex: 3, backgroundColor: '#ECFDF5', padding: '3.5vh 3vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.1vw', color: '#059669', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3vh' }}>Permitido</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2vh' }}>
            <div style={{ display: 'flex', gap: '1.5vw', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '1.8vw', color: '#059669', fontWeight: 700, flexShrink: 0 }}>+</div>
              <p style={{ fontSize: '1.9vw', color: '#065F46', lineHeight: 1.35, margin: 0 }}>Registrar novas diárias para prestadores da sua equipe</p>
            </div>
            <div style={{ display: 'flex', gap: '1.5vw', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '1.8vw', color: '#059669', fontWeight: 700, flexShrink: 0 }}>+</div>
              <p style={{ fontSize: '1.9vw', color: '#065F46', lineHeight: 1.35, margin: 0 }}>Registrar múltiplas diárias de uma vez (lote)</p>
            </div>
            <div style={{ display: 'flex', gap: '1.5vw', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '1.8vw', color: '#059669', fontWeight: 700, flexShrink: 0 }}>+</div>
              <p style={{ fontSize: '1.9vw', color: '#065F46', lineHeight: 1.35, margin: 0 }}>Cancelar diárias antes da aprovação</p>
            </div>
            <div style={{ display: 'flex', gap: '1.5vw', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '1.8vw', color: '#059669', fontWeight: 700, flexShrink: 0 }}>+</div>
              <p style={{ fontSize: '1.9vw', color: '#065F46', lineHeight: 1.35, margin: 0 }}>Editar horário e observações antes da aprovação</p>
            </div>
            <div style={{ display: 'flex', gap: '1.5vw', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '1.8vw', color: '#059669', fontWeight: 700, flexShrink: 0 }}>+</div>
              <p style={{ fontSize: '1.9vw', color: '#065F46', lineHeight: 1.35, margin: 0 }}>Consultar todas as diárias da equipe</p>
            </div>
            <div style={{ display: 'flex', gap: '1.5vw', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '1.8vw', color: '#059669', fontWeight: 700, flexShrink: 0 }}>+</div>
              <p style={{ fontSize: '1.9vw', color: '#065F46', lineHeight: 1.35, margin: 0 }}>Filtrar registros por data e status</p>
            </div>
          </div>
        </div>

        {/* Right: Not permitted */}
        <div style={{ flex: 2, backgroundColor: '#0A1628', padding: '3.5vh 3vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.1vw', color: '#718096', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3vh' }}>Não Permitido</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3vh' }}>
            <div style={{ display: 'flex', gap: '1.5vw', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '1.8vw', color: '#FC8181', fontWeight: 700, flexShrink: 0 }}>—</div>
              <p style={{ fontSize: '1.9vw', color: '#A0AEC0', lineHeight: 1.35, margin: 0 }}>Aprovar, rejeitar ou exportar diárias</p>
            </div>
            <div style={{ display: 'flex', gap: '1.5vw', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '1.8vw', color: '#FC8181', fontWeight: 700, flexShrink: 0 }}>—</div>
              <p style={{ fontSize: '1.9vw', color: '#A0AEC0', lineHeight: 1.35, margin: 0 }}>Acessar valores financeiros das diárias</p>
            </div>
          </div>
          <div style={{ marginTop: 'auto', paddingTop: '6vh' }}>
            <div style={{ width: '100%', height: '1px', backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: '2vh' }} />
            <p style={{ fontSize: '1.6vw', color: '#718096', lineHeight: 1.4, margin: 0 }}>
              Ações exclusivas do administrador por razões de controle e auditoria.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: '3vh', left: '5vw', right: '5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '2vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#A0AEC0' }}>Guia do Gestor / DECARGO Diárias</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#0A1628', fontWeight: 600 }}>15</div>
      </div>
    </div>
  );
}
