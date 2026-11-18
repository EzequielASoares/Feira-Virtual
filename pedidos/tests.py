from decimal import Decimal
import threading
import time

from django.db import OperationalError, close_old_connections, connection
from django.test import TransactionTestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from catalogo.models import Categoria, Produto
from pedidos import services
from pedidos.models import ItemPedido, Pedido
from usuarios.models import PerfilProdutor, Usuario

PW = "Senha-Forte-123"


class FluxoCompletoTest(APITestCase):
    def registrar(self, tipo, username, **extra):
        r = self.client.post(f"/api/auth/registro/{tipo}/", {
            "username": username, "email": f"{username}@ex.com", "password": PW,
            "first_name": username.title(), **extra}, format="json")
        self.assertEqual(r.status_code, 201, r.data)

    def login(self, username):
        r = self.client.post("/api/auth/login/", {"username": username, "password": PW}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        return r.data

    def setUp(self):
        Usuario.objects.create_superuser("admin", "admin@ex.com", PW)
        self.registrar("produtor", "maria", nome_propriedade="Sítio Esperança", chave_pix="maria@pix",
                       possui_maquininha=False)
        self.registrar("cliente", "joao")
        self.registrar("entregador", "zeca", veiculo="Moto")
        self.cat = Categoria.objects.create(nome="Hortaliças")

    def test_fluxo(self):
        # produtor cadastra produto (ainda pendente de aprovação → invisível no catálogo)
        self.login("maria")
        r = self.client.post("/api/produtor/produtos/", {
            "nome": "Alface", "preco": "3.50", "unidade_medida": "MACO", "estoque": "10",
            "tipo_producao": "AGROECOLOGICO", "categoria": self.cat.id}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        pid = r.data["id"]
        self.client.credentials()
        self.assertEqual(self.client.get("/api/produtos/").data["count"], 0)

        # admin aprova → aparece no catálogo, com busca e filtro
        self.login("admin")
        prod_id = self.client.get("/api/admin/produtores/").data["results"][0]["id"]
        self.assertEqual(self.client.post(f"/api/admin/produtores/{prod_id}/aprovar/").status_code, 200)
        self.client.credentials()
        self.assertEqual(self.client.get("/api/produtos/?search=alf").data["count"], 1)
        self.assertEqual(self.client.get("/api/produtos/?tipo_producao=CONVENCIONAL").data["count"], 0)

        # cliente: carrinho
        self.login("joao")
        r = self.client.post("/api/carrinho/itens/", {"produto": pid, "quantidade": "11"}, format="json")
        self.assertEqual(r.status_code, 400)  # acima do estoque
        r = self.client.post("/api/carrinho/itens/", {"produto": pid, "quantidade": "4"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        item = r.data["id"]
        self.client.patch(f"/api/carrinho/itens/{item}/", {"quantidade": "5"}, format="json")
        self.assertEqual(Decimal(self.client.get("/api/carrinho/").data["total"]), Decimal("17.50"))

        # checkout: sem endereço falha; cartão não aceito; pix ok
        base = {"modalidade": "ENTREGA", "forma_pagamento": "PIX"}
        self.assertEqual(self.client.post("/api/pedidos/", base, format="json").status_code, 400)
        end = self.client.post("/api/enderecos/", {"logradouro": "Rua A", "numero": "10", "bairro": "Centro",
                                                    "cidade": "Natal", "estado": "RN"}, format="json").data["id"]
        r = self.client.post("/api/pedidos/", {**base, "forma_pagamento": "CARTAO", "endereco_id": end}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/pedidos/", {**base, "endereco_id": end}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        pedido = r.data[0]["id"]
        self.assertEqual(self.client.post("/api/pedidos/", {**base, "endereco_id": end}, format="json").status_code, 400)  # carrinho vazio

        # não pode avaliar antes de comprar
        r = self.client.post("/api/avaliacoes/", {"produto": pid, "nota": 5}, format="json")
        self.assertEqual(r.status_code, 400)

        # produtor aceita → estoque baixa; outro produtor não poderia mexer
        self.login("maria")
        self.assertEqual(self.client.post(f"/api/produtor/pedidos/{pedido}/aceitar/").status_code, 200)
        self.assertEqual(Produto.objects.get(pk=pid).estoque, Decimal("5"))
        self.client.post(f"/api/produtor/pedidos/{pedido}/status/", {"status": "EM_PREPARO"}, format="json")
        r = self.client.post(f"/api/produtor/pedidos/{pedido}/status/", {"status": "PRONTO"}, format="json")
        self.assertEqual(r.data["status"], "PRONTO")
        # produtor não conclui pedido com entrega
        r = self.client.post(f"/api/produtor/pedidos/{pedido}/status/", {"status": "CONCLUIDO"}, format="json")
        self.assertEqual(r.status_code, 400)

        # entregador
        self.login("zeca")
        self.assertEqual(self.client.get("/api/entregas/").data["count"], 1)
        self.assertEqual(self.client.post(f"/api/entregas/{pedido}/aceitar/").status_code, 200)
        self.assertEqual(self.client.post(f"/api/entregas/{pedido}/saiu-para-entrega/").data["status"], "EM_ENTREGA")
        self.assertEqual(self.client.post(f"/api/entregas/{pedido}/confirmar/").data["status"], "CONCLUIDO")

        # cliente avalia; não duplica
        self.login("joao")
        self.assertEqual(self.client.post("/api/avaliacoes/", {"produto": pid, "nota": 5, "comentario": "Fresquinha"},
                                          format="json").status_code, 201)
        self.assertEqual(self.client.post("/api/avaliacoes/", {"produto": pid, "nota": 4}, format="json").status_code, 400)
        self.client.credentials()
        self.assertEqual(self.client.get("/api/produtos/").data["results"][0]["nota_media"], 5.0)

        # produtor vê vendas; admin vê indicadores
        self.login("maria")
        self.assertEqual(Decimal(str(self.client.get("/api/produtor/pedidos/vendas/").data["faturamento"])), Decimal("17.50"))
        self.login("admin")
        self.assertEqual(self.client.get("/api/admin/indicadores/").data["vendas_concluidas"], 1)

    def test_cancelamento_devolve_estoque_e_permissoes(self):
        Usuario.objects.get(username="maria").perfil_produtor.__class__.objects.update(status="APROVADO")
        perfil = Usuario.objects.get(username="maria").perfil_produtor
        p = Produto.objects.create(produtor=perfil, categoria=self.cat, nome="Mel", preco="20", estoque="3",
                                   unidade_medida="UNIDADE")
        self.login("joao")
        self.client.post("/api/carrinho/itens/", {"produto": p.id, "quantidade": "2"}, format="json")
        pedido = self.client.post("/api/pedidos/", {"modalidade": "RETIRADA", "forma_pagamento": "DINHEIRO"},
                                  format="json").data[0]["id"]
        self.login("maria")
        self.client.post(f"/api/produtor/pedidos/{pedido}/aceitar/")
        p.refresh_from_db(); self.assertEqual(p.estoque, Decimal("1"))
        self.login("joao")
        self.assertEqual(self.client.post(f"/api/pedidos/{pedido}/cancelar/").data["status"], "CANCELADO")
        p.refresh_from_db(); self.assertEqual(p.estoque, Decimal("3"))
        # cliente não acessa área do produtor/admin; produtor não cadastra categoria
        self.assertEqual(self.client.get("/api/produtor/pedidos/").status_code, 403)
        self.assertEqual(self.client.get("/api/admin/usuarios/").status_code, 403)
        self.login("maria")
        self.assertEqual(self.client.post("/api/categorias/", {"nome": "X"}, format="json").status_code, 403)

    def test_logout_e_recuperacao_de_senha(self):
        tokens = self.login("joao")
        r = self.client.post("/api/auth/logout/", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(r.status_code, 204)
        r = self.client.post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(r.status_code, 401)
        from django.core import mail
        self.client.credentials()
        self.client.post("/api/auth/recuperar-senha/", {"email": "joao@ex.com"}, format="json")
        corpo = mail.outbox[0].body
        uid = corpo.split("uid: ")[1].split()[0]
        token = corpo.split("token: ")[1].split()[0]
        r = self.client.post("/api/auth/redefinir-senha/", {"uid": uid, "token": token, "nova_senha": "OutraSenha-987"},
                             format="json")
        self.assertEqual(r.status_code, 200, r.data)

    def test_checkout_divide_pedidos_por_produtor_e_concorrencia_entrega(self):
        self.registrar("produtor", "pedro", nome_propriedade="Sítio Norte", aceita_dinheiro=True)
        PerfilProdutor.objects.update(status="APROVADO")

        p1 = PerfilProdutor.objects.get(usuario__username="maria")
        p2 = PerfilProdutor.objects.get(usuario__username="pedro")
        prod_a = Produto.objects.create(produtor=p1, categoria=self.cat, nome="Tomate", preco="5.00", estoque="5")
        prod_b = Produto.objects.create(produtor=p2, categoria=self.cat, nome="Banana", preco="4.00", estoque="5")

        self.login("joao")
        end_id = self.client.post(
            "/api/enderecos/",
            {"logradouro": "Rua C", "numero": "5", "bairro": "Centro", "cidade": "Natal", "estado": "RN"},
            format="json",
        ).data["id"]
        self.client.post("/api/carrinho/itens/", {"produto": prod_a.id, "quantidade": "2"}, format="json")
        self.client.post("/api/carrinho/itens/", {"produto": prod_b.id, "quantidade": "3"}, format="json")

        chk = self.client.post(
            "/api/pedidos/",
            {"modalidade": "ENTREGA", "forma_pagamento": "DINHEIRO", "endereco_id": end_id},
            format="json",
        )
        self.assertEqual(chk.status_code, 201)
        self.assertEqual(len(chk.data), 2)

        # Maria aceita seu pedido; outro produtor não pode aceitar o pedido da Maria
        pedido_maria = next(p["id"] for p in chk.data if p["produtor"] == p1.id)
        self.login("pedro")
        self.assertEqual(self.client.post(f"/api/produtor/pedidos/{pedido_maria}/aceitar/").status_code, 404)

        self.login("maria")
        self.assertEqual(self.client.post(f"/api/produtor/pedidos/{pedido_maria}/aceitar/").status_code, 200)

        # Dois entregadores tentando aceitar a mesma entrega
        self.registrar("entregador", "moto2", veiculo="Moto")
        self.login("zeca")
        self.assertEqual(self.client.post(f"/api/entregas/{pedido_maria}/aceitar/").status_code, 200)
        self.login("moto2")
        self.assertEqual(self.client.post(f"/api/entregas/{pedido_maria}/aceitar/").status_code, 400)

    def test_dois_clientes_tentando_comprar_ultima_unidade(self):
        from usuarios.models import PerfilProdutor
        PerfilProdutor.objects.update(status="APROVADO")
        perfil = PerfilProdutor.objects.get(usuario__username="maria")
        ultima = Produto.objects.create(produtor=perfil, categoria=self.cat, nome="Queijo Coalho", preco="25.00", estoque="1")

        self.registrar("cliente", "bia")
        # João e Bia fecham pedidos para a última unidade
        self.login("joao")
        self.client.post("/api/carrinho/itens/", {"produto": ultima.id, "quantidade": "1"}, format="json")
        ped_joao = self.client.post(
            "/api/pedidos/", {"modalidade": "RETIRADA", "forma_pagamento": "DINHEIRO"}, format="json"
        ).data[0]["id"]

        self.login("bia")
        self.client.post("/api/carrinho/itens/", {"produto": ultima.id, "quantidade": "1"}, format="json")
        ped_bia = self.client.post(
            "/api/pedidos/", {"modalidade": "RETIRADA", "forma_pagamento": "DINHEIRO"}, format="json"
        ).data[0]["id"]

        # Ao produtor aceitar o primeiro pedido, o estoque zera e o segundo é bloqueado
        self.login("maria")
        r1 = self.client.post(f"/api/produtor/pedidos/{ped_joao}/aceitar/")
        self.assertEqual(r1.status_code, 200)
        r2 = self.client.post(f"/api/produtor/pedidos/{ped_bia}/aceitar/")
        self.assertEqual(r2.status_code, 400)

        ultima.refresh_from_db()
        self.assertEqual(ultima.estoque, Decimal("0"))


class ConcorrenciaEstoqueTransactionTest(TransactionTestCase):
    def test_concorrencia_simultanea_ultima_unidade_com_threads(self):
        prod_user = Usuario.objects.create_user("prod_conc", "pc@ex.com", PW, tipo=Usuario.Tipo.PRODUTOR)
        perfil = PerfilProdutor.objects.create(
            usuario=prod_user, status=PerfilProdutor.Status.APROVADO, nome_propriedade="Sítio Concorrente"
        )
        c1 = Usuario.objects.create_user("cli_a", "ca@ex.com", PW, tipo=Usuario.Tipo.CLIENTE)
        c2 = Usuario.objects.create_user("cli_b", "cb@ex.com", PW, tipo=Usuario.Tipo.CLIENTE)
        cat = Categoria.objects.create(nome="Grãos")
        produto = Produto.objects.create(produtor=perfil, categoria=cat, nome="Feijão", preco="12.00", estoque="1")

        ped1 = Pedido.objects.create(
            cliente=c1, produtor=perfil, modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO, total=Decimal("12.00"),
        )
        ItemPedido.objects.create(
            pedido=ped1, produto=produto, nome_produto="Feijão",
            unidade_medida="KG", preco_unitario=Decimal("12.00"), quantidade=Decimal("1"),
        )
        ped2 = Pedido.objects.create(
            cliente=c2, produtor=perfil, modalidade=Pedido.Modalidade.RETIRADA,
            forma_pagamento=Pedido.FormaPagamento.DINHEIRO, total=Decimal("12.00"),
        )
        ItemPedido.objects.create(
            pedido=ped2, produto=produto, nome_produto="Feijão",
            unidade_medida="KG", preco_unitario=Decimal("12.00"), quantidade=Decimal("1"),
        )

        barrier = threading.Barrier(2)
        results = []
        lock = threading.Lock()

        def worker(pedido):
            close_old_connections()
            barrier.wait()
            try:
                for attempt in range(10):
                    try:
                        services.mudar_status(pedido, Pedido.Status.ACEITO, prod_user)
                        with lock:
                            results.append("ok")
                        break
                    except OperationalError:
                        # SQLite em memória (cache=shared) não aguarda busy_timeout em SQLITE_LOCKED
                        if connection.vendor != "sqlite" or attempt == 9:
                            raise
                        time.sleep(0.05)
                    except ValidationError:
                        with lock:
                            results.append("blocked")
                        break
            finally:
                close_old_connections()

        t1 = threading.Thread(target=worker, args=(ped1,))
        t2 = threading.Thread(target=worker, args=(ped2,))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(sorted(results), ["blocked", "ok"])
        produto.refresh_from_db()
        self.assertEqual(produto.estoque, Decimal("0"))
