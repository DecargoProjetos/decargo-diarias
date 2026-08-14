export default function Slide07Passo2() {
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
      <div style={{ marginBottom: '4vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.4vw', color: '#A0AEC0', fontWeight: 500 }}>Passo 2: Preencher o Formulário</div>
      </div>

      {/* Form fields — 2-column grid */}
      <div style={{ display: 'flex', gap: '3vw', flex: 1 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2.2vh' }}>
          <div style={{ borderLeft: '3px solid #0A1628', paddingLeft: '1.5vw' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2vw', color: '#A0AEC0', marginBottom: '0.4vh' }}>Prestador</div>
            <p style={{ fontSize: '1.9vw', color: '#4A5568', margin: 0, lineHeight: 1.4 }}>Selecione o nome na lista (busca por nome)</p>
          </div>
          <div style={{ borderLeft: '3px solid #0A1628', paddingLeft: '1.5vw' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2vw', color: '#A0AEC0', marginBottom: '0.4vh' }}>Tipo de Diária</div>
            <p style={{ fontSize: '1.9vw', color: '#4A5568', margin: 0, lineHeight: 1.4 }}>Escolha o tipo definido pelo administrador (ex.: Diária Comum, Dobra)</p>
          </div>
          <div style={{ borderLeft: '3px solid #E2E8F0', paddingLeft: '1.5vw' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2vw', color: '#A0AEC0', marginBottom: '0.4vh' }}>Data</div>
            <p style={{ fontSize: '1.9vw', color: '#4A5568', margin: 0, lineHeight: 1.4 }}>Preenchida automaticamente com o dia selecionado</p>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2.2vh' }}>
          <div style={{ borderLeft: '3px solid #E2E8F0', paddingLeft: '1.5vw' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2vw', color: '#A0AEC0', marginBottom: '0.4vh' }}>Horário Inicial e Final</div>
            <p style={{ fontSize: '1.9vw', color: '#4A5568', margin: 0, lineHeight: 1.4 }}>Informe o turno trabalhado</p>
          </div>
          <div style={{ borderLeft: '3px solid #E2E8F0', paddingLeft: '1.5vw' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2vw', color: '#A0AEC0', marginBottom: '0.4vh' }}>Observações</div>
            <p style={{ fontSize: '1.9vw', color: '#4A5568', margin: 0, lineHeight: 1.4 }}>Campo livre para anotações relevantes</p>
          </div>
          {/* Save action */}
          <div style={{ backgroundColor: '#0A1628', padding: '2.5vh 2vw', marginTop: '1vh' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.2vw', color: '#718096', marginBottom: '0.8vh' }}>Ação final</div>
            <p style={{ fontSize: '2vw', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>Clique em Salvar para confirmar o registro</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: '3vh', left: '5vw', right: '5vw', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '2vh' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#A0AEC0' }}>Guia do Gestor / DECARGO Diárias</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.9vw', color: '#0A1628', fontWeight: 600 }}>07</div>
      </div>
    </div>
  );
}
