## **Documento de Casos de Uso (UC)**

Este documento foca na interação entre o **Ator (Você)** e o **Sistema**.

### **UC01: Planejamento de Tarefa Sem Data**

* **Ator:** Usuário.  
* **Pré-condição:** Estar logado e ter tarefas na "Gaveta Lateral".  
* **Fluxo Principal:**  
  1. O usuário visualiza a lista de tarefas sem data na lateral do calendário.  
  2. O usuário arrasta uma tarefa para um dia específico no calendário.  
  3. O sistema detecta o soltar (drop), identifica a nova data e envia uma requisição para a API.  
  4. O banco de dados atualiza o campo `data_fazer` da tarefa.  
  5. O calendário exibe a tarefa no novo local com a cor da sua categoria.

### **UC02: Gestão de Categorias e Cores**

* **Ator:** Usuário.  
* **Fluxo Principal:**  
  1. O usuário acessa a aba "Tipos".  
  2. O usuário insere um nome (ex: "Trabalho") e seleciona uma cor em um seletor.  
  3. O usuário salva a categoria.  
  4. Ao criar uma nova tarefa, a categoria "Trabalho" aparece como opção e aplica automaticamente a cor escolhida no calendário.

### **UC03: Conclusão de Tarefa com Subtarefas**

* **Ator:** Usuário.  
* **Fluxo Principal:**  
  1. O usuário clica em uma tarefa no calendário para abrir os detalhes.  
  2. O sistema abre um modal com a descrição e o checklist de subtarefas.  
  3. O usuário marca todas as subtarefas como feitas.  
  4. O usuário marca a tarefa principal como concluída.  
  5. O sistema atualiza o visual da tarefa no calendário para o modo "semitransparente".

**UC04: Reagendamento de Tarefa via Calendário**

* **Ator:** Usuário.  
* **Interação:** Interface Gráfica (Calendário).  
* **Fluxo Principal:**  
  1. O usuário identifica uma tarefa agendada para a "Segunda-feira".  
  2. Por falta de tempo, o usuário clica e arrasta essa tarefa para a "Quarta-feira".  
  3. O componente FullCalendar captura o evento `eventDrop`.  
  4. O sistema envia uma requisição `POST` para `api/tarefas.php` contendo o `id_tarefa` e a `nova_data`.  
  5. O backend valida se a tarefa pertence ao usuário logado e atualiza o registro.  
  6. Uma notificação discreta (Toast ou alerta visual) confirma que a alteração foi salva com sucesso.

**UC05: Notificação Visual de Urgência**

* **Ator:** Sistema (Automático).  
* **Fluxo Principal:**  
  1. O usuário acessa o Calendário ou a Gestão de Tarefas.  
  2. O sistema realiza o cálculo: `Data_Entrega - Data_Atual`.  
  3. O sistema cruza esse resultado com o nível de `Prioridade`.  
  4. Se o limite de segurança for atingido e a tarefa estiver pendente, o sistema renderiza a tarefa com um efeito visual de "Urgência".  
  5. O usuário visualiza o alerta e utiliza o **RF11** para arrastar a execução para o dia de hoje, priorizando-a.

