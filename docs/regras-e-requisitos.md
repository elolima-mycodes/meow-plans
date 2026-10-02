###                                      **Meow Plans**

### **Requisitos Funcionais (RF)**

#### **RF01 – Autenticação e Perfil**

* **RF01.1:** O sistema deve permitir cadastro de usuário com E-mail e Senha.  
* **RF01.2:** O sistema deve permitir autenticação (Login/Logout) segura.

#### **RF02 – Gestão de Tarefas**

* **RF02.1:** O sistema deve permitir criar, editar, visualizar e excluir tarefas.  
* **RF02.2:** Cada tarefa deve conter: Título, Descrição (opcional), Categoria, Data de Entrega, Data de Execução, Repetição (Sim/Não e Frequência), Nível de Urgência (Baixa, Normal, Alta, Urgente) e Status (A Fazer, Fazendo, Concluída, Atrasada, Cancelada).  
* **RF02.3:** O sistema deve permitir marcar uma tarefa como concluída, aplicando estilo visual acinzentado e permitindo a reabertura do status a qualquer momento.  
* **RF02.4:** O sistema deve marcar automaticamente como **"Atrasada"** qualquer tarefa cuja Data de Execução tenha passado sem ser concluída, exigindo remanejamento manual.

* #### **RF02.5:** O sistema deve permitir ações pontuais sobre uma ocorrência de rotina sem afetar a regra geral da repetição:

  * **Adiar Ocorrência:** Permite que o usuário defina uma nova Data de Execução para aquela ocorrência específica, mantendo as demais datas da série inalteradas.  
  * **Cancelar no Dia:** Marca aquela ocorrência específica como "Cancelada", ocultando o card daquele dia sem apagar o histórico futuro da rotina.

#### **RF03 – Gestão de Subtarefas**

* **RF03.1:** O sistema deve permitir a inclusão de checklists (subtarefas) dentro de cada tarefa.  
* **RF03.2:** A alteração da Data de Execução da tarefa pai deve mover automaticamente todas as suas subtarefas filhas.

#### **RF04 – Categorias e Personalização**

* **RF04.1:** O sistema deve permitir o gerenciamento (CRUD) de Categorias personalizadas.  
* **RF04.2:** As categorias devem ser compostas por Nome e Cor identificadora (selecionado a partir de uma biblioteca pré-definida no app).

#### **RF05 – Visualizações e Calendário (UX/UI)**

* **RF05.1:** O sistema deve prover visualizações em calendário por Mês, Semana e Dia.  
* **RF05.2:** Em todas as visões, a interface deve separar o layout dos dias em 3 seções distintas: *"Para Entregar Hoje"*, *"Para Fazer Hoje"* e *"Rotineiros"*.  
* **RF05.3:** Os cards exibidos nas visualizações de calendário funcionam como projeções dos dados da tarefa:  
  * Cards de **Data de Execução ("Para Fazer")** são interativos e permitem alteração rápida de data via *Drag-and-Drop*.  
  * Cards de **Data de Entrega ("Deadline")** e **"Rotineiros"** são estáticos (bloqueados para arrasto). A interação com eles exige a abertura do menu de contexto da tarefa/rotina para ações de edição, adiamento ou cancelamento pontual.  
* **RF05.4:** Clicar em um dia deve abrir um modal/popover permitindo ações rápidas (marcar como feita).

#### **RF06 – Lixeira e Restauração**

* **RF06.1:** A exclusão de uma tarefa deve realizar um *Soft Delete* (exclusão lógica), movendo-a para uma Lixeira.  
* **RF06.2:** O usuário deve poder restaurar ou excluir permanentemente tarefas da Lixeira.

#### **RF07 – Busca, Filtros e Relatórios**

* **RF07.1:** O sistema deve disponibilizar busca por texto e filtros combinados (por Categoria, Urgência e Status).  
* **RF07.2:** O sistema deve permitir a exportação da lista de tarefas filtradas em arquivos no formato **PDF** e **CSV**.

### **Requisitos Não-Funcionais (RNF)**

* **RNF01 – Usabilidade e Responsividade (Mobile-First):** A interface deve ser projetada prioritariamente para dispositivos móveis e ser adaptável para Desktop.  
* **RNF02 – PWA (Progressive Web App):** O sistema deve conter arquivo de manifesto e Service Workers para permitir a instalação no celular como app nativo.  
* **RNF03 – Desempenho:** A ação de *drag-and-drop* e atualização no banco deve responder em menos de 1 segundo.  
* **RNF04 – Segurança:** Os dados de cada usuário devem ser isolados usando políticas de segurança a nível de linha (*Row Level Security \- RLS*).  
* **RNF05 – Suporte Offline e Sincronização (Disponibilidade):** A aplicação deve permitir a visualização e criação de tarefas mesmo sem conexão com a internet. Assim que a conexão for reestabelecida, os dados devem ser sincronizados automaticamente com o banco de dados sem perda de informações.


## **Regras de Negócio (RN)**

### **RN01 – Validação de Prazos (Execução vs. Entrega)**

* **Regra:** A Data de Execução de uma tarefa jamais poderá ser posterior à sua Data de Entrega.  
* **Tratamento:** Caso o usuário tente definir, arrastar ou editar a Data de Execução para um dia posterior à Data de Entrega, o sistema deve bloquear a ação, exibir um alerta na tela (ex: *"A data de execução não pode ser posterior ao prazo final"*) e reverter a alteração.

### **RN02 – Transição para Status "Atrasada"**

* **Regra:** A tarefa receberá o status **"Atrasada"** automaticamente quando:  
  1. A **Data de Execução** passar da data atual e o status ainda for "A Fazer" ou "Fazendo" (mesmo que a Data de Entrega ainda não tenha vencido).  
  2. Ambas as datas (**Data de Execução e Data de Entrega**) passarem sem que a tarefa tenha sido marcada como concluída.  
* **Comportamento:** Tarefas atrasadas exigem intervenção manual do usuário para reagendamento para saírem do estado de atraso.

### **RN03 – Restrição de Interatividade por Tipo de Card (Drag-and-Drop)**

* **Regra:** O recurso de *Drag-and-Drop* no calendário é exclusivo para **Data de Execução ("Para Fazer")**.  
* **Bloqueio:** Cards indicativos de *Data de Entrega* e *Rotinas* não podem ser arrastados no calendário. Qualquer alteração nessas categorias deve ser feita via menu de edição da tarefa.

### **RN04 – Truncamento de Subtarefas com a Tarefa Pai**

* **Regra:** As subtarefas (checklists) não possuem datas próprias; elas estão estritamente vinculadas à tarefa pai.  
* **Propagação:** Qualquer alteração na Data de Execução da tarefa pai atualiza automaticamente o dia de execução de todo o seu checklist interno.

### **RN05 – Exceções Pontuais em Tarefas Recorrentes (Rotinas)**

* **Regra:** Ações realizadas em um card de rotina em um dia específico não alteram a regra geral da repetição.  
* **Adiar Ocorrência:** Adiar uma rotina em um determinado dia move apenas aquela ocorrência específica para a nova data escolhida, mantendo os dias futuros da rotina inalterados.  
* **Cancelar no Dia:** Cancelar uma rotina em uma data específica oculta o card apenas naquele dia, mantendo o histórico e as ocorrências futuras.

### **RN06 – Ciclo de Vida e Lixeira (Soft Delete)**

* **Regra:** A exclusão de tarefas ou categorias nunca as apaga imediatamente do banco de dados.  
* **Comportamento:** Os registros recebem uma marcação de excluído e vão para a Lixeira, permitindo restauração. Tarefas associadas a uma categoria excluída mantêm seus dados, mas perdem a vinculação com a categoria até serem reatribuídas.