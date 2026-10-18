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
    'cb2_grifos', 'cb2_desempenho', 'cb2_lei_atual', 'cb_tema', 'cb2_iniciante', 'cb2_estudos_registro', 'cb2_ordem_abas'];
  const $ = id => document.getElementById(id);
  const LS_ULTIMO = 'cb2_backup_ultimo', LS_ADIAR = 'cb2_backup_adiar', LS_PRIMEIRO = 'cb2_primeiro_uso';
  const DIA = 86400000, PRAZO_DIAS = 30, ADIAR_DIAS = 7;

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
    a.download = 'backup-norma-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { localStorage.setItem(LS_ULTIMO, String(Date.now())); localStorage.removeItem(LS_ADIAR); } catch (e) { /* ok */ }
    aviso('Backup baixado. Guarde o arquivo em um lugar seguro.');
    lembrete();
  }

  function aviso(msg){ const e = $('bkAviso'); if (e) e.textContent = msg; }

  function importar(arq){
    const rd = new FileReader();
    rd.onload = () => {
      let corpo;
      try { corpo = JSON.parse(rd.result); } catch (e) { return aviso('Esse arquivo não é um backup válido.'); }
      if (!corpo || corpo.app !== 'concurseiro-blindado' || !corpo.dados || typeof corpo.dados !== 'object') return aviso('Esse arquivo não é um backup da Norma.');
      const chaves = Object.keys(corpo.dados).filter(k => CHAVES.includes(k));
      if (!chaves.length) return aviso('O backup não tem dados reconhecidos.');
      if (!confirm('Restaurar este backup vai SUBSTITUIR os dados atuais de: ' + chaves.length + ' item(ns) deste aparelho. Continuar?')) return;
      try {
        chaves.forEach(k => {
          const v = corpo.dados[k];
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        });
      } catch (e) { return aviso('Não consegui gravar (armazenamento cheio ou bloqueado).'); }
      try { localStorage.setItem(LS_ULTIMO, String(Date.now())); } catch (e) { /* ok */ }
      aviso('Backup restaurado. Recarregando…');
      setTimeout(() => location.reload(), 700);
    };
    rd.readAsText(arq);
  }

  const bExp = $('bkExportar'), bImp = $('bkImportar');
  if (bExp) bExp.addEventListener('click', exportar);
  if (bImp) bImp.addEventListener('change', e => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ''; });

  /* ---- Lembrete de backup (tela Hoje) ----
     Sem conta e sem coleta de dados: os dados ficam só neste aparelho, então o
     único jeito de não perder o histórico é guardar o arquivo. A cada 30 dias
     sem backup aparece um aviso. Tudo é calculado aqui, no próprio navegador. */
  function num(k){ try { const v = Number(localStorage.getItem(k)); return isFinite(v) && v > 0 ? v : 0; } catch (e) { return 0; } }
  function temDados(){
    try {
      const h = JSON.parse(localStorage.getItem('cb2_historico') || '{}') || {};
      if (Object.values(h).some(ms => ms > 0)) return true;
    } catch (e) { /* sem histórico */ }
    return ['cb2_grifos', 'cb2_desempenho', 'cb2_questoes_estado'].some(k => { try { return (localStorage.getItem(k) || '').length > 4; } catch (e) { return false; } });
  }
  function lembrete(){
    const el = $('hojeBackup'); if (!el) return;
    if (!num(LS_PRIMEIRO)) { try { localStorage.setItem(LS_PRIMEIRO, String(Date.now())); } catch (e) { /* ok */ } }
    const agora = Date.now(), ultimo = num(LS_ULTIMO), base = ultimo || num(LS_PRIMEIRO) || agora;
    const dias = Math.floor((agora - base) / DIA);
    if (!temDados() || dias < PRAZO_DIAS || agora < num(LS_ADIAR)) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<h3>Backup dos seus dados</h3>' +
      '<p class="bk-lembrete-titulo">' + (ultimo ? 'Faz ' + dias + ' dias que você não baixa o backup.' : 'Você ainda não baixou nenhum backup.') + '</p>' +
      '<p class="bk-lembrete-txt">Para estudar não precisamos de conta nem coletamos informação pessoal: o seu histórico fica <b>só neste aparelho</b>. ' +
      'Baixe o arquivo e guarde num lugar seguro; assim você não perde nada se limpar o navegador ou trocar de computador.</p>' +
      '<div class="h-acoes" style="margin-top:14px"><button type="button" class="h-btn primario" id="bkLembreAgora">Baixar backup agora</button>' +
      '<button type="button" class="h-btn" id="bkLembreDepois">Lembrar daqui a ' + ADIAR_DIAS + ' dias</button></div>';
    $('bkLembreAgora').addEventListener('click', exportar);
    $('bkLembreDepois').addEventListener('click', () => { try { localStorage.setItem(LS_ADIAR, String(Date.now() + ADIAR_DIAS * DIA)); } catch (e) { /* ok */ } lembrete(); });
  }
  lembrete();
  setInterval(lembrete, 5 * 60000);
  document.querySelectorAll('.tab-btn[data-tab="hoje"]').forEach(b => b.addEventListener('click', () => setTimeout(lembrete, 0)));})();
