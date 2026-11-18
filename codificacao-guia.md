Forneça apenas as alterações necessárias com total clareza para que eu possa alterar.

Desenvolvendo também com o GPT

Meow Plans codificação

OK - cama agora é objeto fixo

OK - adicionado um baú como móvel no lugar da cama na loja

OK - Objetos reposicionados para trás no cenário

- Atualização do visual dos pets, dos itens e do cenário

- Melhorar animações dos pets

- carinho deve funcionar se tocar apenas no pet

- Deixar o pet dormindo, mesmo após fechar a página do pet ou mudar de aba, ou fechar o app. (Só acorda quando o usuário o acordar)

ATUALIZAR NO CÓDIGO O ÚLTIMO PROMPT GPT





### CONTEXTO E OBJETIVO (Parte 1 de 3)
Abaixo está o código atual do meu minigame de pet virtual em Pixel Art. Vamos dividir a melhoria em 3 etapas para manter a máxima qualidade.

Nesta **Parte 1**, foque exclusivamente no **upgrade visual do cenário, do pet e na adição da cama e do pote de comida**.

### REQUISITOS DA PARTE 1
1. **Cenário Detalhado (Quarto em Pixel Art):**
   - Enriqueça o fundo com profundidade e detalhes (piso de madeira ou tapete pixelado, rodapé, janela com paisagem/nuvens, quadro na parede e sombra suave sob os elementos).
2. **Upgrade Visual do Pet:**
   - Deixe o sprite/desenho do pet mais detalhado e expressivo (contornos definidos, sombreado em pixel art, detalhes nas orelhas/olhos/cauda).
3. **Novos Objetos no Cenário (Cama e Pote de Comida):**
   - Desenhe em pixel art uma **Cama/Caminha** e um **Pote de Comida** em posições fixas e harmônicas no cenário (garantindo que o pote tenha estado vazio e cheio).

### REGRAS
- Mantenha toda a estrutura de integração com o PocketBase, moedas e status intacta.
- Não omita trechos do código existente (`// ...`). Entregue o código completo desta etapa.

---
[COLE SEU CÓDIGO ATUAL AQUI ABAIXO]


### CONTEXTO E OBJETIVO (Parte 2 de 3)
Com o novo visual do cenário, do pet, da cama e do pote prontos, vamos agora para a **Parte 2**: refinar as animações e corrigir a hitbox de interação.

### REQUISITOS DA PARTE 2
1. **Caminhada Autônoma e Espelhamento:**
   - Suavize a movimentação aleatória do pet pelo cenário.
   - Garanta que o sprite espelhe horizontalmente (`scaleX(-1)`) conforme a direção em que está andando e alterne entre animação parado (*idle*) e andando (*walk*).
2. **Sequência de Comer e Dormir:**
   - **Ao acionar Alimentar:** o pet deve caminhar até o **pote de comida**, exibir a comida no pote e fazer a animação de comer (abaixar a cabeça + partículas de migalhas/corações).
   - **Ao acionar Dormir:** o pet deve caminhar até a **cama**, deitar-se sobre ela e fazer a animação de sono (olhos fechados + partículas `"Zzz"` flutuando e leve escurecimento do quarto).
3. **Correção do Bug de Clique (Hitbox do Pet):**
   - Corrija o problema atual onde clicar em qualquer canto da tela ativa o carinho.
   - O carinho (animação de felicidade + corações subindo) deve ser disparado **exclusivamente quando o usuário clicar dentro da área exata (hitbox) do pet**, mudando o cursor para `pointer` apenas sobre ele.

### REGRAS
- Entregue o código completo atualizado sem omitir partes anteriores.

### CONTEXTO E OBJETIVO (Parte 3 de 3)
Para finalizar, vamos para a **Parte 3**: o upgrade visual completo da **Lojinha de Itens** e dos **ícones** em pixel art.

### REQUISITOS DA PARTE 3
1. **Interface da Lojinha em Pixel Art:**
   - Estilize os cards/slots dos itens da loja com bordas retrô 8-bit/16-bit, destaque visual ao passar o mouse (`hover`), badges de preço bem legíveis e feedback claro para itens já comprados/equipados.
2. **Redesenho dos Ícones dos Itens:**
   - Substitua formas simples ou emojis genéricos por **ícones detalhados em pixel art** (via SVG pixelado, Canvas ou CSS box-shadow pixel art) para cada item da loja, tornando cada comida, brinquedo ou acessório visualmente rico e reconhecível.

### REGRAS
- Mantenha a lógica de compra, desconto de moedas e salvamento no PocketBase funcionando perfeitamente.
- Entregue o código completo final pronto para uso.


