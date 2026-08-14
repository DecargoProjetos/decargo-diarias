export default function Slide17Resumo() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#0A1628', fontFamily: "'Inter', sans-serif", position: 'relative', boxSizing: 'border-box', padding: '5vh 5vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5vh' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '-1vw', top: '1.5vh', width: '22vw', height: '2.5vh', backgroundColor: '#FFFFFF', opacity: 0.08, zIndex: 0 }} />
          <h2 style={{ fontSize: '3.5vw', fontWeight: 900, color: '#FFFFFF', margin: 0, lineHeight: 1, letterSpacing: '-0.03em', position: 'relative', zIndex: 1 }}>Resumo — Fluxo Completo</h2>
        </div>
        <div style={{ fontSize: '1.2vw', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>DECARGO</div>
      </div>

      {/* Steps — 2 rows of 3 */}
      <div style={{ display: 'flex', gap: '2vw', marginBottom: '2.5vh' }}>
        <div style={{ flex: 1, borderTop: '2px solid rgba(255,255,255,0.2)', paddingTop: '2.5vh' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#718096', marginBottom: '1.5vh' }}>01</div>
          <div style={{ fontSize: '2vw', fontWeight: 700, color: '#FFFFFF', marginBottom: '0.8vh', lineHeight: 1.2 }}>Acesse o sistema</div>
          <div style={{ fontSize: '1.7vw', color: '#A0AEC0', lineHeight: 1.4 }}>Abra o calendário e localize o dia de trabalho</div>
        </div>
        <div style={{ flex: 1, borderTop: '2px solid rgba(255,255,255,0.2)', paddingTop: '2.5vh' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#718096', marginBottom: '1.5vh' }}>02</div>
          <div style={{ fontSize: '2vw', fontWeight: 700, color: '#FFFFFF', marginBottom: '0.8vh', lineHeight: 1.2 }}>Clique no dia</div>
          <div style={{ fontSize: '1.7vw', color: '#A0AEC0', lineHeight: 1.4 }}>Depois em + Nova Diária no painel lateral</div>
        </div>
        <div style={{ flex: 1, borderTop: '2px solid rgba(255,255,255,0.2)', paddingTop: '2.5vh' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#718096', marginBottom: '1.5vh' }}>03</div>
          <div style={{ fontSize: '2vw', fontWeight: 700, color: '#FFFFFF', marginBottom: '0.8vh', lineHeight: 1.2 }}>Preencha o formulário</div>
          <div style={{ fontSize: '1.7vw', color: '#A0AEC0', lineHeight: 1.4 }}>Prestador, Tipo e Horário</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2vw', marginBottom: '4vh' }}>
        <div style={{ flex: 1, borderTop: '2px solid rgba(255,255,255,0.2)', paddingTop: '2.5vh' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#718096', marginBottom: '1.5vh' }}>04</div>
          <div style={{ fontSize: '2vw', fontWeight: 700, color: '#FFFFFF', marginBottom: '0.8vh', lineHeight: 1.2 }}>Salve</div>
          <div style={{ fontSize: '1.7vw', color: '#A0AEC0', lineHeight: 1.4 }}>Status fica: Pendente de Aprovação</div>
        </div>
        <div style={{ flex: 1, borderTop: '2px solid rgba(255,255,255,0.2)', paddingTop: '2.5vh' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#718096', marginBottom: '1.5vh' }}>05</div>
          <div style={{ fontSize: '2vw', fontWeight: 700, color: '#FFFFFF', marginBottom: '0.8vh', lineHeight: 1.2 }}>Acompanhe</div>
          <div style={{ fontSize: '1.7vw', color: '#A0AEC0', lineHeight: 1.4 }}>Pela tela Diárias da Equipe</div>
        </div>
        <div style={{ flex: 1, borderTop: '2px solid rgba(255,255,255,0.2)', paddingTop: '2.5vh' }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.5vw', color: '#718096', marginBottom: '1.5vh' }}>06</div>
          <div style={{ fontSize: '2vw', fontWeight: 700, color: '#FFFFFF', marginBottom: '0.8vh', lineHeight: 1.2 }}>Admin aprova</div>
          <div style={{ fontSize: '1.7vw', color: '#A0AEC0', lineHeight: 1.4 }}>A diária segue para a folha de pagamento</div>
        </div>
      </div>

      {/* Footer note */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2.5vh', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.4vw', color: '#4A5568' }}>Em caso de dúvidas, contate o administrador do sistema</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#FFFFFF', fontWeight: 600 }}>17</div>
      </div>
    </div>
  );
}
