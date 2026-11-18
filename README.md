<p align="center">
  <img src="frontend/assets/logo.svg" alt="Feira Virtual — Venda direta" width="380" />
</p>

# Feira Virtual — Plataforma de Venda Direta

Plataforma web completa (**Django + Django REST Framework + Frontend Modular**) voltada à **agricultura familiar**, **economia local** e **sustentabilidade**, conectando diretamente produtores rurais, entregadores parceiros e consumidores sem atravessadores.

---

## Objetivos do Projeto

- Viabilizar a venda direta de produtos frescos da agricultura familiar.
- Garantir transparência nos preços, controle transacional de estoque e rastreabilidade do status dos pedidos.
- Oferecer painéis específicos para **Clientes**, **Produtores Rurais**, **Entregadores** e **Administradores**.
- Manter flexibilidade de execução tanto local (SQLite) quanto em produção/contêineres (MySQL 8.4 + Docker).

---

## Principais Funcionalidades

- **Catálogo Público Dinâmico:** busca por nome/produtor, filtro por categoria, tipo de cultivo (`ORGANICO_CERTIFICADO`, `AGROECOLOGICO`, `CONVENCIONAL`), produtor e ordenação, com paginação e avaliações médias.
- **Vitrine de Produtores Parceiros:** listagem pública de propriedades aprovadas (`GET /api/produtores/`) com formas de pagamento aceitas e filtro direto de produtos.
- **Autenticação Segura:** JWT via cookies `HttpOnly` e `SameSite` com proteção CSRF (`X-CSRFToken`) para o navegador, além de compatibilidade com `Authorization: Bearer` para clientes de API/Swagger; rotação e blacklist de refresh tokens, e recuperação/redefinição de senha.
- **Carrinho e Checkout Multi-Produtor:** validação de estoque, compatibilidade de formas de pagamento (Pix, Cartão na maquininha e Dinheiro) e divisão automática em pedidos independentes por produtor.
- **Gestão Transacional de Pedidos e Estoque:** uso de `transaction.atomic` e `select_for_update()` ordenado para evitar inconsistências em compras simultâneas e entregas disputadas; estorno automático de estoque em cancelamentos/recusas.
- **Painéis por Perfil:**
  - **Cliente:** pedidos, histórico de status, cancelamento, endereços, avaliações e reclamações.
  - **Produtor:** CRUD de produtos (com upload de imagem), controle de pedidos (aceitar, recusar, preparo, pronto, retirada), faturamento e dados da propriedade.
  - **Entregador:** entregas disponíveis, aceite atômico, saída para entrega, confirmação de entrega e perfil de veículo.
  - **Administrador:** indicadores da feira, aprovação/suspensão de produtores, moderação de produtos, categorias, bloqueio/reativação de usuários e resposta a reclamações.

---

## Tecnologias Utilizadas

- **Backend:** Python 3.12+, Django, Django REST Framework, SimpleJWT (`token_blacklist`), `django-filter`, `drf-spectacular`, `django-cors-headers`, `WhiteNoise`, `Pillow`, `PyMySQL`, `Gunicorn`.
- **Banco de Dados:** SQLite (desenvolvimento local) ou MySQL 8.4 (produção / Docker).
- **Frontend:** HTML5 semântico, CSS3 com design tokens (temas claro e escuro), JavaScript ES Modules (`frontend/js/`).

---

## Organização dos Diretórios

```text
Feira-Virtual/
├── avaliacoes/          # Avaliações de produtos/produtores e reclamações
├── catalogo/            # Categorias e catálogo de produtos (público e produtor)
├── config/              # Settings, URLs, WSGI e hook PyMySQL
├── frontend/            # Interface web servida na raiz (/)
│   ├── assets/          # Logos vetorizadas (SVG/PNG) e favicon
│   ├── css/             # Design system e estilos responsivos (style.css)
│   ├── js/              # Módulos ES (api, auth, catalogo, carrinho, checkout, painéis)
│   └── index.html
├── painel/              # Serviços, indicadores e endpoints administrativos + healthcheck
├── pedidos/             # Carrinho, checkout, serviços transacionais e entregas
├── usuarios/            # Usuários, perfis, permissões, autenticação cookie/JWT e endereços
├── .env.example         # Modelo de variáveis de ambiente (valores fictícios)
├── Dockerfile
├── docker-compose.yml
├── entrypoint.sh
├── manage.py
└── requirements.txt
```

---

## Pré-requisitos

- Python 3.12+ (ou gerenciador `uv` / `venv`)
- Opcional para banco MySQL ou contêineres: MySQL 8.4 ou Docker + Docker Compose

---

## Configuração Local (Sem Docker)

### 1. Ambiente virtual e dependências

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

*(Caso utilize `uv`: `uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt`.)*

### 2. Variáveis de ambiente (`.env`)

Copie o arquivo de exemplo e ajuste conforme seu ambiente:

```bash
cp .env.example .env
```

Principais variáveis:
- `DB_ENGINE`: `sqlite` (padrão local) ou `mysql`
- `DJANGO_DEBUG`: `1` (desenvolvimento) ou `0` (produção — exige `DJANGO_SECRET_KEY` forte)
- `DJANGO_SECRET_KEY`: chave secreta exclusiva em produção
- `DJANGO_ALLOWED_HOSTS`: hosts permitidos separados por vírgula
- `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS`: origens permitidas

### 3. Banco de dados e migrações

Para rodar localmente com **SQLite**, basta aplicar as migrações:

```bash
python manage.py migrate
```

Para usar **MySQL 8.4** local, crie o banco com `utf8mb4`, configure `DB_ENGINE=mysql`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` no `.env` e execute `python manage.py migrate`.

### 4. Criar administrador (opcional) e iniciar o servidor

```bash
python manage.py createsuperuser
python manage.py runserver
```

Acesse:
- **Aplicação Web (Frontend):** http://127.0.0.1:8000/
- **Documentação Swagger (OpenAPI):** http://127.0.0.1:8000/api/docs/
- **Admin Django:** http://127.0.0.1:8000/admin/

---

## Inicialização com Docker (MySQL 8.4 + Gunicorn)

1. Copie `.env.example` para `.env` e preencha obrigatoriamente `DJANGO_SECRET_KEY`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` e `DB_ENGINE=mysql`.
2. Suba os serviços:

```bash
docker compose up --build -d
```

O `entrypoint.sh` aguarda o MySQL 8.4 ficar saudável, executa `python manage.py check` e `python manage.py migrate --noinput`, e inicia o Gunicorn na porta `8000` com healthcheck em `/api/admin/health/`.

---

## Principais Endpoints da API

### Autenticação, Sessão e Perfis
- `GET /api/auth/csrf/` — Emite cookie CSRF para clientes web
- `POST /api/auth/login/` — Autentica (define cookies `HttpOnly` e/ou retorna tokens JWT)
- `POST /api/auth/refresh/` — Renova e rotaciona o token de sessão
- `POST /api/auth/logout/` — Invalida o refresh token (blacklist) e limpa cookies
- `POST /api/auth/registro/cliente/` | `produtor/` | `entregador/` — Cadastro por perfil
- `POST /api/auth/recuperar-senha/` e `POST /api/auth/redefinir-senha/`
- `GET/PATCH /api/perfil/` | `/api/perfil/produtor/` | `/api/perfil/entregador/`
- `GET /api/produtores/` — Vitrine pública de produtores aprovados
- `CRUD /api/enderecos/` — Endereços do usuário autenticado

### Catálogo, Carrinho, Pedidos e Entregas
- `GET/POST/PATCH/DELETE /api/categorias/` (escrita restrita a Admin)
- `GET /api/produtos/` e `GET /api/produtos/{id}/`
- `CRUD /api/produtor/produtos/`
- `GET/DELETE /api/carrinho/` e `POST/PATCH/DELETE /api/carrinho/itens/`
- `GET/POST /api/pedidos/` e `POST /api/pedidos/{id}/cancelar/`
- `GET /api/produtor/pedidos/`, `POST .../aceitar/`, `POST .../recusar/`, `POST .../status/`, `GET .../vendas/`
- `GET /api/entregas/?escopo=disponiveis|minhas`, `POST .../aceitar/`, `POST .../saiu-para-entrega/`, `POST .../confirmar/`

### Avaliações, Reclamações e Painel Admin
- `GET/POST /api/avaliacoes/`, `GET /api/produtor/avaliacoes/`
- `GET/POST /api/reclamacoes/`
- `GET /api/admin/health/` — Healthcheck de aplicação e banco
- `GET /api/admin/indicadores/`
- `/api/admin/usuarios/` (`bloquear/`, `reativar/`), `/api/admin/produtores/` (`aprovar/`, `suspender/`), `/api/admin/produtos/` (`ocultar/`, `reexibir/`), `/api/admin/pedidos/`, `/api/admin/reclamacoes/`

---

## Execução dos Testes e Verificações

```bash
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test -v 2
```
