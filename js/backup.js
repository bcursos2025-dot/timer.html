/* ============================================================
   BACKUP DOS DADOS DO SITE (Configurações → Meus dados).
   Exporta/importa só o que é DADO DE ESTUDO. Fica de fora, de propósito:
   - licença/vitalício (não pode ser concedida por arquivo),
   - pareamento com a extensão e sessão do cronômetro em andamento,
   - o token do GitHub (pdfviewer:github-sync): segredo, nunca vai para arquivo.
   ============================================================ */
(function(){
  'use strict';
  const CHAVES = ['cb2_historico', 'cb2_config', 'cb2_questoes_estado', 'cb2_questoes_log', 'cb2_perfil', 'cb2_prova_oab',
    'cb2_grifos', 'cb2_desempenho', 'cb2_lei_atual', 'cb_tema'];
  const $ = id => document.getElementById(id);

  function dados(){
    const out = {};
    CHAVES.forEach(k => {
      const v = localStorage.getItem(k);
      if (v == null) return;
      try { out[k] = JSON.parse(v); } catch (e) { out[k] = v; }   // cb_tema e cb2_lei_atual são texto simples
    });
    return out;
  }

  function exportar(){
    const corpo = { app: 'concurseiro-blindado', versao: 1, exportado_em: new Date().toISOString(), dados: dados() };
    const blob = new Blob([JSON.stringify(corpo, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'backup-concurseiro-blindado-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    aviso('Backup baixado. Guarde o arquivo em um lugar seguro.');
  }

  function aviso(msg){ const e = $('bkAviso'); if (e) e.textContent = msg; }

  function importar(arq){
    const rd = new FileReader();
    rd.onload = () => {
      let corpo;
      try { corpo = JSON.parse(rd.result); } catch (e) { return aviso('Esse arquivo não é um backup válido.'); }
      if (!corpo || corpo.app !== 'concurseiro-blindado' || !corpo.dados || typeof corpo.dados !== 'object') return aviso('Esse arquivo não é um backup do Concurseiro Blindado.');
      const chaves = Object.keys(corpo.dados).filter(k => CHAVES.includes(k));
      if (!chaves.length) return aviso('O backup não tem dados reconhecidos.');
      if (!confirm('Restaurar este backup vai SUBSTITUIR os dados atuais de: ' + chaves.length + ' item(ns) deste aparelho. Continuar?')) return;
      try {
        chaves.forEach(k => {
          const v = corpo.dados[k];
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        });
      } catch (e) { return aviso('Não consegui gravar (armazenamento cheio ou bloqueado).'); }
      aviso('Backup restaurado. Recarregando…');
      setTimeout(() => location.reload(), 700);
    };
    rd.readAsText(arq);
  }

  const bExp = $('bkExportar'), bImp = $('bkImportar');
  if (bExp) bExp.addEventListener('click', exportar);
  if (bImp) bImp.addEventListener('change', e => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ''; });
})();
