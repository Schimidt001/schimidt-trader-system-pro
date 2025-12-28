# cTrader Open API - Notas de Implementação

## Endpoints de Conexão

### WebSocket
- **Demo**: `wss://demo.ctraderapi.com:5035`
- **Live**: `wss://live.ctraderapi.com:5035`

### TCP/SSL
- **Demo Host**: `demo.ctraderapi.com`
- **Demo Port**: `5035`
- **Live Host**: `live.ctraderapi.com`
- **Live Port**: `5035`

## Protocolo de Mensagens

### Formato TCP
1. Serializar mensagem Protobuf para bytes
2. Obter comprimento do array (4 bytes, big-endian/reversed)
3. Concatenar: [length_bytes][message_bytes]
4. Enviar pelo stream SSL

### Formato WebSocket
1. Serializar mensagem Protobuf para bytes
2. Enviar bytes diretamente pelo WebSocket

## Fluxo de Autenticação

1. **ProtoOAApplicationAuthReq** - Autenticar aplicação (clientId + clientSecret)
2. **ProtoOAAccountAuthReq** - Autenticar conta (accessToken + accountId)
3. Após autenticação, pode subscrever a preços e executar ordens

## Mensagens Principais

- `ProtoOAApplicationAuthReq` - Autenticação da aplicação
- `ProtoOAAccountAuthReq` - Autenticação da conta
- `ProtoOASubscribeSpotsReq` - Subscrever ticks de preço
- `ProtoOAUnsubscribeSpotsReq` - Cancelar subscrição
- `ProtoOAGetTrendbarsReq` - Obter candles históricos
- `ProtoOANewOrderReq` - Criar nova ordem
- `ProtoOAClosePositionReq` - Fechar posição
- `ProtoOAAmendPositionSLTPReq` - Modificar SL/TP

## Rate Limits

- 50 requests/segundo para dados não-históricos
- 5 requests/segundo para dados históricos

## Repositório Proto Files

https://github.com/spotware/openapi-proto-messages
