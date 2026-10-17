# Instalador assistido do Concurseiro Blindado (Windows)
#
# O QUE ESTE SCRIPT FAZ (e só isso):
#   1. Pega o arquivo concurseiro-blindado.zip (da mesma pasta do script, ou baixa do site).
#   2. Confere o SHA-256 do ZIP contra o arquivo versao.json.
#   3. Extrai a extensão em  %LOCALAPPDATA%\ConcurseiroBlindado\extensao
#   4. Copia esse caminho para a área de transferência e abre a página de extensões
#      do seu navegador, para você carregar a pasta (passo manual, 3 cliques).
#
# O QUE ELE NÃO FAZ: não pede administrador, não altera o registro do Windows,
# não muda configurações nem políticas do navegador, não cria tarefas agendadas
# e não deixa nada rodando em segundo plano.
#
# Parâmetros:  -BaseUrl <url>  de onde baixar (padrão: o site)
#              -Teste          não faz perguntas nem abre o navegador
#              -Remover        apaga a pasta da extensão (depois remova o cartão no navegador)
#
# Para ATUALIZAR: rode o instalador de novo. Ele troca os arquivos da pasta e você só
# clica no botão de recarregar (seta circular) no cartão da extensão.

param(
    [string]$BaseUrl = 'https://bcursos2025-dot.github.io/timer.html/extensao',
    [switch]$Teste,
    [switch]$Remover
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$Aqui    = Split-Path -Parent $MyInvocation.MyCommand.Path
$Base    = Join-Path $env:LOCALAPPDATA 'ConcurseiroBlindado'
$Destino = Join-Path $Base 'extensao'
$Marca   = Join-Path $Base 'instalado.txt'
$NomeZip = 'concurseiro-blindado.zip'

function Titulo($t) { Write-Host ''; Write-Host $t -ForegroundColor Cyan }
function Pausa($m)  { if (-not $Teste) { Read-Host $m | Out-Null } }

try {
    if ($Remover) {
        Titulo '=== Concurseiro Blindado: remoção ==='
        if ((Test-Path $Base) -and (Test-Path $Marca)) {
            Remove-Item $Base -Recurse -Force
            Write-Host "Pasta removida: $Base" -ForegroundColor Green
        } else {
            Write-Host 'Nada para remover: o instalador não encontrou a pasta dele.'
        }
        Write-Host 'Agora, na página de extensões do navegador, clique em "Remover" no cartão do Concurseiro Blindado.'
        Pausa 'Pressione Enter para fechar'
        return
    }

    Titulo '=== Concurseiro Blindado: instalação assistida ==='
    Write-Host 'Vou colocar a extensão em:'
    Write-Host "  $Destino"
    Write-Host 'e abrir a página de extensões do seu navegador. Nada é instalado sem você.'
    Pausa 'Pressione Enter para começar (ou feche esta janela para cancelar)'

    # --- 1. obter o ZIP e o versao.json ---
    Titulo '1/4  Obtendo os arquivos'
    $zip  = Join-Path $Aqui $NomeZip
    $info = Join-Path $Aqui 'versao.json'
    if ((Test-Path $zip) -and (Test-Path $info)) {
        Write-Host 'Usando os arquivos que estão na mesma pasta do script.'
    } else {
        $tmp = Join-Path $env:TEMP 'cb-instalador'
        New-Item -ItemType Directory -Force $tmp | Out-Null
        $zip  = Join-Path $tmp $NomeZip
        $info = Join-Path $tmp 'versao.json'
        Write-Host "Baixando de $BaseUrl ..."
        Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/versao.json" -OutFile $info
        Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/$NomeZip"    -OutFile $zip
    }
    $dados = Get-Content $info -Raw -Encoding UTF8 | ConvertFrom-Json

    # --- 2. conferir integridade ---
    Titulo '2/4  Conferindo o arquivo (SHA-256)'
    $hash = (Get-FileHash $zip -Algorithm SHA256).Hash
    Write-Host "  esperado: $($dados.sha256)"
    Write-Host "  obtido:   $hash"
    if ($hash -ne $dados.sha256.ToUpper()) {
        throw 'O arquivo não confere com o esperado (download incompleto ou alterado). Nada foi instalado.'
    }
    Write-Host 'Confere.' -ForegroundColor Green

    # --- 3. extrair ---
    Titulo "3/4  Extraindo a versão $($dados.version)"
    $eraAtualizacao = (Test-Path $Marca) -and (Test-Path (Join-Path $Destino 'manifest.json'))
    if ($eraAtualizacao) { Write-Host "Atualizando a instalação anterior ($((Get-Content $Marca -Raw).Trim()))." }
    if (Test-Path $Destino) {
        if (-not (Test-Path $Marca)) {
            throw "A pasta $Destino já existe e não foi criada por este instalador. Apague ou renomeie e rode de novo."
        }
        Remove-Item $Destino -Recurse -Force
    }
    New-Item -ItemType Directory -Force $Base | Out-Null
    Expand-Archive -LiteralPath $zip -DestinationPath $Destino -Force
    Set-Content -Path $Marca -Value $dados.version -Encoding UTF8
    if (-not (Test-Path (Join-Path $Destino 'manifest.json'))) { throw 'Extração incompleta: manifest.json não encontrado.' }
    Write-Host "Pronto: $Destino" -ForegroundColor Green
    try { Set-Clipboard -Value $Destino } catch {}

    # --- 4. abrir o navegador ---
    Titulo '4/4  Carregar no navegador'
    $L = $env:LOCALAPPDATA; $P = $env:ProgramFiles; $P86 = ${env:ProgramFiles(x86)}
    $navegadores = @(
        @{ Nome = 'Opera';         Url = 'opera://extensions';  Exe = @("$L\Programs\Opera\opera.exe", "$P\Opera\opera.exe", "$P86\Opera\opera.exe") },
        @{ Nome = 'Opera GX';      Url = 'opera://extensions';  Exe = @("$L\Programs\Opera GX\opera.exe", "$P\Opera GX\opera.exe") },
        @{ Nome = 'Google Chrome'; Url = 'chrome://extensions'; Exe = @("$P\Google\Chrome\Application\chrome.exe", "$P86\Google\Chrome\Application\chrome.exe", "$L\Google\Chrome\Application\chrome.exe") },
        @{ Nome = 'Microsoft Edge';Url = 'edge://extensions';   Exe = @("$P86\Microsoft\Edge\Application\msedge.exe", "$P\Microsoft\Edge\Application\msedge.exe") },
        @{ Nome = 'Brave';         Url = 'brave://extensions';  Exe = @("$P\BraveSoftware\Brave-Browser\Application\brave.exe", "$L\BraveSoftware\Brave-Browser\Application\brave.exe") }
    )
    $achados = @()
    foreach ($n in $navegadores) {
        $exe = $n.Exe | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
        if ($exe) { $achados += [pscustomobject]@{ Nome = $n.Nome; Url = $n.Url; Exe = $exe } }
    }

    Write-Host ''
    if ($eraAtualizacao) {
        Write-Host 'Os arquivos foram trocados. Falta só um clique:' -ForegroundColor Yellow
        Write-Host '  Na página de extensões, clique no botão de recarregar (seta circular)'
        Write-Host '  no cartão do Concurseiro Blindado. Não precisa carregar a pasta de novo.'
    } else {
        Write-Host 'O navegador exige que estes passos sejam feitos por você (a pasta já está copiada, é só colar):' -ForegroundColor Yellow
        Write-Host '  1) Na página de extensões, ligue o "Modo do desenvolvedor".'
        Write-Host '  2) Clique em "Carregar sem pacote" (no Opera: "Carregar descompactada").'
        Write-Host '  3) Na janela que abrir, clique na barra de endereço, cole com Ctrl+V,'
        Write-Host '     tecle Enter e clique em "Selecionar pasta".'
        Write-Host '  4) Fixe o ícone da extensão na barra (ícone de peça de quebra-cabeça).'
    }
    Write-Host ''
    Write-Host "Caminho da pasta: $Destino"

    if ($Teste) { Write-Host '(modo teste: navegador não aberto)'; return }

    if ($achados.Count -eq 0) {
        Write-Host 'Não encontrei um navegador compatível. Abra o seu manualmente, vá na página de extensões e siga os passos acima.'
    } else {
        $escolha = $achados[0]
        if ($achados.Count -gt 1) {
            Write-Host ''
            Write-Host 'Navegadores encontrados:'
            for ($i = 0; $i -lt $achados.Count; $i++) { Write-Host "  [$($i + 1)] $($achados[$i].Nome)" }
            $r = Read-Host 'Digite o número do navegador que você usa (Enter = 1)'
            $idx = 0
            if ([int]::TryParse($r, [ref]$idx) -and $idx -ge 1 -and $idx -le $achados.Count) { $escolha = $achados[$idx - 1] }
        }
        Write-Host "Abrindo $($escolha.Nome) em $($escolha.Url) ..."
        Start-Process -FilePath $escolha.Exe -ArgumentList $escolha.Url
    }
    Pausa 'Quando terminar, pressione Enter para fechar'
}
catch {
    Write-Host ''
    Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Nada foi alterado no seu navegador. Se precisar, use o passo a passo manual na página do site.'
    if (-not $Teste) { Read-Host 'Pressione Enter para fechar' | Out-Null }
    exit 1
}
