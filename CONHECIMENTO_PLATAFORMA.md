# Conhecimento Completo da Plataforma - Schimidt Trader System PRO

**Data**: 05 de Novembro de 2025
**Propósito**: Documentação de referência para implementação segura de melhorias

---

## 1. ARQUITETURA GERAL

### Stack Tecnológico
- **Frontend**: React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + tRPC Client
- **Backend**: Node.js 22 + Express 4 + tRPC 11 + Drizzle ORM
- **Database**: MySQL/TiDB
- **Prediction Engine**: Python 3.11 + Flask + scikit-learn
- **Trading API**: DERIV WebSocket API

### Estrutura de Diretórios
```
├── client/src/
│   ├── pages/Settings.tsx          # Página de configurações (MODIFICAR)
│   ├── components/ui/              # Componentes shadcn/ui
│   └── lib/trpc.ts                 # Cliente tRPC
├── server/
│   ├── deriv/tradingBot.ts         # Bot principal (NÃO MODIFICAR)
│   ├── ai/hedgeStrategy.ts         # Lógica IA Hedge (NÃO MODIFICAR)
│   ├── ai/hedgeConfigSchema.ts     # Validação Zod (NÃO MODIFICAR)
│   ├── routers.ts                  # Rotas tRPC (NÃO MODIFICAR)
│   └── db.ts                       # Funções do banco
└── drizzle/schema.ts               # Schema do banco (NÃO MODIFICAR)
```

---

## 2. IA HEDGE - FUNCIONAMENTO

### 3 Estratégias Matemáticas

#### Estratégia 1: Detecção de Reversão
- **Objetivo**: Abrir hedge quando preço vai contra predição
- **Gatilho**: Preço > 60% do range na direção oposta
- **Ação**: Abre posição oposta (CALL→PUT ou PUT→CALL)

#### Estratégia 2: Reforço em Pullback
- **Objetivo**: Reforçar posição quando movimento correto mas lento
- **Gatilho**: Progresso entre 15% e 40% do esperado
- **Ação**: Abre segunda posição na mesma direção

#### Estratégia 3: Reversão de Ponta
- **Objetivo**: Apostar em reversão quando preço esticou demais
- **Gatilho**: Preço > 80% do range na direção prevista
- **Ação**: Abre posição oposta (exaustão)

### 13 Parâmetros da HedgeConfig

```typescript
interface HedgeConfig {
  enabled: boolean;
  
  // Estratégia 1: Detecção de Reversão
  reversalDetectionMinute: number;      // 8.0 - 14.0 (padrão: 12.0)
  reversalThreshold: number;            // 0.30 - 0.95 (padrão: 0.60)
  reversalStakeMultiplier: number;      // 0.1 - 2.0 (padrão: 1.5)
  
  // Estratégia 2: Reforço em Pullback
  pullbackDetectionStart: number;       // 8.0 - 13.0 (padrão: 12.0)
  pullbackDetectionEnd: number;         // 10.0 - 14.0 (padrão: 14.0)
  pullbackMinProgress: number;          // 0.05 - 0.50 (padrão: 0.15)
  pullbackMaxProgress: number;          // 0.20 - 0.80 (padrão: 0.40)
  pullbackStakeMultiplier: number;      // 0.1 - 1.5 (padrão: 1.4)
  
  // Estratégia 3: Reversão de Ponta
  edgeReversalMinute: number;           // 12.0 - 14.5 (padrão: 12.0)
  edgeExtensionThreshold: number;       // 0.60 - 0.95 (padrão: 0.80)
  edgeStakeMultiplier: number;          // 0.1 - 1.5 (padrão: 1.5)
  
  // Janela geral
  analysisStartMinute: number;          // 8.0 - 13.0 (padrão: 12.0)
  analysisEndMinute: number;            // 12.0 - 14.0 (padrão: 14.0)
}
```

---

## 3. VALIDAÇÃO E SEGURANÇA

### Camada 1: Schema Zod (hedgeConfigSchema.ts)
- Define limites min/max para cada parâmetro
- Rejeita valores fora do range seguro
- Exemplo: `reversalDetectionMinute: z.number().min(8.0).max(14.0).default(12.0)`

### Camada 2: Refinements (hedgeConfigSchema.ts:81-101)
- Valida lógica entre campos
- Exemplo: `pullbackDetectionStart < pullbackDetectionEnd`

### Camada 3: Fallback Seguro (validateHedgeConfig)
```typescript
export function validateHedgeConfig(config: unknown): HedgeConfigValidated {
  try {
    return hedgeConfigSchema.parse(config);
  } catch (error) {
    console.warn("[HEDGE_CONFIG] Configuração inválida, usando padrões:", error);
    return DEFAULT_HEDGE_CONFIG;
  }
}
```

**IMPORTANTE**: É IMPOSSÍVEL quebrar o sistema com valores inválidos!

---

## 4. FLUXO DE DADOS

### Frontend → Backend → Database → Bot

1. **Frontend (Settings.tsx)**:
   - Usuário edita 13 campos
   - Clica em "Salvar Configurações"
   - Serializa para JSON: `JSON.stringify(hedgeConfigObj)`
   - Envia via tRPC: `config.update({ hedgeConfig: jsonString })`

2. **Backend (routers.ts:80)**:
   - Recebe `hedgeConfig: z.string().optional()`
   - Salva no banco de dados (campo `hedgeConfig` da tabela `config`)

3. **Database (drizzle/schema.ts:40)**:
   - Campo: `hedgeConfig: text` (JSON string)

4. **Bot (tradingBot.ts:122-133)**:
   - Carrega no `start()`: `config.hedgeConfig`
   - Parseia JSON: `JSON.parse(config.hedgeConfig)`
   - Valida: `validateHedgeConfig(parsedConfig)`
   - Usa na análise: `analyzePositionForHedge(params, this.hedgeConfig)`

---

## 5. VALORES PADRÃO (DEFAULT_HEDGE_CONFIG)

```typescript
{
  enabled: true,
  reversalDetectionMinute: 12.0,
  reversalThreshold: 0.60,
  reversalStakeMultiplier: 1.5,
  pullbackDetectionStart: 12.0,
  pullbackDetectionEnd: 14.0,
  pullbackMinProgress: 0.15,
  pullbackMaxProgress: 0.40,
  pullbackStakeMultiplier: 1.4,
  edgeReversalMinute: 12.0,
  edgeExtensionThreshold: 0.80,
  edgeStakeMultiplier: 1.5,
  analysisStartMinute: 12.0,
  analysisEndMinute: 14.0,
}
```

---

## 6. ESTADO ATUAL DO FRONTEND

### Settings.tsx (linha 43, 94, 212, 489-502)

**Atual**:
```typescript
const [hedgeEnabled, setHedgeEnabled] = useState(true);

// Salvamento
updateConfig.mutate({
  // ... outros campos
  hedgeEnabled,
});
```

**Faltando**:
- Estados para os 13 parâmetros
- Inputs para os 13 parâmetros
- Serialização JSON no salvamento
- Botão "Restaurar Padrões"

---

## 7. IMPLEMENTAÇÃO NECESSÁRIA

### Passo 1: Adicionar Estados (Settings.tsx)
```typescript
// Estratégia 1
const [reversalDetectionMinute, setReversalDetectionMinute] = useState("12.0");
const [reversalThreshold, setReversalThreshold] = useState("0.60");
const [reversalStakeMultiplier, setReversalStakeMultiplier] = useState("1.5");

// Estratégia 2
const [pullbackDetectionStart, setPullbackDetectionStart] = useState("12.0");
const [pullbackDetectionEnd, setPullbackDetectionEnd] = useState("14.0");
const [pullbackMinProgress, setPullbackMinProgress] = useState("0.15");
const [pullbackMaxProgress, setPullbackMaxProgress] = useState("0.40");
const [pullbackStakeMultiplier, setPullbackStakeMultiplier] = useState("1.4");

// Estratégia 3
const [edgeReversalMinute, setEdgeReversalMinute] = useState("12.0");
const [edgeExtensionThreshold, setEdgeExtensionThreshold] = useState("0.80");
const [edgeStakeMultiplier, setEdgeStakeMultiplier] = useState("1.5");

// Janela geral
const [analysisStartMinute, setAnalysisStartMinute] = useState("12.0");
const [analysisEndMinute, setAnalysisEndMinute] = useState("14.0");
```

### Passo 2: Carregar do Backend (useEffect)
```typescript
useEffect(() => {
  if (config) {
    // ... campos existentes
    setHedgeEnabled(config.hedgeEnabled ?? true);
    
    // Parsear hedgeConfig se existir
    if (config.hedgeConfig) {
      try {
        const parsed = JSON.parse(config.hedgeConfig);
        setReversalDetectionMinute((parsed.reversalDetectionMinute ?? 12.0).toString());
        setReversalThreshold((parsed.reversalThreshold ?? 0.60).toString());
        // ... outros 11 campos
      } catch (error) {
        console.error("Erro ao parsear hedgeConfig:", error);
      }
    }
  }
}, [config]);
```

### Passo 3: Serializar no Salvamento (handleSave)
```typescript
const handleSave = () => {
  // ... validações existentes
  
  // Construir objeto hedgeConfig
  const hedgeConfigObj = {
    enabled: hedgeEnabled,
    reversalDetectionMinute: parseFloat(reversalDetectionMinute),
    reversalThreshold: parseFloat(reversalThreshold),
    reversalStakeMultiplier: parseFloat(reversalStakeMultiplier),
    pullbackDetectionStart: parseFloat(pullbackDetectionStart),
    pullbackDetectionEnd: parseFloat(pullbackDetectionEnd),
    pullbackMinProgress: parseFloat(pullbackMinProgress),
    pullbackMaxProgress: parseFloat(pullbackMaxProgress),
    pullbackStakeMultiplier: parseFloat(pullbackStakeMultiplier),
    edgeReversalMinute: parseFloat(edgeReversalMinute),
    edgeExtensionThreshold: parseFloat(edgeExtensionThreshold),
    edgeStakeMultiplier: parseFloat(edgeStakeMultiplier),
    analysisStartMinute: parseFloat(analysisStartMinute),
    analysisEndMinute: parseFloat(analysisEndMinute),
  };
  
  setIsSaving(true);
  updateConfig.mutate({
    // ... campos existentes
    hedgeEnabled,
    hedgeConfig: JSON.stringify(hedgeConfigObj),
  });
};
```

### Passo 4: UI com Accordion
```tsx
<Card className="bg-slate-900/50 border-slate-800">
  <CardHeader>
    <CardTitle className="text-white">IA Hedge Inteligente</CardTitle>
    <CardDescription className="text-slate-400">
      Configure as estratégias de proteção e reforço de posições
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Toggle principal */}
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label htmlFor="hedgeEnabled" className="text-slate-300">
          Ativar IA Hedge
        </Label>
        <p className="text-sm text-slate-500">
          Habilita proteção inteligente de posições
        </p>
      </div>
      <Switch
        id="hedgeEnabled"
        checked={hedgeEnabled}
        onCheckedChange={setHedgeEnabled}
      />
    </div>

    {/* Accordion para configurações avançadas */}
    {hedgeEnabled && (
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="advanced">
          <AccordionTrigger className="text-slate-300">
            ⚙️ Configurações Avançadas
          </AccordionTrigger>
          <AccordionContent className="space-y-6 pt-4">
            {/* Estratégia 1: Detecção de Reversão */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-200">
                Estratégia 1: Detecção de Reversão
              </h4>
              <p className="text-xs text-slate-400">
                Abre hedge quando preço se move contra a predição
              </p>
              
              {/* 3 campos da estratégia 1 */}
            </div>

            {/* Estratégia 2: Reforço em Pullback */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-200">
                Estratégia 2: Reforço em Pullback
              </h4>
              <p className="text-xs text-slate-400">
                Reforça posição quando movimento correto mas lento
              </p>
              
              {/* 5 campos da estratégia 2 */}
            </div>

            {/* Estratégia 3: Reversão de Ponta */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-200">
                Estratégia 3: Reversão de Ponta
              </h4>
              <p className="text-xs text-slate-400">
                Aposta em reversão quando preço esticou demais
              </p>
              
              {/* 3 campos da estratégia 3 */}
            </div>

            {/* Janela Geral */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-200">
                Janela de Análise
              </h4>
              
              {/* 2 campos da janela */}
            </div>

            {/* Botão Restaurar Padrões */}
            <Button
              variant="outline"
              onClick={handleRestoreDefaults}
              className="w-full"
            >
              Restaurar Padrões
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    )}
  </CardContent>
</Card>
```

---

## 8. CHECKLIST DE SEGURANÇA

### ✅ Antes de Modificar
- [ ] Ler este documento completo
- [ ] Entender fluxo de dados (Frontend → Backend → DB → Bot)
- [ ] Revisar validação Zod (hedgeConfigSchema.ts)
- [ ] Confirmar que backend NÃO precisa de mudanças

### ✅ Durante Modificação
- [ ] Modificar APENAS Settings.tsx
- [ ] NÃO modificar routers.ts, tradingBot.ts, hedgeStrategy.ts
- [ ] Usar mesmos nomes de campos do HedgeConfig
- [ ] Validar inputs no frontend (opcional, Zod já valida)

### ✅ Após Modificação
- [ ] Testar salvamento no banco de dados
- [ ] Verificar que JSON é válido
- [ ] Testar carregamento dos valores salvos
- [ ] Testar botão "Restaurar Padrões"
- [ ] Verificar que bot carrega configuração corretamente

---

## 9. RISCOS E MITIGAÇÕES

### ❌ Risco: Quebrar código existente
**Mitigação**: Modificar APENAS Settings.tsx, não tocar em backend

### ❌ Risco: Valores inválidos no banco
**Mitigação**: Zod valida automaticamente, fallback para defaults

### ❌ Risco: JSON malformado
**Mitigação**: `try...catch` no parsing, fallback para defaults

### ❌ Risco: UI confusa
**Mitigação**: Usar Accordion (esconde complexidade), tooltips explicativos

---

## 10. COMPONENTES SHADCN/UI DISPONÍVEIS

- ✅ `Accordion` (já instalado)
- ✅ `AccordionItem` (já instalado)
- ✅ `AccordionTrigger` (já instalado)
- ✅ `AccordionContent` (já instalado)
- ✅ `Input` (já instalado)
- ✅ `Label` (já instalado)
- ✅ `Button` (já instalado)
- ✅ `Switch` (já instalado)
- ✅ `Card` (já instalado)

**Importar de**: `@/components/ui/accordion`, `@/components/ui/input`, etc.

---

## 11. BANCO DE DADOS

### Conexão
```
mysql://root:qsnVGqprIkPodnxuERpjaHteHVziMuJV@gondola.proxy.rlwy.net:25153/railway
```

### Tabela: `config`
```sql
CREATE TABLE config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  -- ... outros campos
  hedgeEnabled BOOLEAN DEFAULT TRUE NOT NULL,
  hedgeConfig TEXT,  -- JSON string com 13 parâmetros
  -- ...
);
```

### Query para Verificar
```sql
SELECT hedgeEnabled, hedgeConfig FROM config WHERE userId = 1;
```

---

## 12. REFERÊNCIAS RÁPIDAS

### Arquivo Principal a Modificar
- `client/src/pages/Settings.tsx` (linhas 1-528)

### Arquivos de Referência (NÃO MODIFICAR)
- `server/ai/hedgeConfigSchema.ts` (schema Zod + defaults)
- `server/ai/hedgeStrategy.ts` (lógica das 3 estratégias)
- `server/deriv/tradingBot.ts` (uso da IA Hedge)
- `server/routers.ts` (rota config.update)

### Documentos de Análise
- `/home/ubuntu/analise_plataforma_schimidt_trader.md`
- `/home/ubuntu/viabilidade_hedge_config.md`
- `/home/ubuntu/analise_intermediaria.md`

---

**FIM DO DOCUMENTO DE CONHECIMENTO**
