export default function Slide10Status() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#FAFAFA', fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box', padding: '5vh 5vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5vh' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '-1vw', top: '1.5vh', width: '19vw', height: '2.5vh', backgroundColor: '#0A1628', opacity: 0.07, zIndex: 0 }} />
          <h2 style={{ fontSize: '3.5vw', fontWeight: 900, color: '#0A1628', margin: 0, lineHeight: 1, letterSpacing: '-0.03em', position: 'relative', zIndex: 1 }}>Entendendo os Status</h2>
        </div>
        <div style={{ fontSize: '1.2vw', fontWeight: 800, color: '#0A1628', letterSpacing: '-0.02em' }}>DECARGO</div>
      </div>

      {/* Row 1: 4 status cards */}
      <div style={{ display: 'flex', gap: '1.5vw', marginBottom: '2vh' }}>
        <div style={{ flex: 1, borderTop: '3px solid #D97706', backgroundColor: '#FFFBEB', padding: '2.5vh 1.5vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#D97706', fontWeight: 600, marginBottom: '1vh' }}>PENDENTE</div>
          <div style={{ fontSize: '1.7vw', fontWeight: 700, color: '#0A1628', marginBottom: '0.8vh', lineHeight: 1.2 }}>Pendente de Aprovação</div>
          <div style={{ fontSize: '1.5vw', color: '#718096', lineHeight: 1.4 }}>Registrada, aguardando revisão do admin</div>
        </div>
        <div style={{ flex: 1, borderTop: '3px solid #3B82F6', backgroundColor: '#EFF6FF', padding: '2.5vh 1.5vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#3B82F6', fontWeight: 600, marginBottom: '1vh' }}>ANÁLISE</div>
          <div style={{ fontSize: '1.7vw', fontWeight: 700, color: '#0A1628', marginBottom: '0.8vh', lineHeight: 1.2 }}>Em Análise</div>
          <div style={{ fontSize: '1.5vw', color: '#718096', lineHeight: 1.4 }}>O admin está revisando</div>
        </div>
        <div style={{ flex: 1, borderTop: '3px solid #059669', backgroundColor: '#ECFDF5', padding: '2.5vh 1.5vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#059669', fontWeight: 600, marginBottom: '1vh' }}>APROVADA</div>
          <div style={{ fontSize: '1.7vw', fontWeight: 700, color: '#0A1628', marginBottom: '0.8vh', lineHeight: 1.2 }}>Aprovada / Disponível p/ Exportação</div>
          <div style={{ fontSize: '1.5vw', color: '#718096', lineHeight: 1.4 }}>Aprovada, será incluída na folha</div>
        </div>
        <div style={{ flex: 1, borderTop: '3px solid #0891B2', backgroundColor: '#ECFEFF', padding: '2.5vh 1.5vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#0891B2', fontWeight: 600, marginBottom: '1vh' }}>EXPORTADA</div>
          <div style={{ fontSize: '1.7vw', fontWeight: 700, color: '#0A1628', marginBottom: '0.8vh', lineHeight: 1.2 }}>Exportada</div>
          <div style={{ fontSize: '1.5vw', color: '#718096', lineHeight: 1.4 }}>Enviada ao sistema de pagamento</div>
        </div>
      </div>

      {/* Row 2: 3 status cards */}
      <div style={{ display: 'flex', gap: '1.5vw' }}>
        <div style={{ flex: 1, borderTop: '3px solid #065F46', backgroundColor: '#F0FDF4', padding: '2.5vh 1.5vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#065F46', fontWeight: 600, marginBottom: '1vh' }}>PAGA</div>
          <div style={{ fontSize: '1.7vw', fontWeight: 700, color: '#0A1628', marginBottom: '0.8vh', lineHeight: 1.2 }}>Paga</div>
          <div style={{ fontSize: '1.5vw', color: '#718096', lineHeight: 1.4 }}>Pagamento confirmado</div>
        </div>
        <div style={{ flex: 1, borderTop: '3px solid #EA580C', backgroundColor: '#FFF7ED', padding: '2.5vh 1.5vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#EA580C', fontWeight: 600, marginBottom: '1vh' }}>CORREÇÃO</div>
          <div style={{ fontSize: '1.7vw', fontWeight: 700, color: '#0A1628', marginBottom: '0.8vh', lineHeight: 1.2 }}>Solicitação de Correção</div>
          <div style={{ fontSize: '1.5vw', color: '#718096', lineHeight: 1.4 }}>Admin pediu ajuste</div>
        </div>
        <div style={{ flex: 1, borderTop: '3px solid #DC2626', backgroundColor: '#FEF2F2', padding: '2.5vh 1.5vw' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1vw', color: '#DC2626', fontWeight: 600, marginBottom: '1vh' }}>REJEITADA</div>
          <div style={{ fontSize: '1.7vw', fontWeight: 700, color: '#0A1628', marginBottom: '0.8vh', lineHeight: 1.2 }}>Rejeitada</div>
          <div style={{ fontSize: '1.5vw', color: '#718096', lineHeight: 1.4 }}>Não aprovada; um novo registro pode ser necessário</div>
        </div>
        <div style={{ flex: 1 }} />
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: '3vh', left: '5vw', right: '5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '2vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#A0AEC0' }}>Guia do Gestor / DECARGO Diárias</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#0A1628', fontWeight: 600 }}>10</div>
      </div>
    </div>
  );
}
