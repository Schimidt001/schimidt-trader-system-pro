# Guia de Integração - Engine de Predição Proprietária

Este documento explica como integrar a engine de predição proprietária do cliente com o Schimidt Trader System PRO.

## 📦 Arquivos Fornecidos pelo Cliente

Você deve ter recebido dois pacotes:

1. **Plataforma de Predição Proprietária**
   - Engine de predição pronta e funcional
   - Descoberta de fase e estratégia
   - Modelo `modelo_otimizado_v2.pkl`
   - Teste de ouro com candles reais M15

2. **Plataforma Coletora de Candles da DERIV**
   - Coleta atual utilizada pelo cliente

## 🔌 Integração da Engine

### Passo 1: Preparar a Engine

A engine de predição deve ser executada como um serviço separado que expõe uma API REST. O Schimidt Trader System PRO se conecta a ela via HTTP.

### Passo 2: Estrutura da API Requerida

A engine DEVE implementar exatamente esta interface (não modificar):

#### Endpoint de Predição

```
POST /predict
Content-Type: application/json
```

**Request Body:**
```json
{
  "symbol": "R_100",
  "tf": "M15",
  "history": [
    {
      "abertura": 1234.5678,
      "minima": 1230.1234,
      "maxima": 1240.9876,
      "fechamento": 1235.4321,
      "timestamp": 1234567890
    },
    // ... mais candles históricos (quantidade definida por lookback)
  ],
  "partial_current": {
    "timestamp_open": 1234568790,
    "elapsed_seconds": 480,
    "abertura": 1235.4321,
    "minima_parcial": 1232.5678,
    "maxima_parcial": 1238.1234
  }
}
```

**Response:**
```json
{
  "predicted_close": 1236.5432,
  "direction": "up",
  "phase": "accumulation",
  "strategy": "breakout",
  "confidence": 0.85
}
```

**Campos Obrigatórios:**

Request:
- `symbol` (string): Símbolo do ativo (ex: "R_100")
- `tf` (string): Timeframe, sempre "M15"
- `history` (array): Histórico de candles completos
  - `abertura` (number): Preço de abertura
  - `minima` (number): Preço mínimo
  - `maxima` (number): Preço máximo
  - `fechamento` (number): Preço de fechamento
  - `timestamp` (number): Unix timestamp em segundos
- `partial_current` (object): Candle atual em formação
  - `timestamp_open` (number): Timestamp de abertura do candle
  - `elapsed_seconds` (number): Segundos decorridos (480 = 8 minutos)
  - `abertura` (number): Preço de abertura
  - `minima_parcial` (number): Mínima até o momento
  - `maxima_parcial` (number): Máxima até o momento

Response:
- `predicted_close` (number): Preço de fechamento previsto
- `direction` (string): "up" ou "down"
- `phase` (string): Fase identificada
- `strategy` (string): Estratégia recomendada
- `confidence` (number): Nível de confiança (0-1)

#### Endpoint de Health Check

```
GET /health
```

**Response:**
```
Status: 200 OK
```

### Passo 3: Exemplo de Implementação (Python/Flask)

```python
from flask import Flask, request, jsonify
import pickle
import numpy as np

app = Flask(__name__)

# Carregar modelo
with open('modelo_otimizado_v2.pkl', 'rb') as f:
    model = pickle.load(f)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"}), 200

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        
        # Extrair dados
        symbol = data['symbol']
        tf = data['tf']
        history = data['history']
        partial = data['partial_current']
        
        # Processar dados para o modelo
        # (Sua lógica proprietária aqui)
        features = prepare_features(history, partial)
        
        # Fazer predição
        prediction = model.predict(features)
        
        # Extrair resultados
        predicted_close = float(prediction['close'])
        direction = "up" if prediction['direction'] > 0 else "down"
        phase = prediction['phase']
        strategy = prediction['strategy']
        confidence = float(prediction['confidence'])
        
        return jsonify({
            "predicted_close": predicted_close,
            "direction": direction,
            "phase": phase,
            "strategy": strategy,
            "confidence": confidence
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def prepare_features(history, partial):
    # Sua lógica de preparação de features
    # Esta função deve processar os dados conforme seu modelo espera
    pass

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

### Passo 4: Configurar URL da Engine

Por padrão, o sistema busca a engine em `http://localhost:5000`.

Para alterar, configure a variável de ambiente:

```bash
# No arquivo .env ou nas configurações do servidor
PREDICTION_ENGINE_URL=http://seu-servidor:porta
```

### Passo 5: Iniciar a Engine

```bash
# Exemplo para Python/Flask
python engine_server.py
```

A engine deve estar rodando ANTES de iniciar o bot no Schimidt Trader System PRO.

## 🧪 Teste de Validação

### Teste Manual com cURL

```bash
curl -X POST http://localhost:5000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "R_100",
    "tf": "M15",
    "history": [
      {
        "abertura": 1234.56,
        "minima": 1230.00,
        "maxima": 1240.00,
        "fechamento": 1235.00,
        "timestamp": 1234567890
      }
    ],
    "partial_current": {
      "timestamp_open": 1234567890,
      "elapsed_seconds": 480,
      "abertura": 1235.00,
      "minima_parcial": 1232.00,
      "maxima_parcial": 1238.00
    }
  }'
```

**Resposta Esperada:**
```json
{
  "predicted_close": 1236.50,
  "direction": "up",
  "phase": "accumulation",
  "strategy": "breakout",
  "confidence": 0.85
}
```

### Teste de Ouro

Use o teste de ouro fornecido pelo cliente com candles reais M15 para validar que a engine está retornando predições corretas.

## 🔍 Verificação no Sistema

Após iniciar a engine:

1. Acesse o Schimidt Trader System PRO
2. Vá para o Dashboard
3. O sistema verificará automaticamente a conexão com a engine
4. Verifique os logs para confirmar que as predições estão sendo recebidas

## ⚠️ Regras Importantes

### ❌ NÃO FAZER

- ❌ Modificar a interface da API de predição
- ❌ Alterar os nomes dos campos
- ❌ Mudar os tipos de dados
- ❌ Adicionar arredondamentos não autorizados
- ❌ Substituir a engine por outra lógica
- ❌ Usar dados que não sejam da DERIV

### ✅ FAZER

- ✅ Manter a interface exatamente como especificado
- ✅ Retornar todos os campos obrigatórios
- ✅ Validar dados de entrada
- ✅ Implementar tratamento de erros
- ✅ Adicionar logs para debug
- ✅ Testar com dados reais antes de operar

## 🐛 Troubleshooting

### Engine não conecta

1. Verifique se a engine está rodando: `curl http://localhost:5000/health`
2. Verifique a porta configurada
3. Verifique firewall/permissões
4. Veja os logs da engine para erros

### Predições com erro

1. Valide o formato do request
2. Verifique se o modelo está carregado corretamente
3. Confirme que todos os campos obrigatórios estão presentes
4. Verifique os tipos de dados (number vs string)

### Bot não faz predições

1. Verifique se o bot está no estado WAITING_MIDPOINT
2. Confirme que já passaram 8 minutos do candle
3. Veja os logs de eventos para mensagens de erro
4. Teste a engine manualmente com cURL

## 📊 Monitoramento

O sistema registra todos os eventos relacionados à predição nos logs:

- `PREDICTION_MADE`: Predição recebida com sucesso
- `ERROR`: Erro ao chamar a engine
- `ERROR_API`: Engine indisponível

Acesse a página **Logs** para monitorar em tempo real.

## 🔐 Segurança

- A engine deve rodar em rede privada/localhost
- Não exponha a engine publicamente sem autenticação
- Use HTTPS se a engine estiver em servidor remoto
- Mantenha o modelo `modelo_otimizado_v2.pkl` seguro

## 📞 Suporte

Para problemas com:
- **Interface da API**: Este documento é a especificação oficial
- **Modelo de predição**: Consulte a documentação proprietária
- **Integração**: Verifique os logs do sistema

---

**A engine de predição é proprietária e imutável. Não modifique sua lógica.**

