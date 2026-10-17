/* ============================================================
   PERFIL — "Estou estudando para OAB / Concurso".
   Guarda a escolha neste aparelho (LS.perfil), troca a cor de destaque
   (classe no <body>), os textos e a aba de Questões. Carrega depois de
   app.js e antes de hoje.js (que usa perfilAtual()).
   ============================================================ */
(function(){
  const $ = id => document.getElementById(id);

  const TEXTOS = {
    oab: {
      tituloProva: 'Sua prova da OAB',
      tituloPeca: 'Correção de peça por IA',
      textoPeca: 'Escreva a peça da 2ª fase e receba a nota por quesito, o que faltou e como melhorar, no padrão de correção da banca. Ainda estamos construindo esta parte.'
    },
    concurso: {
      tituloProva: 'Sua prova',
      tituloPeca: 'Correção de discursiva por IA',
      textoPeca: 'Escreva sua resposta discursiva e receba uma correção com o que faltou e como melhorar. Ainda estamos construindo esta parte.'
    }
  };
  const EM_BREVE_OAB = 'O banco de questões da OAB está sendo preparado. Enquanto isso, os cartões de CPC e Juizados Especiais da aba Concurso também ajudam na OAB.';
  const emBreve = $('qEmBreve') ? $('qEmBreve').querySelector('p') : null;
  const EM_BREVE_PADRAO = emBreve ? emBreve.textContent : '';

  window.perfilAtual = function(){
    const p = lerJSON(LS.perfil, null);
    return p && (p.tipo === 'oab' || p.tipo === 'concurso') ? p.tipo : null;
  };

  function atualizarEmBreve(){
    if (!emBreve) return;
    const ativo = document.querySelector('.q-tab.ativo');
    emBreve.textContent = (ativo && ativo.dataset.exame === 'oab') ? EM_BREVE_OAB : EM_BREVE_PADRAO;
  }

  function aplicarTextos(){
    const t = TEXTOS[perfilAtual() || 'oab'];
    $('hojeTituloProva').textContent = t.tituloProva;
    $('hojeTituloPeca').textContent = t.tituloPeca;
    $('hojeTextoPeca').textContent = t.textoPeca;
  }

  function aplicar(selecionarAbaQuestoes){
    const tipo = perfilAtual();
    document.body.classList.toggle('perfil-oab', tipo === 'oab');
    document.body.classList.toggle('perfil-concurso', tipo === 'concurso');
    document.querySelectorAll('.perfil-op').forEach(b => b.classList.toggle('ativo', b.dataset.perfil === tipo));
    aplicarTextos();
    if (tipo && selecionarAbaQuestoes) {
      const aba = document.querySelector('.q-tab[data-exame="' + tipo + '"]');
      if (aba) aba.click();
    }
    atualizarEmBreve();
  }

  function mostrarEscolha(){
    const ov = $('perfilOverlay');
    ov.hidden = false;
    const primeiro = ov.querySelector('.perfil-escolha');
    if (primeiro) primeiro.focus();
  }

  window.definirPerfil = function(tipo){
    if (tipo !== 'oab' && tipo !== 'concurso') return;
    salvarJSON(LS.perfil, { tipo });
    $('perfilOverlay').hidden = true;
    aplicar(true);
    document.dispatchEvent(new CustomEvent('perfil-mudou', { detail: { tipo } }));
  };

  document.querySelectorAll('.perfil-escolha, .perfil-op').forEach(b => {
    b.addEventListener('click', () => definirPerfil(b.dataset.perfil));
  });
  document.querySelectorAll('.q-tab').forEach(b => b.addEventListener('click', atualizarEmBreve));

  aplicar(true);
  if (!perfilAtual()) mostrarEscolha();
})();
